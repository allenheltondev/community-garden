use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct GardenBed {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub description: Option<String>,
    pub sun_exposure: Option<String>,
    pub soil_type: Option<String>,
    pub length_inches: Option<i32>,
    pub width_inches: Option<i32>,
    pub location_notes: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct UpsertGardenBedRequest {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default, alias = "sunExposure")]
    pub sun_exposure: Option<String>,
    #[serde(default, alias = "soilType")]
    pub soil_type: Option<String>,
    #[serde(default, alias = "lengthInches")]
    pub length_inches: Option<i32>,
    #[serde(default, alias = "widthInches")]
    pub width_inches: Option<i32>,
    #[serde(default, alias = "locationNotes")]
    pub location_notes: Option<String>,
    #[serde(default, alias = "sortOrder")]
    pub sort_order: Option<i32>,
}
