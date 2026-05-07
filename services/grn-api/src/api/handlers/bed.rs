use crate::auth::{extract_auth_context_with_fallback, require_grower};
use crate::db;
use crate::handlers::crop::error_response;
use crate::models::bed::{GardenBed, UpsertGardenBedRequest};
use crate::models::crop::ErrorResponse;
use lambda_http::{Body, Request, Response};
use serde::Serialize;
use tokio_postgres::Row;
use tracing::info;
use uuid::Uuid;

const ALLOWED_SUN_EXPOSURE: [&str; 5] = [
    "full_sun",
    "partial_sun",
    "partial_shade",
    "full_shade",
    "mixed",
];

pub async fn list_my_beds(
    request: &Request,
    _correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth_context = extract_auth_context_with_fallback(request).await?;
    require_grower(&auth_context)?;

    let user_id = parse_user_id(&auth_context.user_id)?;
    let client = db::connect().await?;

    let rows = client
        .query(
            "
            select id, user_id, name, description, sun_exposure, soil_type,
                   length_inches, width_inches, location_notes, sort_order,
                   created_at, updated_at
            from garden_beds
            where user_id = $1 and archived_at is null
            order by sort_order asc, created_at asc
            ",
            &[&user_id],
        )
        .await
        .map_err(db_error)?;

    let beds = rows.into_iter().map(|row| row_to_bed(&row)).collect::<Vec<_>>();
    json_response(200, &beds)
}

pub async fn create_my_bed(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth_context = extract_auth_context_with_fallback(request).await?;
    require_grower(&auth_context)?;

    let user_id = parse_user_id(&auth_context.user_id)?;
    let payload: UpsertGardenBedRequest = parse_json_body(request)?;
    let trimmed_name = validate_bed_payload(&payload)?;

    let client = db::connect().await?;
    let row = client
        .query_one(
            "
            insert into garden_beds
                (user_id, name, description, sun_exposure, soil_type,
                 length_inches, width_inches, location_notes, sort_order)
            values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, 0))
            returning id, user_id, name, description, sun_exposure, soil_type,
                      length_inches, width_inches, location_notes, sort_order,
                      created_at, updated_at
            ",
            &[
                &user_id,
                &trimmed_name,
                &payload.description.as_ref().map(|s| s.trim().to_string()),
                &payload.sun_exposure,
                &payload.soil_type.as_ref().map(|s| s.trim().to_string()),
                &payload.length_inches,
                &payload.width_inches,
                &payload.location_notes.as_ref().map(|s| s.trim().to_string()),
                &payload.sort_order,
            ],
        )
        .await
        .map_err(db_error)?;

    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        bed_id = %row.get::<_, Uuid>("id"),
        "Created garden bed"
    );

    json_response(201, &row_to_bed(&row))
}

pub async fn update_my_bed(
    request: &Request,
    correlation_id: &str,
    bed_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth_context = extract_auth_context_with_fallback(request).await?;
    require_grower(&auth_context)?;

    let user_id = parse_user_id(&auth_context.user_id)?;
    let payload: UpsertGardenBedRequest = parse_json_body(request)?;
    let trimmed_name = validate_bed_payload(&payload)?;
    let id = parse_uuid(bed_id, "bed id")?;

    let client = db::connect().await?;
    let maybe_row = client
        .query_opt(
            "
            update garden_beds
            set name = $1,
                description = $2,
                sun_exposure = $3,
                soil_type = $4,
                length_inches = $5,
                width_inches = $6,
                location_notes = $7,
                sort_order = coalesce($8, sort_order),
                updated_at = now()
            where id = $9 and user_id = $10 and archived_at is null
            returning id, user_id, name, description, sun_exposure, soil_type,
                      length_inches, width_inches, location_notes, sort_order,
                      created_at, updated_at
            ",
            &[
                &trimmed_name,
                &payload.description.as_ref().map(|s| s.trim().to_string()),
                &payload.sun_exposure,
                &payload.soil_type.as_ref().map(|s| s.trim().to_string()),
                &payload.length_inches,
                &payload.width_inches,
                &payload.location_notes.as_ref().map(|s| s.trim().to_string()),
                &payload.sort_order,
                &id,
                &user_id,
            ],
        )
        .await
        .map_err(db_error)?;

    if let Some(row) = maybe_row {
        info!(
            correlation_id = correlation_id,
            user_id = %user_id,
            bed_id = %id,
            "Updated garden bed"
        );
        return json_response(200, &row_to_bed(&row));
    }

    not_found_response()
}

pub async fn delete_my_bed(
    request: &Request,
    correlation_id: &str,
    bed_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth_context = extract_auth_context_with_fallback(request).await?;
    require_grower(&auth_context)?;

    let user_id = parse_user_id(&auth_context.user_id)?;
    let id = parse_uuid(bed_id, "bed id")?;

    let client = db::connect().await?;
    // Soft delete: keeps any historical references intact via SET NULL on FK.
    let archived = client
        .execute(
            "
            update garden_beds
            set archived_at = now(), updated_at = now()
            where id = $1 and user_id = $2 and archived_at is null
            ",
            &[&id, &user_id],
        )
        .await
        .map_err(db_error)?;

    if archived == 0 {
        return not_found_response();
    }

    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        bed_id = %id,
        "Archived garden bed"
    );

    Response::builder()
        .status(204)
        .body(Body::Empty)
        .map_err(|e| lambda_http::Error::from(e.to_string()))
}

pub fn validate_bed_payload(
    payload: &UpsertGardenBedRequest,
) -> Result<String, lambda_http::Error> {
    let trimmed = payload.name.trim();
    if trimmed.is_empty() {
        return Err(lambda_http::Error::from(
            "bed name is required".to_string(),
        ));
    }
    if trimmed.len() > 80 {
        return Err(lambda_http::Error::from(
            "bed name must be 80 characters or fewer".to_string(),
        ));
    }
    if let Some(sun) = payload.sun_exposure.as_deref() {
        if !sun.is_empty() && !ALLOWED_SUN_EXPOSURE.contains(&sun) {
            return Err(lambda_http::Error::from(format!(
                "Invalid sunExposure '{sun}'. Allowed values: {}",
                ALLOWED_SUN_EXPOSURE.join(", ")
            )));
        }
    }
    if payload.length_inches.is_some_and(|v| v < 0) || payload.width_inches.is_some_and(|v| v < 0) {
        return Err(lambda_http::Error::from(
            "bed dimensions must be non-negative".to_string(),
        ));
    }
    Ok(trimmed.to_string())
}

fn parse_user_id(value: &str) -> Result<Uuid, lambda_http::Error> {
    Uuid::parse_str(value).map_err(|_| lambda_http::Error::from("Invalid user ID format"))
}

fn parse_uuid(value: &str, field_name: &str) -> Result<Uuid, lambda_http::Error> {
    Uuid::parse_str(value.trim())
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

fn row_to_bed(row: &Row) -> GardenBed {
    GardenBed {
        id: row.get::<_, Uuid>("id").to_string(),
        user_id: row.get::<_, Uuid>("user_id").to_string(),
        name: row.get("name"),
        description: row.get("description"),
        sun_exposure: row.get("sun_exposure"),
        soil_type: row.get("soil_type"),
        length_inches: row.get("length_inches"),
        width_inches: row.get("width_inches"),
        location_notes: row.get("location_notes"),
        sort_order: row.get("sort_order"),
        created_at: row
            .get::<_, chrono::DateTime<chrono::Utc>>("created_at")
            .to_rfc3339(),
        updated_at: row
            .get::<_, chrono::DateTime<chrono::Utc>>("updated_at")
            .to_rfc3339(),
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
        .header("content-type", "application/json")
        .body(Body::from(body))
        .map_err(|e| lambda_http::Error::from(e.to_string()))
}

fn not_found_response() -> Result<Response<Body>, lambda_http::Error> {
    error_response(404, "Garden bed not found").or_else(|_| {
        let body = serde_json::to_string(&ErrorResponse {
            error: "Garden bed not found".to_string(),
        })
        .map_err(|e| lambda_http::Error::from(format!("Failed to serialize response: {e}")))?;
        Response::builder()
            .status(404)
            .header("content-type", "application/json")
            .body(Body::from(body))
            .map_err(|e| lambda_http::Error::from(e.to_string()))
    })
}

fn db_error(error: tokio_postgres::Error) -> lambda_http::Error {
    lambda_http::Error::from(format!("Database query error: {error}"))
}

#[cfg(test)]
mod tests {
    use super::{validate_bed_payload, UpsertGardenBedRequest};

    fn payload() -> UpsertGardenBedRequest {
        UpsertGardenBedRequest {
            name: "Front raised bed".to_string(),
            description: None,
            sun_exposure: Some("full_sun".to_string()),
            soil_type: None,
            length_inches: Some(48),
            width_inches: Some(48),
            location_notes: None,
            sort_order: Some(0),
        }
    }

    #[test]
    fn accepts_valid_payload() {
        assert_eq!(validate_bed_payload(&payload()).unwrap(), "Front raised bed");
    }

    #[test]
    fn rejects_blank_name() {
        let mut p = payload();
        p.name = "   ".to_string();
        assert!(validate_bed_payload(&p).is_err());
    }

    #[test]
    fn rejects_unknown_sun_exposure() {
        let mut p = payload();
        p.sun_exposure = Some("rainforest".to_string());
        assert!(validate_bed_payload(&p).is_err());
    }

    #[test]
    fn rejects_negative_dimensions() {
        let mut p = payload();
        p.length_inches = Some(-1);
        assert!(validate_bed_payload(&p).is_err());
    }
}
