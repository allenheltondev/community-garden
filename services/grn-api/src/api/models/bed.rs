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
    pub bed_type: String,
    pub shape: String,
    pub position_x: Option<i32>,
    pub position_y: Option<i32>,
    pub rotation_deg: i32,
    pub points: Option<serde_json::Value>,
    pub color: Option<String>,
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
    #[serde(default, alias = "bedType")]
    pub bed_type: Option<String>,
    #[serde(default)]
    pub shape: Option<String>,
    #[serde(default, alias = "positionX")]
    pub position_x: Option<i32>,
    #[serde(default, alias = "positionY")]
    pub position_y: Option<i32>,
    #[serde(default, alias = "rotationDeg")]
    pub rotation_deg: Option<i32>,
    #[serde(default)]
    pub points: Option<serde_json::Value>,
    #[serde(default)]
    pub color: Option<String>,
}
