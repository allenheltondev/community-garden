use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct GardenCanvas {
    pub id: String,
    pub user_id: String,
    pub width_inches: i32,
    pub height_inches: i32,
    pub background_image_key: Option<String>,
    pub background_image_url: Option<String>,
    pub background_opacity: i16,
    pub north_offset_deg: i16,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct UpsertGardenCanvasRequest {
    #[serde(default, alias = "widthInches")]
    pub width_inches: Option<i32>,
    #[serde(default, alias = "heightInches")]
    pub height_inches: Option<i32>,
    #[serde(default, alias = "backgroundImageKey")]
    pub background_image_key: Option<String>,
    #[serde(default, alias = "backgroundOpacity")]
    pub background_opacity: Option<i16>,
    #[serde(default, alias = "northOffsetDeg")]
    pub north_offset_deg: Option<i16>,
}

#[derive(Debug, Deserialize)]
pub struct BackgroundUploadIntentRequest {
    #[serde(alias = "contentType")]
    pub content_type: String,
    #[serde(alias = "contentLength")]
    pub content_length: u64,
}

#[derive(Debug, Serialize)]
pub struct BackgroundUploadIntentResponse {
    pub upload_url: String,
    pub method: String,
    pub headers: BackgroundUploadIntentHeaders,
    pub s3_key: String,
    pub expires_in_seconds: u64,
}

#[derive(Debug, Serialize)]
pub struct BackgroundUploadIntentHeaders {
    #[serde(rename = "Content-Type")]
    pub content_type: String,
}
