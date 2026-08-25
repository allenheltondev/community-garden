use crate::auth::{extract_auth_context_with_fallback, require_grower};
use crate::db;
use crate::handlers::crop::error_response;
use aws_config::BehaviorVersion;
use aws_sdk_eventbridge::types::PutEventsRequestEntry;
use aws_sdk_s3::presigning::PresigningConfig;
use chrono::{Datelike, NaiveDate, Utc};
use lambda_http::{Body, Request, Response};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::time::Duration;
use tokio_postgres::Row;
use tracing::{error, info, warn};
use uuid::Uuid;

const MIN_SEASON_YEAR: i32 = 2000;
const MAX_SEASON_YEAR: i32 = 2100;
const JOURNAL_PHOTO_PREFIX: &str = "journal-photos";
const MAX_PHOTO_BYTES: u64 = 5 * 1024 * 1024;
const PHOTO_URL_EXPIRES_SECONDS: u64 = 900;
const ALLOWED_PHOTO_CONTENT_TYPES: [&str; 3] = ["image/jpeg", "image/png", "image/webp"];

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub id: String,
    pub kind: String,
    pub occurred_at: String,
    pub title: String,
    pub detail: Option<String>,
    pub source_type: String,
    pub source_id: String,
    pub source_path: Option<String>,
    pub is_private: bool,
    pub manual: bool,
    pub photo_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalSummary {
    pub season: i32,
    pub planted_count: usize,
    pub harvest_count: usize,
    pub reminder_completion_count: usize,
    pub completed_share_count: usize,
    pub food_shared_before_expiry_count: usize,
    pub active_month_count: usize,
    pub explanation: String,
    pub explanation_source: String,
    pub is_ai_generated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalResponse {
    pub season: i32,
    pub entries: Vec<JournalEntry>,
    pub summary: JournalSummary,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteRequest {
    pub occurred_on: String,
    pub title: String,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub photo_key: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoUploadRequest {
    pub content_type: String,
    pub content_length: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoUploadHeaders {
    #[serde(rename = "Content-Type")]
    pub content_type: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoUploadResponse {
    pub upload_url: String,
    pub method: String,
    pub headers: PhotoUploadHeaders,
    pub photo_key: String,
    pub expires_in_seconds: u64,
}

#[derive(Debug)]
struct NormalizedNote {
    occurred_on: NaiveDate,
    title: String,
    body: Option<String>,
    photo_key: Option<String>,
}

#[allow(clippy::too_many_lines)]
pub async fn list_journal(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let user_id = authenticated_grower_id(request).await?;
    let season = parse_season(request.uri().query())?;
    let (season_start, season_end) = season_bounds(season)?;
    let client = db::connect().await?;
    let mut entries = Vec::new();

    let crop_rows = client
        .query(
            "
            select g.id, g.crop_name, g.nickname, g.bed_id, b.name as bed_name,
                   g.planting_date, g.created_at
              from grower_crop_library g
              left join garden_beds b on b.id = g.bed_id and b.user_id = g.user_id
             where g.user_id = $1
               and coalesce(g.planting_date, g.created_at::date) >= $2
               and coalesce(g.planting_date, g.created_at::date) < $3
            ",
            &[&user_id, &season_start, &season_end],
        )
        .await
        .map_err(|event| db_error(&event))?;
    entries.extend(crop_rows.iter().map(crop_entry));

    let bed_rows = client
        .query(
            "
            select id, name, created_at
              from garden_beds
             where user_id = $1
               and created_at >= $2::date
               and created_at < $3::date
            ",
            &[&user_id, &season_start, &season_end],
        )
        .await
        .map_err(|event| db_error(&event))?;
    entries.extend(bed_rows.iter().map(bed_entry));

    let harvest_rows = client
        .query(
            "
            select h.id, h.grower_crop_id, h.harvested_on, h.created_at,
                   g.crop_name, g.nickname
              from crop_harvests h
              inner join grower_crop_library g on g.id = h.grower_crop_id
             where h.user_id = $1
               and h.harvested_on >= $2
               and h.harvested_on < $3
            ",
            &[&user_id, &season_start, &season_end],
        )
        .await
        .map_err(|event| db_error(&event))?;
    entries.extend(harvest_rows.iter().map(harvest_entry));

    let reminder_rows = client
        .query(
            "
            select c.id, c.reminder_id, c.completed_at, r.title, r.reminder_type
              from reminder_completions c
              inner join reminder_rules r on r.id = c.reminder_id
             where c.user_id = $1
               and c.completed_at >= $2::date
               and c.completed_at < $3::date
            ",
            &[&user_id, &season_start, &season_end],
        )
        .await
        .map_err(|event| db_error(&event))?;
    entries.extend(reminder_rows.iter().map(reminder_entry));

    let share_rows = client
        .query(
            "
            select c.id, c.completed_at, c.claimer_id,
                   l.id as listing_id, l.user_id as listing_owner_id,
                   l.title, l.available_end,
                   (l.user_id = $1 and c.completed_at <= l.available_end) as shared_before_expiry
              from claims c
              inner join surplus_listings l on l.id = c.listing_id
             where c.status::text = 'completed'
               and c.completed_at >= $2::date
               and c.completed_at < $3::date
               and (c.claimer_id = $1 or l.user_id = $1)
            ",
            &[&user_id, &season_start, &season_end],
        )
        .await
        .map_err(|event| db_error(&event))?;
    let food_shared_before_expiry_count = share_rows
        .iter()
        .filter(|row| row.get::<_, Option<bool>>("shared_before_expiry") == Some(true))
        .count();
    entries.extend(share_rows.iter().map(|row| share_entry(row, user_id)));

    let note_rows = client
        .query(
            "
            select id, occurred_on, title, body, photo_key, created_at
              from garden_journal_notes
             where user_id = $1
               and occurred_on >= $2
               and occurred_on < $3
               and deleted_at is null
             order by occurred_on desc, id desc
            ",
            &[&user_id, &season_start, &season_end],
        )
        .await
        .map_err(|event| db_error(&event))?;
    entries.extend(note_entries_with_urls(&note_rows, user_id).await);

    let entries = dedupe_and_sort(entries);
    let summary = summarize_entries(season, &entries, food_shared_before_expiry_count);

    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        season,
        entry_count = entries.len(),
        "Built private garden journal from source records"
    );

    json_response(
        200,
        &JournalResponse {
            season,
            entries,
            summary,
        },
    )
}

pub async fn create_note(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let user_id = authenticated_grower_id(request).await?;
    let payload: CreateNoteRequest = parse_json_body(request)?;
    let normalized = normalize_note(&payload, user_id)?;
    let Some(idempotency_key) = extract_idempotency_key(request) else {
        return error_response(400, "Idempotency-Key header is required");
    };
    let note_id = derive_note_id(user_id, &idempotency_key);
    let client = db::connect().await?;

    let inserted = client
        .query_opt(
            "
            insert into garden_journal_notes
              (id, user_id, occurred_on, title, body, photo_key)
            values ($1, $2, $3, $4, $5, $6)
            on conflict (id) do nothing
            returning id, occurred_on, title, body, photo_key, created_at
            ",
            &[
                &note_id,
                &user_id,
                &normalized.occurred_on,
                &normalized.title,
                &normalized.body,
                &normalized.photo_key,
            ],
        )
        .await
        .map_err(|event| db_error(&event))?;

    let (row, is_new) = if let Some(row) = inserted {
        (row, true)
    } else {
        let existing = client
            .query_opt(
                "
                select id, occurred_on, title, body, photo_key, created_at
                  from garden_journal_notes
                 where id = $1 and user_id = $2 and deleted_at is null
                ",
                &[&note_id, &user_id],
            )
            .await
            .map_err(|event| db_error(&event))?;
        let Some(row) = existing else {
            return error_response(409, "Idempotency key collision with another journal note");
        };
        if !note_matches(&row, &normalized) {
            return error_response(
                409,
                "Idempotency key was already used for different note content",
            );
        }
        (row, false)
    };

    if is_new {
        emit_note_event_best_effort("journal.note.created", note_id, user_id, correlation_id).await;
    }
    let entry = note_entry_with_url(&row, user_id).await;
    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        note_id = %note_id,
        idempotency_replay = !is_new,
        "Saved private garden journal note"
    );
    json_response(201, &entry)
}

pub async fn delete_note(
    request: &Request,
    correlation_id: &str,
    note_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let user_id = authenticated_grower_id(request).await?;
    let Ok(note_id) = Uuid::parse_str(note_id) else {
        return error_response(400, "noteId must be a valid UUID");
    };
    let client = db::connect().await?;
    let deleted = client
        .query_opt(
            "
            update garden_journal_notes
               set deleted_at = now(), updated_at = now()
             where id = $1 and user_id = $2 and deleted_at is null
            returning photo_key
            ",
            &[&note_id, &user_id],
        )
        .await
        .map_err(|event| db_error(&event))?;
    let Some(row) = deleted else {
        return error_response(404, "Journal note not found");
    };

    if let Some(photo_key) = row.get::<_, Option<String>>("photo_key") {
        delete_photo_best_effort(&photo_key, correlation_id).await;
    }
    emit_note_event_best_effort("journal.note.deleted", note_id, user_id, correlation_id).await;
    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        note_id = %note_id,
        "Deleted private garden journal note"
    );

    Response::builder()
        .status(204)
        .body(Body::Empty)
        .map_err(|event| lambda_http::Error::from(event.to_string()))
}

pub async fn create_photo_upload_url(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let user_id = authenticated_grower_id(request).await?;
    let payload: PhotoUploadRequest = parse_json_body(request)?;
    let content_type = payload.content_type.trim();
    if !ALLOWED_PHOTO_CONTENT_TYPES.contains(&content_type) {
        return error_response(
            400,
            "contentType must be one of image/jpeg, image/png, image/webp",
        );
    }
    if payload.content_length == 0 || payload.content_length > MAX_PHOTO_BYTES {
        return error_response(400, "contentLength must be between 1 byte and 5 MB");
    }
    let bucket = env::var("MEDIA_BUCKET_NAME")
        .map_err(|_| lambda_http::Error::from("MEDIA_BUCKET_NAME is not configured"))?;
    let photo_key = format!("{JOURNAL_PHOTO_PREFIX}/{user_id}/{}", Uuid::new_v4());
    let config = aws_config::defaults(BehaviorVersion::latest()).load().await;
    let s3 = aws_sdk_s3::Client::new(&config);
    let presigning = PresigningConfig::expires_in(Duration::from_secs(PHOTO_URL_EXPIRES_SECONDS))
        .map_err(|event| lambda_http::Error::from(event.to_string()))?;
    let content_length = i64::try_from(payload.content_length)
        .map_err(|_| lambda_http::Error::from("contentLength is out of range"))?;
    let presigned = s3
        .put_object()
        .bucket(bucket)
        .key(&photo_key)
        .content_type(content_type)
        .content_length(content_length)
        .presigned(presigning)
        .await
        .map_err(|event| {
            lambda_http::Error::from(format!("Failed to presign journal photo upload: {event}"))
        })?;

    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        photo_key = photo_key.as_str(),
        "Issued private journal photo upload URL"
    );
    json_response(
        201,
        &PhotoUploadResponse {
            upload_url: presigned.uri().to_string(),
            method: "PUT".to_string(),
            headers: PhotoUploadHeaders {
                content_type: content_type.to_string(),
            },
            photo_key,
            expires_in_seconds: PHOTO_URL_EXPIRES_SECONDS,
        },
    )
}

fn crop_entry(row: &Row) -> JournalEntry {
    let crop_id = row.get::<_, Uuid>("id").to_string();
    let crop_name = display_name(
        row.get::<_, Option<String>>("nickname"),
        row.get("crop_name"),
    );
    let planting_date = row.get::<_, Option<NaiveDate>>("planting_date");
    let occurred_at = planting_date.map_or_else(
        || {
            row.get::<_, chrono::DateTime<Utc>>("created_at")
                .to_rfc3339()
        },
        |date| date.to_string(),
    );
    let kind = if planting_date.is_some() {
        "planted"
    } else {
        "planned"
    };
    let detail = row
        .get::<_, Option<String>>("bed_name")
        .map(|bed| format!("Garden record linked to {bed}."));
    JournalEntry {
        id: format!("crop:{crop_id}:{kind}:{occurred_at}"),
        kind: kind.to_string(),
        occurred_at,
        title: if kind == "planted" {
            format!("Planted {crop_name}")
        } else {
            format!("Added {crop_name} to the garden")
        },
        detail,
        source_type: "crop".to_string(),
        source_id: crop_id.clone(),
        source_path: Some(format!("/garden/plants?crop={crop_id}")),
        is_private: true,
        manual: false,
        photo_url: None,
    }
}

fn bed_entry(row: &Row) -> JournalEntry {
    let bed_id = row.get::<_, Uuid>("id").to_string();
    let occurred_at = row
        .get::<_, chrono::DateTime<Utc>>("created_at")
        .to_rfc3339();
    JournalEntry {
        id: format!("bed:{bed_id}:created"),
        kind: "garden".to_string(),
        occurred_at,
        title: format!("Created {}", row.get::<_, String>("name")),
        detail: Some("A garden bed was added to the map.".to_string()),
        source_type: "bed".to_string(),
        source_id: bed_id.clone(),
        source_path: Some(format!("/garden?bed={bed_id}")),
        is_private: true,
        manual: false,
        photo_url: None,
    }
}

fn harvest_entry(row: &Row) -> JournalEntry {
    let harvest_id = row.get::<_, Uuid>("id").to_string();
    let crop_id = row.get::<_, Uuid>("grower_crop_id").to_string();
    let crop_name = display_name(
        row.get::<_, Option<String>>("nickname"),
        row.get("crop_name"),
    );
    JournalEntry {
        id: format!("harvest:{harvest_id}"),
        kind: "harvest".to_string(),
        occurred_at: row.get::<_, NaiveDate>("harvested_on").to_string(),
        title: format!("Harvested {crop_name}"),
        detail: Some("A harvest record was saved. Open it for the recorded details.".to_string()),
        source_type: "harvest".to_string(),
        source_id: harvest_id.clone(),
        source_path: Some(format!(
            "/garden/plants?crop={crop_id}&action=harvest&harvest={harvest_id}"
        )),
        is_private: true,
        manual: false,
        photo_url: None,
    }
}

fn reminder_entry(row: &Row) -> JournalEntry {
    let completion_id = row.get::<_, Uuid>("id").to_string();
    let reminder_id = row.get::<_, Uuid>("reminder_id").to_string();
    JournalEntry {
        id: format!("reminder-completion:{completion_id}"),
        kind: "reminder".to_string(),
        occurred_at: row
            .get::<_, chrono::DateTime<Utc>>("completed_at")
            .to_rfc3339(),
        title: format!("Completed {}", row.get::<_, String>("title")),
        detail: Some(format!(
            "{} reminder completed.",
            row.get::<_, String>("reminder_type")
        )),
        source_type: "reminder".to_string(),
        source_id: reminder_id.clone(),
        source_path: Some(format!("/today/reminders?reminder={reminder_id}")),
        is_private: true,
        manual: false,
        photo_url: None,
    }
}

fn share_entry(row: &Row, user_id: Uuid) -> JournalEntry {
    let claim_id = row.get::<_, Uuid>("id").to_string();
    let listing_id = row.get::<_, Uuid>("listing_id").to_string();
    let is_owner = row.get::<_, Uuid>("listing_owner_id") == user_id;
    let title = row
        .get::<_, Option<String>>("title")
        .unwrap_or_else(|| "shared food".to_string());
    JournalEntry {
        id: format!("share:{claim_id}:completed"),
        kind: "share".to_string(),
        occurred_at: row
            .get::<_, chrono::DateTime<Utc>>("completed_at")
            .to_rfc3339(),
        title: format!("Pickup completed for {title}"),
        detail: Some("A neighbor pickup was completed successfully.".to_string()),
        source_type: "share".to_string(),
        source_id: claim_id.clone(),
        source_path: Some(if is_owner {
            format!("/share/listings?listing={listing_id}&claim={claim_id}")
        } else {
            format!("/share/find?claim={claim_id}")
        }),
        is_private: true,
        manual: false,
        photo_url: None,
    }
}

async fn note_entries_with_urls(rows: &[Row], user_id: Uuid) -> Vec<JournalEntry> {
    let mut entries = Vec::with_capacity(rows.len());
    for row in rows {
        entries.push(note_entry_with_url(row, user_id).await);
    }
    entries
}

async fn note_entry_with_url(row: &Row, user_id: Uuid) -> JournalEntry {
    let note_id = row.get::<_, Uuid>("id").to_string();
    let photo_url = if let Some(photo_key) = row.get::<_, Option<String>>("photo_key") {
        if validate_photo_key(&photo_key, user_id).is_ok() {
            presign_photo_get(&photo_key).await
        } else {
            warn!(
                note_id = note_id.as_str(),
                "Ignored out-of-scope journal photo key"
            );
            None
        }
    } else {
        None
    };
    JournalEntry {
        id: format!("note:{note_id}"),
        kind: "note".to_string(),
        occurred_at: row.get::<_, NaiveDate>("occurred_on").to_string(),
        title: row.get("title"),
        detail: row.get("body"),
        source_type: "note".to_string(),
        source_id: note_id,
        source_path: None,
        is_private: true,
        manual: true,
        photo_url,
    }
}

async fn presign_photo_get(photo_key: &str) -> Option<String> {
    let bucket = env::var("MEDIA_BUCKET_NAME").ok()?;
    let config = aws_config::defaults(BehaviorVersion::latest()).load().await;
    let s3 = aws_sdk_s3::Client::new(&config);
    let presigning =
        PresigningConfig::expires_in(Duration::from_secs(PHOTO_URL_EXPIRES_SECONDS)).ok()?;
    match s3
        .get_object()
        .bucket(bucket)
        .key(photo_key)
        .presigned(presigning)
        .await
    {
        Ok(value) => Some(value.uri().to_string()),
        Err(event) => {
            warn!(error = %event, "Could not presign private journal photo read");
            None
        }
    }
}

async fn delete_photo_best_effort(photo_key: &str, correlation_id: &str) {
    let Ok(bucket) = env::var("MEDIA_BUCKET_NAME") else {
        return;
    };
    let config = aws_config::defaults(BehaviorVersion::latest()).load().await;
    let s3 = aws_sdk_s3::Client::new(&config);
    if let Err(event) = s3
        .delete_object()
        .bucket(bucket)
        .key(photo_key)
        .send()
        .await
    {
        error!(
            correlation_id = correlation_id,
            photo_key = photo_key,
            error = %event,
            "Failed to delete journal photo after note deletion"
        );
    }
}

fn summarize_entries(
    season: i32,
    entries: &[JournalEntry],
    food_shared_before_expiry_count: usize,
) -> JournalSummary {
    let mut active_months = BTreeSet::new();
    for entry in entries {
        if let Some(month) = entry.occurred_at.get(0..7) {
            active_months.insert(month.to_string());
        }
    }
    JournalSummary {
        season,
        planted_count: entries.iter().filter(|entry| entry.kind == "planted").count(),
        harvest_count: entries.iter().filter(|entry| entry.kind == "harvest").count(),
        reminder_completion_count: entries
            .iter()
            .filter(|entry| entry.kind == "reminder")
            .count(),
        completed_share_count: entries.iter().filter(|entry| entry.kind == "share").count(),
        food_shared_before_expiry_count,
        active_month_count: active_months.len(),
        explanation: "Built only from records saved in GRN. Regenerating this summary does not change crops, harvests, reminders, offers, or pickups.".to_string(),
        explanation_source: "recorded_facts".to_string(),
        is_ai_generated: false,
    }
}

fn dedupe_and_sort(entries: Vec<JournalEntry>) -> Vec<JournalEntry> {
    let mut by_id = BTreeMap::new();
    for entry in entries {
        by_id.entry(entry.id.clone()).or_insert(entry);
    }
    let mut entries = by_id.into_values().collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        right
            .occurred_at
            .cmp(&left.occurred_at)
            .then_with(|| left.id.cmp(&right.id))
    });
    entries
}

fn normalize_note(
    payload: &CreateNoteRequest,
    user_id: Uuid,
) -> Result<NormalizedNote, lambda_http::Error> {
    let occurred_on = NaiveDate::parse_from_str(payload.occurred_on.trim(), "%Y-%m-%d")
        .map_err(|_| lambda_http::Error::from("occurredOn must use YYYY-MM-DD"))?;
    if !(MIN_SEASON_YEAR..=MAX_SEASON_YEAR).contains(&occurred_on.year()) {
        return Err(lambda_http::Error::from(
            "occurredOn year must be between 2000 and 2100",
        ));
    }
    let title = payload.title.trim().to_string();
    if title.is_empty() || title.chars().count() > 120 {
        return Err(lambda_http::Error::from(
            "title must be between 1 and 120 characters",
        ));
    }
    let body = payload
        .body
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);
    if body
        .as_ref()
        .is_some_and(|value| value.chars().count() > 2000)
    {
        return Err(lambda_http::Error::from(
            "body must be 2000 characters or fewer",
        ));
    }
    let photo_key = payload
        .photo_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);
    if let Some(key) = photo_key.as_deref() {
        validate_photo_key(key, user_id)?;
    }
    Ok(NormalizedNote {
        occurred_on,
        title,
        body,
        photo_key,
    })
}

fn validate_photo_key(photo_key: &str, user_id: Uuid) -> Result<(), lambda_http::Error> {
    let expected = format!("{JOURNAL_PHOTO_PREFIX}/{user_id}/");
    if !photo_key.starts_with(&expected) || photo_key.contains("..") {
        return Err(lambda_http::Error::from(
            "photoKey must reference your private journal photo",
        ));
    }
    Ok(())
}

fn note_matches(row: &Row, normalized: &NormalizedNote) -> bool {
    row.get::<_, NaiveDate>("occurred_on") == normalized.occurred_on
        && row.get::<_, String>("title") == normalized.title
        && row.get::<_, Option<String>>("body") == normalized.body
        && row.get::<_, Option<String>>("photo_key") == normalized.photo_key
}

fn parse_season(query: Option<&str>) -> Result<i32, lambda_http::Error> {
    let default = Utc::now().year();
    let season = query
        .and_then(|query| {
            query.split('&').find_map(|pair| {
                let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
                (key == "season").then_some(value)
            })
        })
        .filter(|value| !value.is_empty())
        .map_or(Ok(default), |value| {
            value
                .parse::<i32>()
                .map_err(|_| lambda_http::Error::from("season must be a four-digit year"))
        })?;
    if !(MIN_SEASON_YEAR..=MAX_SEASON_YEAR).contains(&season) {
        return Err(lambda_http::Error::from(
            "season must be between 2000 and 2100",
        ));
    }
    Ok(season)
}

fn season_bounds(season: i32) -> Result<(NaiveDate, NaiveDate), lambda_http::Error> {
    let start = NaiveDate::from_ymd_opt(season, 1, 1)
        .ok_or_else(|| lambda_http::Error::from("Invalid season start"))?;
    let end = NaiveDate::from_ymd_opt(season + 1, 1, 1)
        .ok_or_else(|| lambda_http::Error::from("Invalid season end"))?;
    Ok((start, end))
}

fn extract_idempotency_key(request: &Request) -> Option<String> {
    request
        .headers()
        .get("Idempotency-Key")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn derive_note_id(user_id: Uuid, idempotency_key: &str) -> Uuid {
    let mut hasher = Sha256::new();
    hasher.update(user_id.as_bytes());
    hasher.update(b":journal-note:");
    hasher.update(idempotency_key.as_bytes());
    let digest = hasher.finalize();
    let mut bytes = [0_u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Uuid::from_bytes(bytes)
}

async fn authenticated_grower_id(request: &Request) -> Result<Uuid, lambda_http::Error> {
    let auth = extract_auth_context_with_fallback(request).await?;
    require_grower(&auth)?;
    Uuid::parse_str(&auth.user_id).map_err(|_| lambda_http::Error::from("Invalid user ID format"))
}

async fn emit_note_event_best_effort(
    detail_type: &str,
    note_id: Uuid,
    user_id: Uuid,
    correlation_id: &str,
) {
    if let Err(event) = emit_note_event(detail_type, note_id, user_id, correlation_id).await {
        error!(
            correlation_id = correlation_id,
            note_id = %note_id,
            detail_type = detail_type,
            error = %event,
            "Failed to emit journal note event after successful write"
        );
    }
}

async fn emit_note_event(
    detail_type: &str,
    note_id: Uuid,
    user_id: Uuid,
    correlation_id: &str,
) -> Result<(), lambda_http::Error> {
    let event_bus_name = env::var("EVENT_BUS_NAME").unwrap_or_else(|_| "default".to_string());
    let detail = serde_json::json!({
        "noteId": note_id,
        "userId": user_id,
        "correlationId": correlation_id,
        "occurredAt": Utc::now().to_rfc3339(),
    });
    let config = aws_config::defaults(BehaviorVersion::latest()).load().await;
    let events = aws_sdk_eventbridge::Client::new(&config);
    let entry = PutEventsRequestEntry::builder()
        .event_bus_name(event_bus_name)
        .source("grn.api")
        .detail_type(detail_type)
        .detail(detail.to_string())
        .build();
    let response = events
        .put_events()
        .entries(entry)
        .send()
        .await
        .map_err(|event| {
            lambda_http::Error::from(format!("Failed to emit journal event: {event}"))
        })?;
    if response.failed_entry_count() > 0 {
        return Err(lambda_http::Error::from(
            "Failed to emit journal event: one or more entries were rejected",
        ));
    }
    Ok(())
}

fn display_name(nickname: Option<String>, crop_name: String) -> String {
    nickname
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(crop_name)
}

fn parse_json_body<T: serde::de::DeserializeOwned>(
    request: &Request,
) -> Result<T, lambda_http::Error> {
    match request.body() {
        Body::Text(text) => serde_json::from_str(text)
            .map_err(|event| lambda_http::Error::from(format!("Invalid JSON body: {event}"))),
        Body::Binary(bytes) => serde_json::from_slice(bytes)
            .map_err(|event| lambda_http::Error::from(format!("Invalid JSON body: {event}"))),
        Body::Empty => Err(lambda_http::Error::from("Request body is required")),
    }
}

fn json_response<T: Serialize>(
    status: u16,
    payload: &T,
) -> Result<Response<Body>, lambda_http::Error> {
    let body = serde_json::to_string(payload)
        .map_err(|event| lambda_http::Error::from(event.to_string()))?;
    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::from(body))
        .map_err(|event| lambda_http::Error::from(event.to_string()))
}

fn db_error(event: &tokio_postgres::Error) -> lambda_http::Error {
    lambda_http::Error::from(format!("Database error: {event}"))
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    fn entry(id: &str, kind: &str, occurred_at: &str) -> JournalEntry {
        JournalEntry {
            id: id.to_string(),
            kind: kind.to_string(),
            occurred_at: occurred_at.to_string(),
            title: "Fact".to_string(),
            detail: None,
            source_type: kind.to_string(),
            source_id: id.to_string(),
            source_path: Some("/garden".to_string()),
            is_private: true,
            manual: false,
            photo_url: None,
        }
    }

    #[test]
    fn season_parser_accepts_supported_year_and_rejects_invalid_values() {
        assert_eq!(parse_season(Some("season=2026")).unwrap(), 2026);
        assert!(parse_season(Some("season=1999")).is_err());
        assert!(parse_season(Some("season=summer")).is_err());
    }

    #[test]
    fn deterministic_note_id_is_stable_per_user_and_key() {
        let user = Uuid::new_v4();
        assert_eq!(derive_note_id(user, "retry"), derive_note_id(user, "retry"));
        assert_ne!(derive_note_id(user, "retry"), derive_note_id(user, "new"));
    }

    #[test]
    fn note_validation_enforces_private_photo_ownership() {
        let user = Uuid::new_v4();
        let valid = CreateNoteRequest {
            occurred_on: "2026-07-15".to_string(),
            title: "First tomato".to_string(),
            body: Some("Spotted the first ripe fruit.".to_string()),
            photo_key: Some(format!("journal-photos/{user}/photo")),
        };
        assert!(normalize_note(&valid, user).is_ok());
        let wrong_user = Uuid::new_v4();
        assert!(normalize_note(&valid, wrong_user).is_err());
    }

    #[test]
    fn replayed_source_entries_are_deduplicated_and_sorted() {
        let repeated = entry("harvest:1", "harvest", "2026-06-01");
        let result = dedupe_and_sort(vec![
            repeated.clone(),
            repeated,
            entry("crop:1", "planted", "2026-07-01"),
        ]);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].id, "crop:1");
        assert_eq!(result[1].source_type, "harvest");
        assert_eq!(result[1].source_path.as_deref(), Some("/garden"));
        assert!(result[1].is_private);
    }

    #[test]
    fn summary_uses_recorded_facts_without_volume_or_ai_scoring() {
        let entries = vec![
            entry("crop:1", "planted", "2026-04-01"),
            entry("harvest:1", "harvest", "2026-07-01"),
            entry("share:1", "share", "2026-07-15"),
            entry("reminder:1", "reminder", "2026-08-01"),
        ];
        let summary = summarize_entries(2026, &entries, 1);
        assert_eq!(summary.completed_share_count, 1);
        assert_eq!(summary.food_shared_before_expiry_count, 1);
        assert!(!summary.is_ai_generated);
        assert_eq!(summary.explanation_source, "recorded_facts");
        assert!(!summary.explanation.to_lowercase().contains("yield"));
    }
    /// The presigned upload tells the caller which header to set, so the key
    /// has to be `Content-Type` verbatim. `PhotoUploadHeaders` carries an
    /// explicit rename that overrides the struct's camelCase renaming, and the
    /// published `OpenAPI` schema documents it that way — this pins the wire
    /// format so the two cannot drift apart silently.
    #[test]
    fn photo_upload_headers_serialize_content_type_verbatim() {
        let response = PhotoUploadResponse {
            upload_url: "https://example.test/upload".to_string(),
            method: "PUT".to_string(),
            headers: PhotoUploadHeaders {
                content_type: "image/jpeg".to_string(),
            },
            photo_key: "journal/photo/abc".to_string(),
            expires_in_seconds: 900,
        };

        // unwrap_or_default matches the idiom in garden_share's serialization
        // tests; a failure yields Null and the assertions below fail loudly.
        let json = serde_json::to_value(&response).unwrap_or_default();

        assert_eq!(json["headers"]["Content-Type"], "image/jpeg");
        assert!(json["headers"].get("contentType").is_none());
        // The rest of the payload stays camelCase, so the rename is scoped.
        assert_eq!(json["uploadUrl"], "https://example.test/upload");
        assert_eq!(json["photoKey"], "journal/photo/abc");
        assert_eq!(json["expiresInSeconds"], 900);
    }
}
