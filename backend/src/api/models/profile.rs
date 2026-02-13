use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct GrowerProfile {
    pub home_zone: Option<String>,
    pub geo_key: Option<String>,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
    pub share_radius_km: String,
    pub units: String,
    pub locale: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UserRatingSummary {
    pub avg_score: String,
    pub rating_count: i32,
}

#[derive(Debug, Serialize)]
pub struct MeProfileResponse {
    pub id: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub is_verified: bool,
    pub created_at: String,
    pub grower_profile: Option<GrowerProfile>,
    pub rating_summary: Option<UserRatingSummary>,
}

#[derive(Debug, Serialize)]
pub struct PublicUserResponse {
    pub id: String,
    pub display_name: Option<String>,
    pub created_at: String,
    pub grower_profile: Option<GrowerProfile>,
    pub rating_summary: Option<UserRatingSummary>,
}

#[derive(Debug, Deserialize)]
pub struct UpsertMeProfileRequest {
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub grower_profile: Option<UpsertGrowerProfileRequest>,
}

#[derive(Debug, Deserialize)]
pub struct UpsertGrowerProfileRequest {
    pub home_zone: Option<String>,
    pub geo_key: Option<String>,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
    pub share_radius_km: Option<String>,
    pub units: Option<String>,
    pub locale: Option<String>,
}
