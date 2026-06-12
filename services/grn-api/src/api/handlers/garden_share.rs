use crate::auth::extract_auth_context;
use crate::db;
use lambda_http::{Body, Request, Response};
use serde::Serialize;
use tokio_postgres::Row;
use uuid::Uuid;

// Public read-only sharing of the garden masterplan.
//
// Authenticated owners manage one link via /me/garden/share; anyone with
// the token reads a privacy-trimmed snapshot via GET /shared-gardens/{token}
// (allow-listed as a public route in the authorizer). Revoking keeps the
// row and re-sharing mints a fresh token, so a leaked URL stays dead.

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareLinkResponse {
    pub token: String,
    pub created_at: String,
}

// The public payload deliberately carries no user identity and none of the
// free-text fields where people write personal details (descriptions,
// location notes). Sun and soil stay: they're horticultural context, and
// sharing the garden is an explicit act by the owner.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedGardenResponse {
    pub canvas: SharedCanvas,
    pub beds: Vec<SharedBed>,
    pub annotations: Vec<SharedAnnotation>,
    pub crops: Vec<SharedCrop>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedCanvas {
    pub width_inches: i32,
    pub height_inches: i32,
    pub north_offset_deg: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedBed {
    pub id: String,
    pub name: String,
    pub bed_type: String,
    pub shape: String,
    pub sun_exposure: Option<String>,
    pub soil_type: Option<String>,
    pub length_inches: Option<i32>,
    pub width_inches: Option<i32>,
    pub position_x: Option<i32>,
    pub position_y: Option<i32>,
    pub rotation_deg: i32,
    pub points: Option<serde_json::Value>,
    pub color: Option<String>,
    pub sort_order: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedAnnotation {
    pub id: String,
    pub label: String,
    pub icon: Option<String>,
    pub shape: String,
    pub position_x: Option<i32>,
    pub position_y: Option<i32>,
    pub length_inches: Option<i32>,
    pub width_inches: Option<i32>,
    pub rotation_deg: i32,
    pub points: Option<serde_json::Value>,
    pub color: Option<String>,
    pub sort_order: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedCrop {
    pub bed_id: String,
    pub crop_name: String,
    pub plant_count: Option<i32>,
}

const DEFAULT_CANVAS_WIDTH_INCHES: i32 = 360;
const DEFAULT_CANVAS_HEIGHT_INCHES: i32 = 240;

pub async fn get_my_share_link(
    request: &Request,
    _correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth = extract_auth_context(request)?;
    let user_id = parse_user_id(&auth.user_id)?;

    let client = db::connect().await?;
    let row = client
        .query_opt(
            "select token, created_at from garden_share_links
             where user_id = $1 and revoked_at is null",
            &[&user_id],
        )
        .await
        .map_err(|e| db_error(&e))?;

    row.map_or_else(
        || error_response(404, "No active share link"),
        |row| json_response(200, &row_to_share_link(&row)),
    )
}

pub async fn create_my_share_link(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth = extract_auth_context(request)?;
    let user_id = parse_user_id(&auth.user_id)?;

    let client = db::connect().await?;

    // Idempotent: an active link is returned as-is; a revoked (or absent)
    // one gets a freshly minted token.
    if let Some(existing) = client
        .query_opt(
            "select token, created_at from garden_share_links
             where user_id = $1 and revoked_at is null",
            &[&user_id],
        )
        .await
        .map_err(|e| db_error(&e))?
    {
        return json_response(200, &row_to_share_link(&existing));
    }

    let token = Uuid::new_v4().simple().to_string();
    let row = client
        .query_one(
            "insert into garden_share_links (user_id, token)
             values ($1, $2)
             on conflict (user_id) do update
               set token = excluded.token,
                   revoked_at = null,
                   updated_at = now()
             returning token, created_at",
            &[&user_id, &token],
        )
        .await
        .map_err(|e| db_error(&e))?;

    tracing::info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        "Created garden share link"
    );

    json_response(201, &row_to_share_link(&row))
}

pub async fn revoke_my_share_link(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth = extract_auth_context(request)?;
    let user_id = parse_user_id(&auth.user_id)?;

    let client = db::connect().await?;
    client
        .execute(
            "update garden_share_links set revoked_at = now(), updated_at = now()
             where user_id = $1 and revoked_at is null",
            &[&user_id],
        )
        .await
        .map_err(|e| db_error(&e))?;

    tracing::info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        "Revoked garden share link"
    );

    Response::builder()
        .status(204)
        .body(Body::Empty)
        .map_err(|e| lambda_http::Error::from(e.to_string()))
}

pub async fn get_shared_garden(
    token: &str,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    // Reject malformed tokens before touching the database; the constant
    // 404 below never distinguishes unknown from revoked.
    if !is_valid_token(token) {
        return error_response(404, "Garden not found");
    }

    let client = db::connect().await?;
    let Some(owner_row) = client
        .query_opt(
            "select user_id from garden_share_links
             where token = $1 and revoked_at is null",
            &[&token],
        )
        .await
        .map_err(|e| db_error(&e))?
    else {
        return error_response(404, "Garden not found");
    };
    let user_id: Uuid = owner_row.get("user_id");

    let canvas_row = client
        .query_opt(
            "select width_inches, height_inches, north_offset_deg::int as north_offset_deg
             from garden_canvases where user_id = $1",
            &[&user_id],
        )
        .await
        .map_err(|e| db_error(&e))?;
    let canvas = canvas_row.map_or(
        SharedCanvas {
            width_inches: DEFAULT_CANVAS_WIDTH_INCHES,
            height_inches: DEFAULT_CANVAS_HEIGHT_INCHES,
            north_offset_deg: 0,
        },
        |row| SharedCanvas {
            width_inches: row.get("width_inches"),
            height_inches: row.get("height_inches"),
            north_offset_deg: row.get("north_offset_deg"),
        },
    );

    let bed_rows = client
        .query(
            "select id, name, bed_type::text as bed_type, shape, sun_exposure::text as sun_exposure,
                    soil_type, length_inches, width_inches, position_x, position_y,
                    rotation_deg, points, color, sort_order
             from garden_beds
             where user_id = $1 and archived_at is null
             order by sort_order asc, created_at asc",
            &[&user_id],
        )
        .await
        .map_err(|e| db_error(&e))?;

    let annotation_rows = client
        .query(
            "select id, label, icon, shape, position_x, position_y,
                    length_inches, width_inches, rotation_deg, points, color, sort_order
             from garden_annotations
             where user_id = $1 and archived_at is null
             order by sort_order asc, created_at asc",
            &[&user_id],
        )
        .await
        .map_err(|e| db_error(&e))?;

    // Private crops never leave the account; local/public crops appear by
    // name only — no surplus, pricing, or contact data.
    let crop_rows = client
        .query(
            "select g.bed_id, g.crop_name, g.plant_count
             from grower_crop_library g
             join garden_beds b on b.id = g.bed_id and b.archived_at is null
             where g.user_id = $1
               and g.bed_id is not null
               and g.visibility in ('local', 'public')",
            &[&user_id],
        )
        .await
        .map_err(|e| db_error(&e))?;

    let response = SharedGardenResponse {
        canvas,
        beds: bed_rows.iter().map(row_to_shared_bed).collect(),
        annotations: annotation_rows
            .iter()
            .map(row_to_shared_annotation)
            .collect(),
        crops: crop_rows.iter().map(row_to_shared_crop).collect(),
    };

    tracing::info!(
        correlation_id = correlation_id,
        bed_count = response.beds.len(),
        annotation_count = response.annotations.len(),
        "Served shared garden"
    );

    json_response(200, &response)
}

// Tokens are uuid v4 simple format: exactly 32 lowercase hex characters.
fn is_valid_token(token: &str) -> bool {
    token.len() == 32
        && token
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

fn row_to_share_link(row: &Row) -> ShareLinkResponse {
    ShareLinkResponse {
        token: row.get("token"),
        created_at: row
            .get::<_, chrono::DateTime<chrono::Utc>>("created_at")
            .to_rfc3339(),
    }
}

fn row_to_shared_bed(row: &Row) -> SharedBed {
    SharedBed {
        id: row.get::<_, Uuid>("id").to_string(),
        name: row.get("name"),
        bed_type: row.get("bed_type"),
        shape: row.get("shape"),
        sun_exposure: row.get("sun_exposure"),
        soil_type: row.get("soil_type"),
        length_inches: row.get("length_inches"),
        width_inches: row.get("width_inches"),
        position_x: row.get("position_x"),
        position_y: row.get("position_y"),
        rotation_deg: row.get("rotation_deg"),
        points: row.get("points"),
        color: row.get("color"),
        sort_order: row.get("sort_order"),
    }
}

fn row_to_shared_annotation(row: &Row) -> SharedAnnotation {
    SharedAnnotation {
        id: row.get::<_, Uuid>("id").to_string(),
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
    }
}

fn row_to_shared_crop(row: &Row) -> SharedCrop {
    SharedCrop {
        bed_id: row.get::<_, Uuid>("bed_id").to_string(),
        crop_name: row.get("crop_name"),
        plant_count: row.get("plant_count"),
    }
}

fn parse_user_id(raw: &str) -> Result<Uuid, lambda_http::Error> {
    Uuid::parse_str(raw).map_err(|_| lambda_http::Error::from("Invalid user ID format"))
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

fn error_response(status: u16, message: &str) -> Result<Response<Body>, lambda_http::Error> {
    json_response(status, &serde_json::json!({ "error": message }))
}

fn db_error(error: &tokio_postgres::Error) -> lambda_http::Error {
    lambda_http::Error::from(format!("Database query error: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn serialized_keys(json: &serde_json::Value) -> Vec<String> {
        json.as_object()
            .map(|object| object.keys().cloned().collect())
            .unwrap_or_default()
    }

    #[test]
    fn token_validation_accepts_uuid_simple_format() {
        let token = Uuid::new_v4().simple().to_string();
        assert!(is_valid_token(&token));
    }

    #[test]
    fn token_validation_rejects_malformed_input() {
        assert!(!is_valid_token(""));
        assert!(!is_valid_token("short"));
        assert!(!is_valid_token(&"a".repeat(33)));
        assert!(!is_valid_token("ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"));
        assert!(!is_valid_token("'; drop table garden_share_links;"));
        assert!(!is_valid_token("AbCdEf0123456789abcdef0123456789"));
    }

    #[test]
    fn shared_bed_payload_carries_no_identity_or_private_text() {
        let bed = SharedBed {
            id: "bed-1".to_string(),
            name: "Herb spiral".to_string(),
            bed_type: "raised".to_string(),
            shape: "rect".to_string(),
            sun_exposure: Some("full_sun".to_string()),
            soil_type: None,
            length_inches: Some(96),
            width_inches: Some(48),
            position_x: Some(24),
            position_y: Some(24),
            rotation_deg: 0,
            points: None,
            color: None,
            sort_order: 0,
        };
        let keys = serialized_keys(&serde_json::to_value(&bed).unwrap_or_default());
        assert!(keys.iter().any(|k| k == "lengthInches"));
        assert!(!keys.iter().any(|k| k == "userId"));
        assert!(!keys.iter().any(|k| k == "description"));
        assert!(!keys.iter().any(|k| k == "locationNotes"));
    }

    #[test]
    fn shared_crop_payload_is_name_and_count_only() {
        let crop = SharedCrop {
            bed_id: "bed-1".to_string(),
            crop_name: "Tomato".to_string(),
            plant_count: Some(4),
        };
        let keys = serialized_keys(&serde_json::to_value(&crop).unwrap_or_default());
        assert_eq!(keys.len(), 3);
        assert!(!keys.iter().any(|k| k == "userId"));
        assert!(!keys.iter().any(|k| k == "surplusEnabled"));
        assert!(!keys.iter().any(|k| k == "notes"));
    }
}
