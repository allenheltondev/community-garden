use crate::auth::{extract_auth_context_with_fallback, require_grower};
use crate::db;
use crate::handlers::crop::error_response;
use crate::models::annotation::{GardenAnnotation, UpsertGardenAnnotationRequest};
use crate::models::crop::ErrorResponse;
use lambda_http::{Body, Request, Response};
use serde::Serialize;
use tokio_postgres::Row;
use tracing::info;
use uuid::Uuid;

const ALLOWED_SHAPES: [&str; 4] = ["rect", "circle", "polygon", "line"];
const COLOR_HEX_LEN: usize = 7;
const MAX_LABEL_LEN: usize = 80;
const MAX_ICON_LEN: usize = 32;
const MAX_POLYGON_POINTS: usize = 64;

pub async fn list_my_annotations(
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
            select id, user_id, label, icon, shape, position_x, position_y,
                   length_inches, width_inches, rotation_deg, points, color,
                   sort_order, created_at, updated_at
            from garden_annotations
            where user_id = $1 and archived_at is null
            order by sort_order asc, created_at asc
            ",
            &[&user_id],
        )
        .await
        .map_err(|e| db_error(&e))?;

    let annotations = rows
        .into_iter()
        .map(|row| row_to_annotation(&row))
        .collect::<Vec<_>>();
    json_response(200, &annotations)
}

pub async fn create_my_annotation(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth_context = extract_auth_context_with_fallback(request).await?;
    require_grower(&auth_context)?;

    let user_id = parse_user_id(&auth_context.user_id)?;
    let payload: UpsertGardenAnnotationRequest = parse_json_body(request)?;
    let validated = validate_annotation_payload(&payload)?;

    let client = db::connect().await?;
    let row = client
        .query_one(
            "
            insert into garden_annotations
                (user_id, label, icon, shape, position_x, position_y,
                 length_inches, width_inches, rotation_deg, points, color, sort_order)
            values ($1, $2, $3, coalesce($4, 'rect'), $5, $6, $7, $8,
                    coalesce($9, 0), $10, $11, coalesce($12, 0))
            returning id, user_id, label, icon, shape, position_x, position_y,
                      length_inches, width_inches, rotation_deg, points, color,
                      sort_order, created_at, updated_at
            ",
            &[
                &user_id,
                &validated.label,
                &validated.icon,
                &validated.shape,
                &payload.position_x,
                &payload.position_y,
                &payload.length_inches,
                &payload.width_inches,
                &payload.rotation_deg,
                &validated.points,
                &validated.color,
                &payload.sort_order,
            ],
        )
        .await
        .map_err(|e| db_error(&e))?;

    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        annotation_id = %row.get::<_, Uuid>("id"),
        "Created garden annotation"
    );

    json_response(201, &row_to_annotation(&row))
}

pub async fn update_my_annotation(
    request: &Request,
    correlation_id: &str,
    annotation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth_context = extract_auth_context_with_fallback(request).await?;
    require_grower(&auth_context)?;

    let user_id = parse_user_id(&auth_context.user_id)?;
    let payload: UpsertGardenAnnotationRequest = parse_json_body(request)?;
    let validated = validate_annotation_payload(&payload)?;
    let id = parse_uuid(annotation_id, "annotation id")?;

    let client = db::connect().await?;
    let maybe_row = client
        .query_opt(
            "
            update garden_annotations
            set label = $1,
                icon = $2,
                shape = coalesce($3, shape),
                position_x = $4,
                position_y = $5,
                length_inches = $6,
                width_inches = $7,
                rotation_deg = coalesce($8, rotation_deg),
                points = $9,
                color = $10,
                sort_order = coalesce($11, sort_order),
                updated_at = now()
            where id = $12 and user_id = $13 and archived_at is null
            returning id, user_id, label, icon, shape, position_x, position_y,
                      length_inches, width_inches, rotation_deg, points, color,
                      sort_order, created_at, updated_at
            ",
            &[
                &validated.label,
                &validated.icon,
                &validated.shape,
                &payload.position_x,
                &payload.position_y,
                &payload.length_inches,
                &payload.width_inches,
                &payload.rotation_deg,
                &validated.points,
                &validated.color,
                &payload.sort_order,
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
            annotation_id = %id,
            "Updated garden annotation"
        );
        return json_response(200, &row_to_annotation(&row));
    }

    not_found_response()
}

pub async fn delete_my_annotation(
    request: &Request,
    correlation_id: &str,
    annotation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth_context = extract_auth_context_with_fallback(request).await?;
    require_grower(&auth_context)?;

    let user_id = parse_user_id(&auth_context.user_id)?;
    let id = parse_uuid(annotation_id, "annotation id")?;

    let client = db::connect().await?;
    let archived = client
        .execute(
            "
            update garden_annotations
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
        annotation_id = %id,
        "Archived garden annotation"
    );

    Response::builder()
        .status(204)
        .body(Body::Empty)
        .map_err(|e| lambda_http::Error::from(e.to_string()))
}

pub struct ValidatedAnnotation {
    pub label: String,
    pub icon: Option<String>,
    pub shape: Option<String>,
    pub points: Option<serde_json::Value>,
    pub color: Option<String>,
}

pub fn validate_annotation_payload(
    payload: &UpsertGardenAnnotationRequest,
) -> Result<ValidatedAnnotation, lambda_http::Error> {
    let trimmed_label = payload.label.trim();
    if trimmed_label.is_empty() {
        return Err(lambda_http::Error::from(
            "annotation label is required".to_string(),
        ));
    }
    if trimmed_label.len() > MAX_LABEL_LEN {
        return Err(lambda_http::Error::from(format!(
            "annotation label must be {MAX_LABEL_LEN} characters or fewer"
        )));
    }

    let icon = match payload.icon.as_deref().map(str::trim) {
        None | Some("") => None,
        Some(value) if value.chars().count() <= MAX_ICON_LEN => Some(value.to_string()),
        Some(_) => {
            return Err(lambda_http::Error::from(format!(
                "annotation icon must be {MAX_ICON_LEN} characters or fewer"
            )));
        }
    };

    let shape = match payload.shape.as_deref().map(str::trim) {
        None | Some("") => None,
        Some(value) if ALLOWED_SHAPES.contains(&value) => Some(value.to_string()),
        Some(value) => {
            return Err(lambda_http::Error::from(format!(
                "Invalid annotation shape '{value}'. Allowed values: {}",
                ALLOWED_SHAPES.join(", ")
            )));
        }
    };

    if payload.length_inches.is_some_and(|v| v < 0) || payload.width_inches.is_some_and(|v| v < 0) {
        return Err(lambda_http::Error::from(
            "annotation dimensions must be non-negative".to_string(),
        ));
    }

    if let Some(deg) = payload.rotation_deg {
        if !(-360..=360).contains(&deg) {
            return Err(lambda_http::Error::from(
                "rotationDeg must be between -360 and 360".to_string(),
            ));
        }
    }

    let points = validate_points(payload.points.as_ref(), shape.as_deref())?;

    let color = match payload.color.as_deref().map(str::trim) {
        None | Some("") => None,
        Some(value) if is_valid_hex_color(value) => Some(value.to_lowercase()),
        Some(_) => {
            return Err(lambda_http::Error::from(
                "color must be a 7-character hex string like #4f8a3b".to_string(),
            ));
        }
    };

    Ok(ValidatedAnnotation {
        label: trimmed_label.to_string(),
        icon,
        shape,
        points,
        color,
    })
}

fn validate_points(
    raw: Option<&serde_json::Value>,
    shape: Option<&str>,
) -> Result<Option<serde_json::Value>, lambda_http::Error> {
    let Some(value) = raw else {
        if shape == Some("polygon") {
            return Err(lambda_http::Error::from(
                "points is required when shape is polygon".to_string(),
            ));
        }
        if shape == Some("line") {
            return Err(lambda_http::Error::from(
                "points is required when shape is line".to_string(),
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
    if shape == Some("line") && array.len() < 2 {
        return Err(lambda_http::Error::from(
            "points must contain at least 2 entries for a line".to_string(),
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

fn row_to_annotation(row: &Row) -> GardenAnnotation {
    GardenAnnotation {
        id: row.get::<_, Uuid>("id").to_string(),
        user_id: row.get::<_, Uuid>("user_id").to_string(),
        label: row.get("label"),
        icon: row.get("icon"),
        shape: row.get("shape"),
        position_x: row.get("position_x"),
        position_y: row.get("position_y"),
        length_inches: row.get("length_inches"),
        width_inches: row.get("width_inches"),
        rotation_deg: row.get("rotation_deg"),
        points: row.get("points"),
        color: row.get("color"),
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
    error_response(404, "Garden annotation not found").or_else(|_| {
        let body = serde_json::to_string(&ErrorResponse {
            error: "Garden annotation not found".to_string(),
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
    use super::{validate_annotation_payload, UpsertGardenAnnotationRequest};
    use serde_json::json;

    fn payload() -> UpsertGardenAnnotationRequest {
        UpsertGardenAnnotationRequest {
            label: "Old oak".to_string(),
            icon: Some("🌳".to_string()),
            shape: Some("circle".to_string()),
            position_x: Some(120),
            position_y: Some(80),
            length_inches: Some(48),
            width_inches: Some(48),
            rotation_deg: Some(0),
            points: None,
            color: Some("#3a7e5a".to_string()),
            sort_order: Some(0),
        }
    }

    #[test]
    fn accepts_valid_payload() {
        let result = validate_annotation_payload(&payload()).unwrap();
        assert_eq!(result.label, "Old oak");
        assert_eq!(result.shape.as_deref(), Some("circle"));
    }

    #[test]
    fn rejects_blank_label() {
        let mut p = payload();
        p.label = "   ".to_string();
        assert!(validate_annotation_payload(&p).is_err());
    }

    #[test]
    fn rejects_unknown_shape() {
        let mut p = payload();
        p.shape = Some("octagon".to_string());
        assert!(validate_annotation_payload(&p).is_err());
    }

    #[test]
    fn rejects_polygon_without_points() {
        let mut p = payload();
        p.shape = Some("polygon".to_string());
        p.points = None;
        assert!(validate_annotation_payload(&p).is_err());
    }

    #[test]
    fn rejects_line_with_one_point() {
        let mut p = payload();
        p.shape = Some("line".to_string());
        p.points = Some(json!([{"x": 0, "y": 0}]));
        assert!(validate_annotation_payload(&p).is_err());
    }

    #[test]
    fn accepts_line_with_two_points() {
        let mut p = payload();
        p.shape = Some("line".to_string());
        p.points = Some(json!([{"x": 0, "y": 0}, {"x": 240, "y": 0}]));
        assert!(validate_annotation_payload(&p).is_ok());
    }

    #[test]
    fn rejects_negative_dimensions() {
        let mut p = payload();
        p.length_inches = Some(-1);
        assert!(validate_annotation_payload(&p).is_err());
    }

    #[test]
    fn rejects_invalid_color() {
        let mut p = payload();
        p.color = Some("blue".to_string());
        assert!(validate_annotation_payload(&p).is_err());
    }

    #[test]
    fn rejects_long_label() {
        let mut p = payload();
        p.label = "x".repeat(200);
        assert!(validate_annotation_payload(&p).is_err());
    }
}
