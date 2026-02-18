use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GrowerProfile {
    pub home_zone: String,
    pub share_radius_km: f64,
    pub units: String,
    pub locale: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertGrowerProfileRequest {
    pub home_zone: String,
    pub share_radius_km: f64,
    pub units: String,
    pub locale: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub field: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ErrorResponse {
    pub error: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Vec<ValidationIssue>>,
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn grower_profile_serializes_with_camel_case_keys() {
        let profile = GrowerProfile {
            home_zone: "8a".to_string(),
            share_radius_km: 5.5,
            units: "metric".to_string(),
            locale: "en-US".to_string(),
        };

        let json = serde_json::to_value(profile).unwrap();
        assert_eq!(json["homeZone"], "8a");
        assert_eq!(json["shareRadiusKm"], 5.5);
        assert_eq!(json["units"], "metric");
        assert_eq!(json["locale"], "en-US");
    }

    #[test]
    fn error_response_omits_details_when_none() {
        let response = ErrorResponse {
            error: "NotFound".to_string(),
            message: "No profile found".to_string(),
            details: None,
        };

        let json = serde_json::to_value(response).unwrap();
        assert_eq!(json["error"], "NotFound");
        assert_eq!(json["message"], "No profile found");
        assert!(json.get("details").is_none());
    }
}
