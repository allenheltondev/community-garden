use crate::auth::{extract_auth_context_with_fallback, require_grower};
use crate::db;
use crate::handlers::crop::error_response;
use crate::models::garden_canvas::{
    BackgroundUploadIntentHeaders, BackgroundUploadIntentRequest, BackgroundUploadIntentResponse,
    GardenCanvas, UpsertGardenCanvasRequest,
};
use aws_config::BehaviorVersion;
use aws_sdk_s3::presigning::PresigningConfig;
use lambda_http::{Body, Request, Response};
use serde::Serialize;
use std::env;
use std::time::Duration;
use tokio_postgres::Row;
use tracing::{error, info};
use uuid::Uuid;

const ALLOWED_BACKGROUND_CONTENT_TYPES: [&str; 3] = ["image/jpeg", "image/png", "image/webp"];
const MAX_BACKGROUND_BYTES: u64 = 8 * 1024 * 1024; // 8 MB
const UPLOAD_URL_EXPIRES_SECONDS: u64 = 900; // 15 minutes
const BACKGROUND_KEY_PREFIX: &str = "garden-backgrounds";
const MIN_CANVAS_INCHES: i32 = 12;
const MAX_CANVAS_INCHES: i32 = 12_000;

pub async fn get_my_canvas(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth_context = extract_auth_context_with_fallback(request).await?;
    require_grower(&auth_context)?;
    let user_id = parse_user_id(&auth_context.user_id)?;

    let client = db::connect().await?;
    let row = client
        .query_one(
            "
            insert into garden_canvases (user_id)
            values ($1)
            on conflict (user_id) do update
              set updated_at = garden_canvases.updated_at
            returning id, user_id, width_inches, height_inches,
                      background_image_key, background_opacity, north_offset_deg,
                      created_at, updated_at
            ",
            &[&user_id],
        )
        .await
        .map_err(|e| db_error(&e))?;

    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        "Fetched garden canvas"
    );

    json_response(200, &row_to_canvas(&row))
}

pub async fn update_my_canvas(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth_context = extract_auth_context_with_fallback(request).await?;
    require_grower(&auth_context)?;
    let user_id = parse_user_id(&auth_context.user_id)?;

    let payload: UpsertGardenCanvasRequest = parse_json_body(request)?;
    validate_canvas_payload(&payload)?;

    let client = db::connect().await?;
    let row = client
        .query_one(
            "
            insert into garden_canvases (
                user_id, width_inches, height_inches, background_image_key,
                background_opacity, north_offset_deg
            )
            values (
                $1,
                coalesce($2, 360),
                coalesce($3, 240),
                $4,
                coalesce($5, 60),
                coalesce($6, 0)
            )
            on conflict (user_id) do update
              set width_inches = coalesce(excluded.width_inches, garden_canvases.width_inches),
                  height_inches = coalesce(excluded.height_inches, garden_canvases.height_inches),
                  background_image_key = excluded.background_image_key,
                  background_opacity = coalesce(excluded.background_opacity, garden_canvases.background_opacity),
                  north_offset_deg = coalesce(excluded.north_offset_deg, garden_canvases.north_offset_deg),
                  updated_at = now()
            returning id, user_id, width_inches, height_inches,
                      background_image_key, background_opacity, north_offset_deg,
                      created_at, updated_at
            ",
            &[
                &user_id,
                &payload.width_inches,
                &payload.height_inches,
                &payload.background_image_key,
                &payload.background_opacity,
                &payload.north_offset_deg,
            ],
        )
        .await
        .map_err(|e| db_error(&e))?;

    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        "Updated garden canvas"
    );

    json_response(200, &row_to_canvas(&row))
}

pub async fn create_background_upload_url(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth_context = extract_auth_context_with_fallback(request).await?;
    require_grower(&auth_context)?;
    let user_id = parse_user_id(&auth_context.user_id)?;

    let payload: BackgroundUploadIntentRequest = parse_json_body(request)?;
    let content_type = payload.content_type.trim();
    if !ALLOWED_BACKGROUND_CONTENT_TYPES.contains(&content_type) {
        return Err(lambda_http::Error::from(format!(
            "contentType must be one of: {}",
            ALLOWED_BACKGROUND_CONTENT_TYPES.join(", ")
        )));
    }
    if payload.content_length == 0 {
        return Err(lambda_http::Error::from(
            "contentLength must be a positive integer".to_string(),
        ));
    }
    if payload.content_length > MAX_BACKGROUND_BYTES {
        return Err(lambda_http::Error::from(format!(
            "contentLength must be {MAX_BACKGROUND_BYTES} bytes or fewer"
        )));
    }

    let bucket = env::var("MEDIA_BUCKET_NAME")
        .map_err(|_| lambda_http::Error::from("MEDIA_BUCKET_NAME is not configured".to_string()))?;

    let asset_id = Uuid::new_v4();
    let key = format!("{BACKGROUND_KEY_PREFIX}/{user_id}/{asset_id}");

    let aws_config = aws_config::defaults(BehaviorVersion::latest()).load().await;
    let s3 = aws_sdk_s3::Client::new(&aws_config);

    let presigning_config = PresigningConfig::expires_in(Duration::from_secs(
        UPLOAD_URL_EXPIRES_SECONDS,
    ))
    .map_err(|e| {
        error!(error = %e, "Failed to build presigning config");
        lambda_http::Error::from(format!("Failed to build presigning config: {e}"))
    })?;

    // SAFETY: content_length is bounded to MAX_BACKGROUND_BYTES (8 MB), well within i64.
    let content_length_i64 = i64::try_from(payload.content_length)
        .map_err(|_| lambda_http::Error::from("contentLength out of range".to_string()))?;

    let presigned = s3
        .put_object()
        .bucket(&bucket)
        .key(&key)
        .content_type(content_type)
        .content_length(content_length_i64)
        .presigned(presigning_config)
        .await
        .map_err(|e| {
            error!(error = %e, "Failed to presign garden background upload");
            lambda_http::Error::from(format!("Failed to presign upload: {e}"))
        })?;

    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        s3_key = key.as_str(),
        "Issued garden background presigned upload URL"
    );

    let response = BackgroundUploadIntentResponse {
        upload_url: presigned.uri().to_string(),
        method: "PUT".to_string(),
        headers: BackgroundUploadIntentHeaders {
            content_type: content_type.to_string(),
        },
        s3_key: key,
        expires_in_seconds: UPLOAD_URL_EXPIRES_SECONDS,
    };

    json_response(201, &response)
}

fn validate_canvas_payload(payload: &UpsertGardenCanvasRequest) -> Result<(), lambda_http::Error> {
    if let Some(width) = payload.width_inches {
        if !(MIN_CANVAS_INCHES..=MAX_CANVAS_INCHES).contains(&width) {
            return Err(lambda_http::Error::from(format!(
                "widthInches must be between {MIN_CANVAS_INCHES} and {MAX_CANVAS_INCHES}"
            )));
        }
    }
    if let Some(height) = payload.height_inches {
        if !(MIN_CANVAS_INCHES..=MAX_CANVAS_INCHES).contains(&height) {
            return Err(lambda_http::Error::from(format!(
                "heightInches must be between {MIN_CANVAS_INCHES} and {MAX_CANVAS_INCHES}"
            )));
        }
    }
    if let Some(opacity) = payload.background_opacity {
        if !(0..=100).contains(&opacity) {
            return Err(lambda_http::Error::from(
                "backgroundOpacity must be between 0 and 100".to_string(),
            ));
        }
    }
    if let Some(offset) = payload.north_offset_deg {
        if !(-360..=360).contains(&offset) {
            return Err(lambda_http::Error::from(
                "northOffsetDeg must be between -360 and 360".to_string(),
            ));
        }
    }
    if let Some(key) = payload.background_image_key.as_deref() {
        let trimmed = key.trim();
        if trimmed.is_empty() {
            return Err(lambda_http::Error::from(
                "backgroundImageKey must not be empty when provided".to_string(),
            ));
        }
        if !trimmed.starts_with(&format!("{BACKGROUND_KEY_PREFIX}/")) {
            return Err(lambda_http::Error::from(format!(
                "backgroundImageKey must live under {BACKGROUND_KEY_PREFIX}/"
            )));
        }
        if trimmed.contains("..") {
            return Err(lambda_http::Error::from(
                "backgroundImageKey must not contain path traversal segments".to_string(),
            ));
        }
    }
    Ok(())
}

fn parse_user_id(value: &str) -> Result<Uuid, lambda_http::Error> {
    Uuid::parse_str(value).map_err(|_| lambda_http::Error::from("Invalid user ID format"))
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

fn row_to_canvas(row: &Row) -> GardenCanvas {
    GardenCanvas {
        id: row.get::<_, Uuid>("id").to_string(),
        user_id: row.get::<_, Uuid>("user_id").to_string(),
        width_inches: row.get("width_inches"),
        height_inches: row.get("height_inches"),
        background_image_key: row.get("background_image_key"),
        background_opacity: row.get("background_opacity"),
        north_offset_deg: row.get("north_offset_deg"),
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

#[allow(dead_code)]
fn not_found_response() -> Result<Response<Body>, lambda_http::Error> {
    error_response(404, "Garden canvas not found")
}

fn db_error(error: &tokio_postgres::Error) -> lambda_http::Error {
    lambda_http::Error::from(format!("Database query error: {error}"))
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::{validate_canvas_payload, UpsertGardenCanvasRequest};

    fn payload() -> UpsertGardenCanvasRequest {
        UpsertGardenCanvasRequest {
            width_inches: Some(360),
            height_inches: Some(240),
            background_image_key: None,
            background_opacity: Some(60),
            north_offset_deg: Some(0),
        }
    }

    #[test]
    fn accepts_valid_payload() {
        assert!(validate_canvas_payload(&payload()).is_ok());
    }

    #[test]
    fn rejects_too_small_width() {
        let mut p = payload();
        p.width_inches = Some(1);
        assert!(validate_canvas_payload(&p).is_err());
    }

    #[test]
    fn rejects_too_large_height() {
        let mut p = payload();
        p.height_inches = Some(1_000_000);
        assert!(validate_canvas_payload(&p).is_err());
    }

    #[test]
    fn rejects_opacity_out_of_range() {
        let mut p = payload();
        p.background_opacity = Some(120);
        assert!(validate_canvas_payload(&p).is_err());
    }

    #[test]
    fn rejects_north_offset_out_of_range() {
        let mut p = payload();
        p.north_offset_deg = Some(1_000);
        assert!(validate_canvas_payload(&p).is_err());
    }

    #[test]
    fn rejects_background_key_outside_prefix() {
        let mut p = payload();
        p.background_image_key = Some("other-prefix/foo.jpg".to_string());
        assert!(validate_canvas_payload(&p).is_err());
    }

    #[test]
    fn rejects_empty_background_key() {
        let mut p = payload();
        p.background_image_key = Some("   ".to_string());
        assert!(validate_canvas_payload(&p).is_err());
    }

    #[test]
    fn rejects_background_key_with_path_traversal() {
        let mut p = payload();
        p.background_image_key = Some("garden-backgrounds/../etc/passwd".to_string());
        assert!(validate_canvas_payload(&p).is_err());
    }

    #[test]
    fn accepts_well_formed_background_key() {
        let mut p = payload();
        p.background_image_key =
            Some("garden-backgrounds/00000000-0000-0000-0000-000000000000/abc.jpg".to_string());
        assert!(validate_canvas_payload(&p).is_ok());
    }
}
