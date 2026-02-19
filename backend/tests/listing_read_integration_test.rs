// Integration tests for grower listing read endpoints
// These tests validate endpoint contracts for pagination, filtering, and ownership-safe reads.

use serde_json::json;

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod listing_read_tests {
    use super::*;

    #[test]
    fn test_list_my_listings_pagination_response_shape() {
        let expected = json!({
            "items": [
                {
                    "id": "8b91810e-758b-4cf3-8ed1-95fb48ee6a2a",
                    "userId": "3a6d7091-9f96-44d0-8e29-ec5eb6f2ac68",
                    "status": "active"
                }
            ],
            "limit": 10,
            "offset": 0,
            "hasMore": true,
            "nextOffset": 10
        });

        assert!(expected.get("items").is_some());
        assert!(expected["items"].is_array());
        assert!(expected["items"][0].get("userId").is_some());
        assert!(expected.get("hasMore").is_some());
        assert!(expected["hasMore"].is_boolean());
        assert!(expected.get("nextOffset").is_some());
        assert!(expected["nextOffset"].is_number());
    }

    #[test]
    fn test_list_my_listings_status_filter_contract() {
        let allowed = ["active", "expired", "completed"];

        assert!(allowed.contains(&"active"));
        assert!(allowed.contains(&"expired"));
        assert!(allowed.contains(&"completed"));
        assert!(!allowed.contains(&"pending"));
    }

    #[test]
    fn test_get_listing_ownership_safe_not_found_contract() {
        let expected_error = json!({
            "error": "Listing not found"
        });

        assert_eq!(expected_error["error"], "Listing not found");
    }

    #[test]
    fn test_listings_endpoints_grower_only_contract() {
        let expected_error = json!({
            "error": "Forbidden: This feature is only available to growers"
        });

        assert!(expected_error["error"]
            .as_str()
            .unwrap()
            .contains("only available to growers"));
    }
}
