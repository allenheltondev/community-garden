use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListingItem {
    pub id: String,
    pub user_id: String,
    pub grower_crop_id: Option<String>,
    pub crop_id: Option<String>,
    pub variety_id: Option<String>,
    pub title: Option<String>,
    pub unit: Option<String>,
    pub quantity_total: Option<String>,
    pub quantity_remaining: Option<String>,
    pub available_start: Option<String>,
    pub available_end: Option<String>,
    pub status: String,
    pub pickup_location_text: Option<String>,
    pub pickup_address: Option<String>,
    pub effective_pickup_address: Option<String>,
    pub pickup_disclosure_policy: String,
    pub pickup_notes: Option<String>,
    pub contact_pref: String,
    pub geo_key: Option<String>,
    pub lat: Option<f64>,
    pub lng: Option<f64>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListMyListingsResponse {
    pub items: Vec<ListingItem>,
    pub limit: i64,
    pub offset: i64,
    pub has_more: bool,
    pub next_offset: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverListingsResponse {
    pub items: Vec<ListingItem>,
    pub limit: i64,
    pub offset: i64,
    pub has_more: bool,
    pub next_offset: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::ListingItem;

    #[test]
    fn custom_crop_listing_serializes_without_a_catalog_crop() {
        let listing = ListingItem {
            id: "listing-id".to_string(),
            user_id: "user-id".to_string(),
            grower_crop_id: Some("grower-crop-id".to_string()),
            crop_id: None,
            variety_id: None,
            title: Some("Purple yard beans".to_string()),
            unit: Some("bunch".to_string()),
            quantity_total: Some("3".to_string()),
            quantity_remaining: Some("3".to_string()),
            available_start: Some("2026-07-15T12:00:00Z".to_string()),
            available_end: Some("2026-07-17T12:00:00Z".to_string()),
            status: "active".to_string(),
            pickup_location_text: Some("Front porch".to_string()),
            pickup_address: None,
            effective_pickup_address: Some("1100 Congress Ave, Austin, TX 78701".to_string()),
            pickup_disclosure_policy: "after_confirmed".to_string(),
            pickup_notes: None,
            contact_pref: "app_message".to_string(),
            geo_key: Some("9v6kpv".to_string()),
            lat: Some(30.2747),
            lng: Some(-97.7404),
            created_at: "2026-07-15T12:00:00Z".to_string(),
        };

        let serialized = serde_json::json!(listing);

        assert_eq!(serialized["growerCropId"], "grower-crop-id");
        assert!(serialized["cropId"].is_null());
    }
}
