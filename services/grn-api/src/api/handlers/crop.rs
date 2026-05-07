use crate::auth::{extract_auth_context_with_fallback, require_grower};
use crate::db;
use crate::models::crop::{ErrorResponse, GrowerCropItem, UpsertGrowerCropRequest};
use chrono::NaiveDate;
use lambda_http::{Body, Request, Response};
use serde::Serialize;
use tokio_postgres::{Client, Row};
use tracing::info;
use uuid::Uuid;

const ALLOWED_STATUS: [&str; 4] = ["interested", "planning", "growing", "paused"];
const ALLOWED_VISIBILITY: [&str; 3] = ["private", "local", "public"];

const GROWER_CROP_SELECT: &str = "
    select g.id, g.user_id, g.canonical_id, g.crop_name, g.variety_id,
           g.status::text as status, g.visibility::text as visibility,
           g.surplus_enabled, g.nickname, g.default_unit, g.notes,
           g.bed_id, b.name as bed_name,
           g.planting_date, g.expected_harvest_date,
           g.plant_count, g.spacing_inches,
           g.created_at, g.updated_at
    from grower_crop_library g
    left join garden_beds b on b.id = g.bed_id and b.archived_at is null
";

pub async fn list_my_crops(
    request: &Request,
    _correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    // Require grower user type - gatherers will receive 403 Forbidden
    let auth_context = extract_auth_context_with_fallback(request).await?;
    require_grower(&auth_context)?;

    let user_id = Uuid::parse_str(&auth_context.user_id)
        .map_err(|_| lambda_http::Error::from("Invalid user ID format"))?;
    let client = db::connect().await?;

    let query = format!("{GROWER_CROP_SELECT} where g.user_id = $1 order by g.created_at desc");
    let rows = client
        .query(&query, &[&user_id])
        .await
        .map_err(|error| db_error(&error))?;

    let items = rows
        .into_iter()
        .map(|row| row_to_item(&row))
        .collect::<Vec<_>>();
    json_response(200, &items)
}

pub async fn get_my_crop(
    request: &Request,
    _correlation_id: &str,
    crop_library_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    // Require grower user type - gatherers will receive 403 Forbidden
    let auth_context = extract_auth_context_with_fallback(request).await?;
    require_grower(&auth_context)?;

    let user_id = Uuid::parse_str(&auth_context.user_id)
        .map_err(|_| lambda_http::Error::from("Invalid user ID format"))?;
    let id = parse_uuid(crop_library_id, "crop library id")?;
    let client = db::connect().await?;

    let query = format!("{GROWER_CROP_SELECT} where g.id = $1 and g.user_id = $2");
    let maybe_row = client
        .query_opt(&query, &[&id, &user_id])
        .await
        .map_err(|error| db_error(&error))?;

    if let Some(row) = maybe_row {
        return json_response(200, &row_to_item(&row));
    }

    json_response(
        404,
        &ErrorResponse {
            error: "Grower crop record not found".to_string(),
        },
    )
}

pub async fn create_my_crop(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    // Require grower user type - gatherers will receive 403 Forbidden
    let auth_context = extract_auth_context_with_fallback(request).await?;
    require_grower(&auth_context)?;

    let user_id = Uuid::parse_str(&auth_context.user_id)
        .map_err(|_| lambda_http::Error::from("Invalid user ID format"))?;
    let payload: UpsertGrowerCropRequest = parse_json_body(request)?;
    validate_upsert_payload(&payload)?;

    let canonical_id = parse_optional_uuid(payload.canonical_id.as_deref(), "canonical_id")?;
    let variety_id = parse_optional_uuid(payload.variety_id.as_deref(), "variety_id")?;
    let bed_id = parse_optional_uuid(payload.bed_id.as_deref(), "bed_id")?;
    let planting_date = parse_optional_date(payload.planting_date.as_deref(), "plantingDate")?;
    let expected_harvest_date = parse_optional_date(
        payload.expected_harvest_date.as_deref(),
        "expectedHarvestDate",
    )?;

    let client = db::connect().await?;

    if let Some(crop_id) = canonical_id {
        validate_catalog_links(&client, crop_id, variety_id).await?;
    }
    if let Some(bed) = bed_id {
        validate_bed_ownership(&client, bed, user_id).await?;
    }
    let crop_name = resolve_crop_name(&client, &payload, canonical_id).await?;

    let row = client
        .query_one(
            "
            insert into grower_crop_library
                (user_id, canonical_id, crop_name, variety_id, status, visibility,
                 surplus_enabled, nickname, default_unit, notes,
                 bed_id, planting_date, expected_harvest_date, plant_count, spacing_inches)
            values
                ($1, $2, $3, $4, $5::text::grower_crop_status, $6::text::visibility_scope,
                 $7, $8, $9, $10,
                 $11, $12, $13, $14, $15)
            returning id
            ",
            &[
                &user_id,
                &canonical_id,
                &crop_name,
                &variety_id,
                &payload.status,
                &payload.visibility,
                &payload.surplus_enabled,
                &payload.nickname,
                &payload.default_unit,
                &payload.notes,
                &bed_id,
                &planting_date,
                &expected_harvest_date,
                &payload.plant_count,
                &payload.spacing_inches,
            ],
        )
        .await
        .map_err(|error| db_error(&error))?;

    let new_id: Uuid = row.get("id");

    let select = format!("{GROWER_CROP_SELECT} where g.id = $1 and g.user_id = $2");
    let full_row = client
        .query_one(&select, &[&new_id, &user_id])
        .await
        .map_err(|error| db_error(&error))?;

    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        crop_library_id = %new_id,
        "Created grower crop library item"
    );

    json_response(201, &row_to_item(&full_row))
}

pub async fn update_my_crop(
    request: &Request,
    correlation_id: &str,
    crop_library_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    // Require grower user type - gatherers will receive 403 Forbidden
    let auth_context = extract_auth_context_with_fallback(request).await?;
    require_grower(&auth_context)?;

    let user_id = Uuid::parse_str(&auth_context.user_id)
        .map_err(|_| lambda_http::Error::from("Invalid user ID format"))?;
    let payload: UpsertGrowerCropRequest = parse_json_body(request)?;
    validate_upsert_payload(&payload)?;

    let id = parse_uuid(crop_library_id, "crop library id")?;
    let canonical_id = parse_optional_uuid(payload.canonical_id.as_deref(), "canonical_id")?;
    let variety_id = parse_optional_uuid(payload.variety_id.as_deref(), "variety_id")?;
    let bed_id = parse_optional_uuid(payload.bed_id.as_deref(), "bed_id")?;
    let planting_date = parse_optional_date(payload.planting_date.as_deref(), "plantingDate")?;
    let expected_harvest_date = parse_optional_date(
        payload.expected_harvest_date.as_deref(),
        "expectedHarvestDate",
    )?;

    let client = db::connect().await?;

    if let Some(crop_id) = canonical_id {
        validate_catalog_links(&client, crop_id, variety_id).await?;
    }
    if let Some(bed) = bed_id {
        validate_bed_ownership(&client, bed, user_id).await?;
    }
    let crop_name = resolve_crop_name(&client, &payload, canonical_id).await?;

    let updated = client
        .execute(
            "
            update grower_crop_library
            set canonical_id = $1,
                crop_name = $2,
                variety_id = $3,
                status = $4::text::grower_crop_status,
                visibility = $5::text::visibility_scope,
                surplus_enabled = $6,
                nickname = $7,
                default_unit = $8,
                notes = $9,
                bed_id = $10,
                planting_date = $11,
                expected_harvest_date = $12,
                plant_count = $13,
                spacing_inches = $14,
                updated_at = now()
            where id = $15 and user_id = $16
            ",
            &[
                &canonical_id,
                &crop_name,
                &variety_id,
                &payload.status,
                &payload.visibility,
                &payload.surplus_enabled,
                &payload.nickname,
                &payload.default_unit,
                &payload.notes,
                &bed_id,
                &planting_date,
                &expected_harvest_date,
                &payload.plant_count,
                &payload.spacing_inches,
                &id,
                &user_id,
            ],
        )
        .await
        .map_err(|error| db_error(&error))?;

    if updated == 0 {
        return json_response(
            404,
            &ErrorResponse {
                error: "Grower crop record not found".to_string(),
            },
        );
    }

    let select = format!("{GROWER_CROP_SELECT} where g.id = $1 and g.user_id = $2");
    let full_row = client
        .query_one(&select, &[&id, &user_id])
        .await
        .map_err(|error| db_error(&error))?;

    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        crop_library_id = %id,
        "Updated grower crop library item"
    );
    json_response(200, &row_to_item(&full_row))
}

pub async fn delete_my_crop(
    request: &Request,
    correlation_id: &str,
    crop_library_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    // Require grower user type - gatherers will receive 403 Forbidden
    let auth_context = extract_auth_context_with_fallback(request).await?;
    require_grower(&auth_context)?;

    let user_id = Uuid::parse_str(&auth_context.user_id)
        .map_err(|_| lambda_http::Error::from("Invalid user ID format"))?;
    let id = parse_uuid(crop_library_id, "crop library id")?;
    let client = db::connect().await?;

    let deleted = client
        .execute(
            "delete from grower_crop_library where id = $1 and user_id = $2",
            &[&id, &user_id],
        )
        .await
        .map_err(|error| db_error(&error))?;

    if deleted == 0 {
        return json_response(
            404,
            &ErrorResponse {
                error: "Grower crop record not found".to_string(),
            },
        );
    }

    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        crop_library_id = %id,
        "Deleted grower crop library item"
    );

    Response::builder()
        .status(204)
        .body(Body::Empty)
        .map_err(|e| lambda_http::Error::from(e.to_string()))
}

fn validate_upsert_payload(payload: &UpsertGrowerCropRequest) -> Result<(), lambda_http::Error> {
    if !ALLOWED_STATUS.contains(&payload.status.as_str()) {
        return Err(lambda_http::Error::from(format!(
            "Invalid status '{}'. Allowed values: {}",
            payload.status,
            ALLOWED_STATUS.join(", ")
        )));
    }

    if !ALLOWED_VISIBILITY.contains(&payload.visibility.as_str()) {
        return Err(lambda_http::Error::from(format!(
            "Invalid visibility '{}'. Allowed values: {}",
            payload.visibility,
            ALLOWED_VISIBILITY.join(", ")
        )));
    }

    let has_crop_name = payload
        .crop_name
        .as_ref()
        .is_some_and(|value| !value.trim().is_empty());
    let has_canonical_id = payload
        .canonical_id
        .as_ref()
        .is_some_and(|value| !value.trim().is_empty());

    if !has_crop_name && !has_canonical_id {
        return Err(lambda_http::Error::from(
            "crop_name is required when canonical_id is not provided".to_string(),
        ));
    }

    if let Some(count) = payload.plant_count {
        if count <= 0 {
            return Err(lambda_http::Error::from(
                "plantCount must be a positive integer".to_string(),
            ));
        }
    }
    if let Some(spacing) = payload.spacing_inches {
        if spacing < 0 {
            return Err(lambda_http::Error::from(
                "spacingInches must be non-negative".to_string(),
            ));
        }
    }

    if let (Some(planting), Some(harvest)) = (
        payload.planting_date.as_deref(),
        payload.expected_harvest_date.as_deref(),
    ) {
        let p = NaiveDate::parse_from_str(planting.trim(), "%Y-%m-%d")
            .map_err(|_| lambda_http::Error::from("plantingDate must be YYYY-MM-DD".to_string()))?;
        let h = NaiveDate::parse_from_str(harvest.trim(), "%Y-%m-%d").map_err(|_| {
            lambda_http::Error::from("expectedHarvestDate must be YYYY-MM-DD".to_string())
        })?;
        if h < p {
            return Err(lambda_http::Error::from(
                "expectedHarvestDate must be on or after plantingDate".to_string(),
            ));
        }
    }

    Ok(())
}

async fn resolve_crop_name(
    client: &Client,
    payload: &UpsertGrowerCropRequest,
    canonical_id: Option<Uuid>,
) -> Result<String, lambda_http::Error> {
    if let Some(name) = payload
        .crop_name
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        return Ok(name.to_string());
    }

    if let Some(crop_id) = canonical_id {
        let row = client
            .query_one("select common_name from crops where id = $1", &[&crop_id])
            .await
            .map_err(|error| db_error(&error))?;
        return Ok(row.get::<_, String>("common_name"));
    }

    Err(lambda_http::Error::from(
        "crop_name is required when canonical_id is not provided".to_string(),
    ))
}

async fn validate_catalog_links(
    client: &Client,
    crop_id: Uuid,
    variety_id: Option<Uuid>,
) -> Result<(), lambda_http::Error> {
    let crop_exists = client
        .query_one(
            "select exists(select 1 from crops where id = $1)",
            &[&crop_id],
        )
        .await
        .map_err(|error| db_error(&error))?
        .get::<_, bool>(0);

    if !crop_exists {
        return Err(lambda_http::Error::from(
            "crop_id does not reference an existing catalog crop".to_string(),
        ));
    }

    if let Some(variety) = variety_id {
        let matches = client
            .query_one(
                "select exists(select 1 from crop_varieties where id = $1 and crop_id = $2)",
                &[&variety, &crop_id],
            )
            .await
            .map_err(|error| db_error(&error))?
            .get::<_, bool>(0);

        if !matches {
            return Err(lambda_http::Error::from(
                "variety_id must belong to the specified crop_id".to_string(),
            ));
        }
    }

    Ok(())
}

async fn validate_bed_ownership(
    client: &Client,
    bed_id: Uuid,
    user_id: Uuid,
) -> Result<(), lambda_http::Error> {
    let exists = client
        .query_one(
            "
            select exists(
                select 1 from garden_beds
                where id = $1 and user_id = $2 and archived_at is null
            )
            ",
            &[&bed_id, &user_id],
        )
        .await
        .map_err(|error| db_error(&error))?
        .get::<_, bool>(0);

    if !exists {
        return Err(lambda_http::Error::from(
            "bed_id does not reference one of your garden beds".to_string(),
        ));
    }
    Ok(())
}

fn parse_uuid(value: &str, field_name: &str) -> Result<Uuid, lambda_http::Error> {
    let normalized = value.trim();
    Uuid::parse_str(normalized)
        .map_err(|_| lambda_http::Error::from(format!("{field_name} must be a valid UUID")))
}

fn parse_optional_uuid(
    value: Option<&str>,
    field_name: &str,
) -> Result<Option<Uuid>, lambda_http::Error> {
    value
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map_or(Ok(None), |v| parse_uuid(v, field_name).map(Some))
}

fn parse_optional_date(
    value: Option<&str>,
    field_name: &str,
) -> Result<Option<NaiveDate>, lambda_http::Error> {
    value
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map_or(Ok(None), |v| {
            NaiveDate::parse_from_str(v, "%Y-%m-%d")
                .map(Some)
                .map_err(|_| lambda_http::Error::from(format!("{field_name} must be YYYY-MM-DD")))
        })
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

fn row_to_item(row: &Row) -> GrowerCropItem {
    GrowerCropItem {
        id: row.get::<_, Uuid>("id").to_string(),
        user_id: row.get::<_, Uuid>("user_id").to_string(),
        crop_id: row
            .get::<_, Option<Uuid>>("canonical_id")
            .map(|v| v.to_string()),
        canonical_id: row
            .get::<_, Option<Uuid>>("canonical_id")
            .map(|v| v.to_string()),
        crop_name: row.get("crop_name"),
        variety_id: row
            .get::<_, Option<Uuid>>("variety_id")
            .map(|v| v.to_string()),
        status: row.get("status"),
        visibility: row.get("visibility"),
        surplus_enabled: row.get("surplus_enabled"),
        nickname: row.get("nickname"),
        default_unit: row.get("default_unit"),
        notes: row.get("notes"),
        bed_id: row.get::<_, Option<Uuid>>("bed_id").map(|v| v.to_string()),
        bed_name: row.get("bed_name"),
        planting_date: row
            .get::<_, Option<NaiveDate>>("planting_date")
            .map(|d| d.format("%Y-%m-%d").to_string()),
        expected_harvest_date: row
            .get::<_, Option<NaiveDate>>("expected_harvest_date")
            .map(|d| d.format("%Y-%m-%d").to_string()),
        plant_count: row.get("plant_count"),
        spacing_inches: row.get("spacing_inches"),
        created_at: row
            .get::<_, chrono::DateTime<chrono::Utc>>("created_at")
            .to_rfc3339(),
        updated_at: row
            .get::<_, chrono::DateTime<chrono::Utc>>("updated_at")
            .to_rfc3339(),
    }
}

fn db_error(error: &tokio_postgres::Error) -> lambda_http::Error {
    lambda_http::Error::from(format!("Database query error: {error}"))
}

fn json_response<T: Serialize>(
    status: u16,
    payload: &T,
) -> Result<Response<Body>, lambda_http::Error> {
    let body = serde_json::to_string(payload)
        .map_err(|e| lambda_http::Error::from(format!("Failed to serialize response: {e}")))?;

    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::from(body))
        .map_err(|e| lambda_http::Error::from(e.to_string()))
}

pub fn error_response(status: u16, message: &str) -> Result<Response<Body>, lambda_http::Error> {
    json_response(
        status,
        &ErrorResponse {
            error: message.to_string(),
        },
    )
}

#[cfg(test)]
mod tests {
    use super::{validate_upsert_payload, UpsertGrowerCropRequest};

    fn valid_payload() -> UpsertGrowerCropRequest {
        UpsertGrowerCropRequest {
            canonical_id: Some("5df666d4-f6b1-4e6f-97d6-321e531ad7ca".to_string()),
            crop_name: Some("Tomato".to_string()),
            variety_id: None,
            status: "growing".to_string(),
            visibility: "local".to_string(),
            surplus_enabled: true,
            nickname: None,
            default_unit: None,
            notes: None,
            bed_id: None,
            planting_date: None,
            expected_harvest_date: None,
            plant_count: None,
            spacing_inches: None,
        }
    }

    #[test]
    fn payload_validation_accepts_valid_enums() {
        let payload = valid_payload();
        assert!(validate_upsert_payload(&payload).is_ok());
    }

    #[test]
    fn payload_validation_rejects_invalid_status() {
        let mut payload = valid_payload();
        payload.status = "harvested".to_string();
        assert!(validate_upsert_payload(&payload).is_err());
    }

    #[test]
    fn payload_validation_rejects_invalid_visibility() {
        let mut payload = valid_payload();
        payload.visibility = "team".to_string();
        assert!(validate_upsert_payload(&payload).is_err());
    }

    #[test]
    fn payload_validation_rejects_missing_crop_name_and_canonical_id() {
        let mut payload = valid_payload();
        payload.crop_name = None;
        payload.canonical_id = None;
        assert!(validate_upsert_payload(&payload).is_err());
    }

    #[test]
    fn payload_validation_rejects_zero_plant_count() {
        let mut payload = valid_payload();
        payload.plant_count = Some(0);
        assert!(validate_upsert_payload(&payload).is_err());
    }

    #[test]
    fn payload_validation_rejects_harvest_before_planting() {
        let mut payload = valid_payload();
        payload.planting_date = Some("2026-05-01".to_string());
        payload.expected_harvest_date = Some("2026-04-15".to_string());
        assert!(validate_upsert_payload(&payload).is_err());
    }

    #[test]
    fn payload_validation_accepts_harvest_after_planting() {
        let mut payload = valid_payload();
        payload.planting_date = Some("2026-05-01".to_string());
        payload.expected_harvest_date = Some("2026-08-01".to_string());
        assert!(validate_upsert_payload(&payload).is_ok());
    }

    #[test]
    fn payload_validation_rejects_malformed_planting_date() {
        let mut payload = valid_payload();
        payload.planting_date = Some("yesterday".to_string());
        payload.expected_harvest_date = Some("2026-08-01".to_string());
        assert!(validate_upsert_payload(&payload).is_err());
    }
}
