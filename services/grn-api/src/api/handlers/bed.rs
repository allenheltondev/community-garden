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

const ALLOWED_BED_TYPES: [&str; 3] = ["in_ground", "raised", "mound"];
const ALLOWED_SHAPES: [&str; 3] = ["rect", "circle", "polygon"];
const COLOR_HEX_LEN: usize = 7; // "#rrggbb"
const MAX_POLYGON_POINTS: usize = 64;

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
                   bed_type, shape, position_x, position_y, rotation_deg,
                   points, color, created_at, updated_at
            from garden_beds
            where user_id = $1 and archived_at is null
            order by sort_order asc, created_at asc
            ",
            &[&user_id],
        )
        .await
        .map_err(|e| db_error(&e))?;

    let beds = rows
        .into_iter()
        .map(|row| row_to_bed(&row))
        .collect::<Vec<_>>();
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
    let validated = validate_bed_payload(&payload)?;

    let client = db::connect().await?;
    let row = client
        .query_one(
            "
            insert into garden_beds
                (user_id, name, description, sun_exposure, soil_type,
                 length_inches, width_inches, location_notes, sort_order,
                 bed_type, shape, position_x, position_y, rotation_deg,
                 points, color)
            values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, 0),
                    coalesce($10, 'raised'), coalesce($11, 'rect'),
                    $12, $13, coalesce($14, 0), $15, $16)
            returning id, user_id, name, description, sun_exposure, soil_type,
                      length_inches, width_inches, location_notes, sort_order,
                      bed_type, shape, position_x, position_y, rotation_deg,
                      points, color, created_at, updated_at
            ",
            &[
                &user_id,
                &validated.name,
                &payload.description.as_ref().map(|s| s.trim().to_string()),
                &payload.sun_exposure,
                &payload.soil_type.as_ref().map(|s| s.trim().to_string()),
                &payload.length_inches,
                &payload.width_inches,
                &payload
                    .location_notes
                    .as_ref()
                    .map(|s| s.trim().to_string()),
                &payload.sort_order,
                &validated.bed_type,
                &validated.shape,
                &payload.position_x,
                &payload.position_y,
                &payload.rotation_deg,
                &validated.points,
                &validated.color,
            ],
        )
        .await
        .map_err(|e| db_error(&e))?;

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
    let validated = validate_bed_payload(&payload)?;
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
                bed_type = coalesce($9, bed_type),
                shape = coalesce($10, shape),
                position_x = $11,
                position_y = $12,
                rotation_deg = coalesce($13, rotation_deg),
                points = $14,
                color = $15,
                updated_at = now()
            where id = $16 and user_id = $17 and archived_at is null
            returning id, user_id, name, description, sun_exposure, soil_type,
                      length_inches, width_inches, location_notes, sort_order,
                      bed_type, shape, position_x, position_y, rotation_deg,
                      points, color, created_at, updated_at
            ",
            &[
                &validated.name,
                &payload.description.as_ref().map(|s| s.trim().to_string()),
                &payload.sun_exposure,
                &payload.soil_type.as_ref().map(|s| s.trim().to_string()),
                &payload.length_inches,
                &payload.width_inches,
                &payload
                    .location_notes
                    .as_ref()
                    .map(|s| s.trim().to_string()),
                &payload.sort_order,
                &validated.bed_type,
                &validated.shape,
                &payload.position_x,
                &payload.position_y,
                &payload.rotation_deg,
                &validated.points,
                &validated.color,
                &id,
                &user_id,
            ],
        )
        .await
        .map_err(|e| db_error(&e))?;

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
        .map_err(|e| db_error(&e))?;

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

pub struct ValidatedBed {
    pub name: String,
    pub bed_type: Option<String>,
    pub shape: Option<String>,
    pub points: Option<serde_json::Value>,
    pub color: Option<String>,
}

pub fn validate_bed_payload(
    payload: &UpsertGardenBedRequest,
) -> Result<ValidatedBed, lambda_http::Error> {
    let trimmed = payload.name.trim();
    if trimmed.is_empty() {
        return Err(lambda_http::Error::from("bed name is required".to_string()));
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

    let bed_type = match payload.bed_type.as_deref().map(str::trim) {
        None | Some("") => None,
        Some(value) if ALLOWED_BED_TYPES.contains(&value) => Some(value.to_string()),
        Some(value) => {
            return Err(lambda_http::Error::from(format!(
                "Invalid bedType '{value}'. Allowed values: {}",
                ALLOWED_BED_TYPES.join(", ")
            )));
        }
    };

    let shape = match payload.shape.as_deref().map(str::trim) {
        None | Some("") => None,
        Some(value) if ALLOWED_SHAPES.contains(&value) => Some(value.to_string()),
        Some(value) => {
            return Err(lambda_http::Error::from(format!(
                "Invalid bed shape '{value}'. Allowed values: {}",
                ALLOWED_SHAPES.join(", ")
            )));
        }
    };

    if let Some(deg) = payload.rotation_deg {
        if !(-360..=360).contains(&deg) {
            return Err(lambda_http::Error::from(
                "rotationDeg must be between -360 and 360".to_string(),
            ));
        }
    }

    let points = validate_polygon_points(payload.points.as_ref(), shape.as_deref())?;

    let color = match payload.color.as_deref().map(str::trim) {
        None | Some("") => None,
        Some(value) if is_valid_hex_color(value) => Some(value.to_lowercase()),
        Some(_) => {
            return Err(lambda_http::Error::from(
                "color must be a 7-character hex string like #4f8a3b".to_string(),
            ));
        }
    };

    Ok(ValidatedBed {
        name: trimmed.to_string(),
        bed_type,
        shape,
        points,
        color,
    })
}

fn validate_polygon_points(
    raw: Option<&serde_json::Value>,
    shape: Option<&str>,
) -> Result<Option<serde_json::Value>, lambda_http::Error> {
    let Some(value) = raw else {
        if shape == Some("polygon") {
            return Err(lambda_http::Error::from(
                "points is required when shape is polygon".to_string(),
            ));
        }
        return Ok(None);
    };

    let array = value
        .as_array()
        .ok_or_else(|| lambda_http::Error::from("points must be an array".to_string()))?;

    if shape == Some("polygon") && array.len() < 3 {
        return Err(lambda_http::Error::from(
            "points must contain at least 3 entries for a polygon".to_string(),
        ));
    }
    if array.len() > MAX_POLYGON_POINTS {
        return Err(lambda_http::Error::from(format!(
            "points must contain {MAX_POLYGON_POINTS} or fewer entries"
        )));
    }

    for entry in array {
        let object = entry
            .as_object()
            .ok_or_else(|| lambda_http::Error::from("each point must be an object".to_string()))?;
        let x = object
            .get("x")
            .and_then(serde_json::Value::as_i64)
            .ok_or_else(|| {
                lambda_http::Error::from("each point must have integer x".to_string())
            })?;
        let y = object
            .get("y")
            .and_then(serde_json::Value::as_i64)
            .ok_or_else(|| {
                lambda_http::Error::from("each point must have integer y".to_string())
            })?;
        if !(i64::from(i32::MIN)..=i64::from(i32::MAX)).contains(&x)
            || !(i64::from(i32::MIN)..=i64::from(i32::MAX)).contains(&y)
        {
            return Err(lambda_http::Error::from(
                "point coordinates must fit in a 32-bit integer".to_string(),
            ));
        }
    }

    Ok(Some(value.clone()))
}

fn is_valid_hex_color(value: &str) -> bool {
    value.len() == COLOR_HEX_LEN
        && value.starts_with('#')
        && value[1..].chars().all(|c| c.is_ascii_hexdigit())
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
        bed_type: row.get("bed_type"),
        shape: row.get("shape"),
        position_x: row.get("position_x"),
        position_y: row.get("position_y"),
        rotation_deg: row.get("rotation_deg"),
        points: row.get("points"),
        color: row.get("color"),
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

fn db_error(error: &tokio_postgres::Error) -> lambda_http::Error {
    lambda_http::Error::from(format!("Database query error: {error}"))
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::{validate_bed_payload, UpsertGardenBedRequest};
    use serde_json::json;

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
            bed_type: Some("raised".to_string()),
            shape: Some("rect".to_string()),
            position_x: Some(0),
            position_y: Some(0),
            rotation_deg: Some(0),
            points: None,
            color: None,
        }
    }

    #[test]
    fn accepts_valid_payload() {
        let result = validate_bed_payload(&payload()).unwrap();
        assert_eq!(result.name, "Front raised bed");
        assert_eq!(result.bed_type.as_deref(), Some("raised"));
        assert_eq!(result.shape.as_deref(), Some("rect"));
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

    #[test]
    fn rejects_unknown_bed_type() {
        let mut p = payload();
        p.bed_type = Some("hydroponic".to_string());
        assert!(validate_bed_payload(&p).is_err());
    }

    #[test]
    fn rejects_unknown_shape() {
        let mut p = payload();
        p.shape = Some("octagon".to_string());
        assert!(validate_bed_payload(&p).is_err());
    }

    #[test]
    fn rejects_polygon_without_points() {
        let mut p = payload();
        p.shape = Some("polygon".to_string());
        p.points = None;
        assert!(validate_bed_payload(&p).is_err());
    }

    #[test]
    fn rejects_polygon_with_too_few_points() {
        let mut p = payload();
        p.shape = Some("polygon".to_string());
        p.points = Some(json!([{"x": 0, "y": 0}, {"x": 10, "y": 0}]));
        assert!(validate_bed_payload(&p).is_err());
    }

    #[test]
    fn accepts_polygon_with_three_points() {
        let mut p = payload();
        p.shape = Some("polygon".to_string());
        p.points = Some(json!([{"x": 0, "y": 0}, {"x": 24, "y": 0}, {"x": 12, "y": 24}]));
        assert!(validate_bed_payload(&p).is_ok());
    }

    #[test]
    fn rejects_points_when_not_an_array() {
        let mut p = payload();
        p.points = Some(json!({"x": 0, "y": 0}));
        assert!(validate_bed_payload(&p).is_err());
    }

    #[test]
    fn rejects_point_missing_coordinate() {
        let mut p = payload();
        p.shape = Some("polygon".to_string());
        p.points = Some(json!([{"x": 0, "y": 0}, {"x": 24}, {"x": 12, "y": 24}]));
        assert!(validate_bed_payload(&p).is_err());
    }

    #[test]
    fn rejects_rotation_out_of_range() {
        let mut p = payload();
        p.rotation_deg = Some(720);
        assert!(validate_bed_payload(&p).is_err());
    }

    #[test]
    fn rejects_invalid_color() {
        let mut p = payload();
        p.color = Some("blue".to_string());
        assert!(validate_bed_payload(&p).is_err());
    }

    #[test]
    fn accepts_valid_hex_color() {
        let mut p = payload();
        p.color = Some("#4F8A3B".to_string());
        let result = validate_bed_payload(&p).unwrap();
        assert_eq!(result.color.as_deref(), Some("#4f8a3b"));
    }
}
