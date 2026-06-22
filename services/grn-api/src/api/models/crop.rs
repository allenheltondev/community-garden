use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct GrowerCropItem {
    pub id: String,
    pub user_id: String,
    pub crop_id: Option<String>,
    pub canonical_id: Option<String>,
    pub crop_name: String,
    pub variety_id: Option<String>,
    pub status: String,
    pub visibility: String,
    pub surplus_enabled: bool,
    pub nickname: Option<String>,
    pub default_unit: Option<String>,
    pub notes: Option<String>,
    pub bed_id: Option<String>,
    pub bed_name: Option<String>,
    pub planting_date: Option<String>,
    pub expected_harvest_date: Option<String>,
    pub plant_count: Option<i32>,
    pub spacing_inches: Option<i32>,
    /// Garden pyramid layer (1=Foundation .. 5=Joy) resolved from the linked
    /// catalog crop. None when the crop has no catalog link or is not part of
    /// the food pyramid (e.g. ornamentals).
    #[serde(default)]
    pub pyramid_tier: Option<i16>,
    /// Running total of everything harvested for this crop, summed across all
    /// logged harvests. Returned as a string to avoid float precision issues,
    /// mirroring how listing quantities are serialized. Only populated on the
    /// crop detail read; omitted from the list response to keep it cheap.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_harvested: Option<String>,
    /// Number of harvest entries logged for this crop. Only populated on the
    /// crop detail read.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub harvest_count: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct UpsertGrowerCropRequest {
    #[serde(default, alias = "canonicalId", alias = "crop_id", alias = "cropId")]
    pub canonical_id: Option<String>,
    #[serde(default, alias = "cropName")]
    pub crop_name: Option<String>,
    #[serde(default, alias = "varietyId")]
    pub variety_id: Option<String>,
    pub status: String,
    pub visibility: String,
    #[serde(alias = "surplusEnabled")]
    pub surplus_enabled: bool,
    pub nickname: Option<String>,
    #[serde(default, alias = "defaultUnit")]
    pub default_unit: Option<String>,
    pub notes: Option<String>,
    #[serde(default, alias = "bedId")]
    pub bed_id: Option<String>,
    #[serde(default, alias = "plantingDate")]
    pub planting_date: Option<String>,
    #[serde(default, alias = "expectedHarvestDate")]
    pub expected_harvest_date: Option<String>,
    #[serde(default, alias = "plantCount")]
    pub plant_count: Option<i32>,
    #[serde(default, alias = "spacingInches")]
    pub spacing_inches: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

/// Request body for logging a harvest against a grower crop.
#[derive(Debug, Deserialize)]
pub struct RecordHarvestRequest {
    pub amount: f64,
    /// Unit for the amount (e.g. "lb", "bunch"). Falls back to the crop's
    /// `default_unit` when omitted.
    #[serde(default)]
    pub unit: Option<String>,
    /// Date the harvest was brought in (YYYY-MM-DD). Defaults to today.
    #[serde(default, alias = "harvestedOn")]
    pub harvested_on: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

/// A single logged harvest entry.
#[derive(Debug, Serialize)]
pub struct HarvestItem {
    pub id: String,
    #[serde(rename = "growerCropId")]
    pub grower_crop_id: String,
    /// Serialized as a string to avoid float precision issues.
    pub amount: String,
    pub unit: Option<String>,
    #[serde(rename = "harvestedOn")]
    pub harvested_on: String,
    pub notes: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

/// Harvest log for one crop: the running total plus every logged entry.
#[derive(Debug, Serialize)]
pub struct HarvestLogResponse {
    #[serde(rename = "growerCropId")]
    pub grower_crop_id: String,
    #[serde(rename = "totalHarvested")]
    pub total_harvested: String,
    #[serde(rename = "harvestCount")]
    pub harvest_count: i64,
    pub harvests: Vec<HarvestItem>,
}

/// Response returned after logging a single harvest: the new entry plus the
/// updated running total for the crop.
#[derive(Debug, Serialize)]
pub struct RecordHarvestResponse {
    pub harvest: HarvestItem,
    #[serde(rename = "totalHarvested")]
    pub total_harvested: String,
    #[serde(rename = "harvestCount")]
    pub harvest_count: i64,
}
