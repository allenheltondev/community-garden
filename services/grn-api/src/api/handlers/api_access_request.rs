//! Approval-gated API access.
//!
//! A grower asks for access, an admin decides, and only then can a key be
//! minted. The key secret is deliberately not created at approval time: the
//! grower claims it themselves from Settings, so the plaintext only ever
//! appears in the requester's browser and never passes through the admin
//! console or a Slack message.

use crate::auth::extract_auth_context;
use crate::db;
use crate::models::api_access_request::{
    AdminApiAccessRequestItem, AdminApiAccessRequestListResponse, ApiAccessDecisionResponse,
    ApiAccessRequestItem, ApiAccessRequestListResponse, CreateApiAccessRequest,
    DecideApiAccessRequest,
};
use crate::models::crop::ErrorResponse;
use aws_config::BehaviorVersion;
use aws_sdk_eventbridge::types::PutEventsRequestEntry;
use lambda_http::{Body, Request, Response};
use serde::Serialize;
use tokio_postgres::Row;
use tracing::{error, info};
use uuid::Uuid;

const MAX_INTEGRATION_NAME_LEN: usize = 120;
const MAX_INTENDED_USE_LEN: usize = 2000;
const MAX_NOTE_LEN: usize = 2000;

pub async fn create_request(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth = extract_auth_context(request)?;
    let user_id = parse_uuid(&auth.user_id, "user id")?;
    let payload: CreateApiAccessRequest = parse_json_body(request)?;

    let integration_name = require_text(
        &payload.integration_name,
        "integrationName",
        MAX_INTEGRATION_NAME_LEN,
    )?;
    let intended_use = require_text(&payload.intended_use, "intendedUse", MAX_INTENDED_USE_LEN)?;
    let contact_email = optional_text(payload.contact_email.as_deref(), 320);

    let client = db::connect().await?;

    // The partial unique index enforces one open request; catching it here
    // turns a constraint violation into an answer the UI can show.
    let existing = client
        .query_opt(
            "select id from api_access_requests where user_id = $1 and status = 'pending'",
            &[&user_id],
        )
        .await
        .map_err(|e| db_error(&e))?;

    if existing.is_some() {
        return json_response(
            409,
            &ErrorResponse {
                error: "You already have an API access request awaiting review".to_string(),
            },
        );
    }

    let row = client
        .query_one(
            "insert into api_access_requests (user_id, integration_name, intended_use, contact_email)
             values ($1, $2, $3, $4)
             returning id, status, integration_name, intended_use, contact_email,
                       decision_note, decided_at, created_at",
            &[&user_id, &integration_name, &intended_use, &contact_email],
        )
        .await
        .map_err(|e| db_error(&e))?;

    let request_id: Uuid = row.get("id");

    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        request_id = %request_id,
        "API access requested"
    );

    emit_access_event(
        "api-access.requested",
        serde_json::json!({
            "requestId": request_id.to_string(),
            "userId": user_id.to_string(),
            "userEmail": auth.email,
            "tier": auth.tier,
            "integrationName": integration_name,
            "intendedUse": intended_use,
            "contactEmail": contact_email,
            "correlationId": correlation_id,
            "occurredAt": chrono::Utc::now().to_rfc3339(),
        }),
    )
    .await;

    json_response(201, &row_to_item(&row, None))
}

pub async fn list_my_requests(
    request: &Request,
    _correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth = extract_auth_context(request)?;
    let user_id = parse_uuid(&auth.user_id, "user id")?;
    let client = db::connect().await?;

    let rows = client
        .query(
            "select r.id, r.status, r.integration_name, r.intended_use, r.contact_email,
                    r.decision_note, r.decided_at, r.created_at,
                    k.id as api_key_id
               from api_access_requests r
               left join api_keys k
                 on k.access_request_id = r.id and k.revoked_at is null
              where r.user_id = $1
              order by r.created_at desc",
            &[&user_id],
        )
        .await
        .map_err(|e| db_error(&e))?;

    json_response(
        200,
        &ApiAccessRequestListResponse {
            items: rows
                .iter()
                .map(|row| {
                    let key_id: Option<Uuid> = row.get("api_key_id");
                    row_to_item(row, key_id)
                })
                .collect(),
        },
    )
}

pub async fn admin_list_requests(
    request: &Request,
    _correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    require_admin(request)?;

    let status = query_param(request, "status").unwrap_or_else(|| "pending".to_string());
    if !matches!(status.as_str(), "pending" | "approved" | "denied") {
        return json_response(
            400,
            &ErrorResponse {
                error: "status must be one of: pending, approved, denied".to_string(),
            },
        );
    }

    let client = db::connect().await?;
    let rows = client
        .query(
            "select r.id, r.status, r.integration_name, r.intended_use, r.contact_email,
                    r.decision_note, r.decided_at, r.created_at,
                    u.id as user_id, u.email::text as user_email,
                    u.display_name as user_display_name, u.tier as user_tier
               from api_access_requests r
               join users u on u.id = r.user_id
              where r.status = $1
              order by r.created_at asc
              limit 100",
            &[&status],
        )
        .await
        .map_err(|e| db_error(&e))?;

    let total: i64 = client
        .query_one(
            "select count(*) from api_access_requests where status = $1",
            &[&status],
        )
        .await
        .map_err(|e| db_error(&e))?
        .get(0);

    json_response(
        200,
        &AdminApiAccessRequestListResponse {
            items: rows.iter().map(row_to_admin_item).collect(),
            total,
        },
    )
}

pub async fn admin_decide(
    request: &Request,
    correlation_id: &str,
    request_id: &str,
    approve: bool,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth = require_admin(request)?;
    let admin_id = parse_uuid(&auth.user_id, "user id")?;
    let id = parse_uuid(request_id, "request id")?;
    let payload: DecideApiAccessRequest =
        parse_json_body(request).unwrap_or(DecideApiAccessRequest { note: None });
    let note = optional_text(payload.note.as_deref(), MAX_NOTE_LEN);

    let client = db::connect().await?;

    // Only a pending request can be decided, so a double-click from two admins
    // cannot overwrite the first decision.
    let status = if approve { "approved" } else { "denied" };
    let updated = client
        .query_opt(
            "update api_access_requests
                set status = $2,
                    decided_at = now(),
                    decided_by = $3,
                    decision_note = $4,
                    updated_at = now()
              where id = $1 and status = 'pending'
              returning id, status, decided_at, user_id, integration_name",
            &[&id, &status, &admin_id, &note],
        )
        .await
        .map_err(|e| db_error(&e))?;

    let Some(row) = updated else {
        return json_response(
            409,
            &ErrorResponse {
                error: "That request has already been decided".to_string(),
            },
        );
    };

    let requester_id: Uuid = row.get("user_id");
    let integration_name: String = row.get("integration_name");

    info!(
        correlation_id = correlation_id,
        request_id = %id,
        admin_id = %admin_id,
        approved = approve,
        "API access request decided"
    );

    emit_access_event(
        if approve {
            "api-access.approved"
        } else {
            "api-access.denied"
        },
        serde_json::json!({
            "requestId": id.to_string(),
            "userId": requester_id.to_string(),
            "integrationName": integration_name,
            "decisionNote": note,
            "correlationId": correlation_id,
            "occurredAt": chrono::Utc::now().to_rfc3339(),
        }),
    )
    .await;

    json_response(
        200,
        &ApiAccessDecisionResponse {
            id: id.to_string(),
            status: row.get("status"),
            // Approval does not mint the key: the grower claims it so the
            // secret never passes through the admin console.
            api_key_id: None,
            decided_at: row
                .get::<_, chrono::DateTime<chrono::Utc>>("decided_at")
                .to_rfc3339(),
        },
    )
}

/// The approved, unclaimed request a grower may mint a key against, if any.
pub async fn claimable_request(
    client: &tokio_postgres::Client,
    user_id: Uuid,
) -> Result<Option<Uuid>, lambda_http::Error> {
    let row = client
        .query_opt(
            "select r.id
               from api_access_requests r
               left join api_keys k
                 on k.access_request_id = r.id and k.revoked_at is null
              where r.user_id = $1
                and r.status = 'approved'
                and k.id is null
              order by r.decided_at asc
              limit 1",
            &[&user_id],
        )
        .await
        .map_err(|e| db_error(&e))?;

    Ok(row.map(|row| row.get("id")))
}

fn row_to_item(row: &Row, api_key_id: Option<Uuid>) -> ApiAccessRequestItem {
    ApiAccessRequestItem {
        id: row.get::<_, Uuid>("id").to_string(),
        status: row.get("status"),
        integration_name: row.get("integration_name"),
        intended_use: row.get("intended_use"),
        contact_email: row.get("contact_email"),
        decision_note: row.get("decision_note"),
        decided_at: row
            .get::<_, Option<chrono::DateTime<chrono::Utc>>>("decided_at")
            .map(|value| value.to_rfc3339()),
        created_at: row
            .get::<_, chrono::DateTime<chrono::Utc>>("created_at")
            .to_rfc3339(),
        api_key_id: api_key_id.map(|value| value.to_string()),
    }
}

fn row_to_admin_item(row: &Row) -> AdminApiAccessRequestItem {
    AdminApiAccessRequestItem {
        id: row.get::<_, Uuid>("id").to_string(),
        status: row.get("status"),
        integration_name: row.get("integration_name"),
        intended_use: row.get("intended_use"),
        contact_email: row.get("contact_email"),
        decision_note: row.get("decision_note"),
        decided_at: row
            .get::<_, Option<chrono::DateTime<chrono::Utc>>>("decided_at")
            .map(|value| value.to_rfc3339()),
        created_at: row
            .get::<_, chrono::DateTime<chrono::Utc>>("created_at")
            .to_rfc3339(),
        user_id: row.get::<_, Uuid>("user_id").to_string(),
        user_email: row.get("user_email"),
        user_display_name: row.get("user_display_name"),
        user_tier: row.get("user_tier"),
    }
}

fn require_admin(request: &Request) -> Result<crate::auth::AuthContext, lambda_http::Error> {
    let auth = extract_auth_context(request)?;
    if !auth.is_admin {
        // The "Forbidden:" prefix is what the router maps to a 403; without it
        // a non-admin caller gets a 500 instead of a refusal.
        return Err(lambda_http::Error::from(
            "Forbidden: admin access is required".to_string(),
        ));
    }
    Ok(auth)
}

fn require_text(value: &str, field: &str, max_len: usize) -> Result<String, lambda_http::Error> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(lambda_http::Error::from(format!("{field} is required")));
    }
    if trimmed.len() > max_len {
        return Err(lambda_http::Error::from(format!(
            "{field} must be {max_len} characters or fewer"
        )));
    }
    Ok(trimmed.to_string())
}

fn optional_text(value: Option<&str>, max_len: usize) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(max_len).collect())
}

async fn emit_access_event(detail_type: &str, detail: serde_json::Value) {
    let event_bus_name = std::env::var("EVENT_BUS_NAME").unwrap_or_else(|_| "default".to_string());
    let config = aws_config::defaults(BehaviorVersion::latest()).load().await;
    let client = aws_sdk_eventbridge::Client::new(&config);

    let entry = PutEventsRequestEntry::builder()
        .event_bus_name(event_bus_name)
        .source("grn.api-access")
        .detail_type(detail_type)
        .detail(detail.to_string())
        .build();

    match client.put_events().entries(entry).send().await {
        Ok(response) if response.failed_entry_count() > 0 => {
            error!(detail_type = detail_type, "API access event rejected");
        }
        Err(error) => {
            error!(detail_type = detail_type, error = %error, "Failed to emit API access event");
        }
        _ => {}
    }
}

/// Split a query string by hand, matching the other handlers: the crate has no
/// URL-parsing dependency and these values are simple enums.
fn query_param(request: &Request, name: &str) -> Option<String> {
    let query = request.uri().query()?;
    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        if key == name && !value.is_empty() {
            return Some(value.to_string());
        }
    }
    None
}

fn parse_uuid(value: &str, field_name: &str) -> Result<Uuid, lambda_http::Error> {
    Uuid::parse_str(value)
        .map_err(|_| lambda_http::Error::from(format!("{field_name} must be a valid UUID")))
}

fn parse_json_body<T: serde::de::DeserializeOwned>(
    request: &Request,
) -> Result<T, lambda_http::Error> {
    match request.body() {
        Body::Text(text) => serde_json::from_str::<T>(text)
            .map_err(|e| lambda_http::Error::from(format!("Invalid JSON body: {e}"))),
        Body::Binary(bytes) => serde_json::from_slice::<T>(bytes)
            .map_err(|e| lambda_http::Error::from(format!("Invalid JSON body: {e}"))),
        Body::Empty => Err(lambda_http::Error::from(
            "Request body is required".to_string(),
        )),
    }
}

fn json_response<T: Serialize>(
    status: u16,
    payload: &T,
) -> Result<Response<Body>, lambda_http::Error> {
    let body = serde_json::to_string(payload)
        .map_err(|e| lambda_http::Error::from(format!("Failed to serialize response: {e}")))?;

    Response::builder()
        .status(status)
        .header("Content-Type", "application/json")
        .body(Body::Text(body))
        .map_err(|e| lambda_http::Error::from(e.to_string()))
}

fn db_error(error: &tokio_postgres::Error) -> lambda_http::Error {
    error!(error = %error, "Database error in api access requests");
    lambda_http::Error::from(format!("Database error: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn require_text_trims_and_accepts() {
        assert_eq!(
            require_text("  Harvest Sync  ", "integrationName", 120).ok(),
            Some("Harvest Sync".to_string())
        );
    }

    #[test]
    fn require_text_rejects_blank() {
        assert!(require_text("   ", "integrationName", 120).is_err());
        assert!(require_text("", "intendedUse", 120).is_err());
    }

    #[test]
    fn require_text_rejects_overlong_input() {
        let long = "a".repeat(121);
        assert!(require_text(&long, "integrationName", 120).is_err());
    }

    #[test]
    fn optional_text_drops_blanks_and_keeps_content() {
        assert_eq!(
            optional_text(Some("  hi@example.com "), 320),
            Some("hi@example.com".to_string())
        );
        assert_eq!(optional_text(Some("   "), 320), None);
        assert_eq!(optional_text(None, 320), None);
    }

    #[test]
    fn optional_text_truncates_rather_than_rejecting() {
        let long = "a".repeat(50);
        assert_eq!(
            optional_text(Some(&long), 10).map(|value| value.len()),
            Some(10)
        );
    }
}
