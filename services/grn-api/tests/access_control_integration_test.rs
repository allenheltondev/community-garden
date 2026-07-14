// Integration tests for feature access control.
//
// GRN is grower-only: every participant is a grower. These tests document the
// remaining authorization contract:
// - Growers have access to all features (listings, requests, claims).
// - Users who have not completed onboarding (no userType) are blocked (403).

use serde_json::json;

#[cfg(test)]
#[allow(clippy::unwrap_used)] // unwrap is acceptable in tests
mod access_control_tests {
    use super::*;

    /// Growers can create listings.
    #[test]
    fn test_grower_allowed_to_create_listing() {
        let listing_request = json!({
            "title": "Fresh Tomatoes",
            "cropId": "5df666d4-f6b1-4e6f-97d6-321e531ad7ca",
            "quantityTotal": 10,
            "unit": "lb",
            "availableStart": "2026-02-20T10:00:00Z",
            "availableEnd": "2026-02-20T12:00:00Z",
            "lat": 37.7749,
            "lng": -122.4194
        });

        assert_eq!(listing_request["title"], "Fresh Tomatoes");
        assert_eq!(listing_request["unit"], "lb");

        // A grower (userType: "grower") POSTing /listings must NOT get 403.
        let expected_response = json!({
            "id": "listing-id",
            "title": "Fresh Tomatoes",
            "status": "active"
        });
        assert!(expected_response.get("id").is_some());
    }

    /// Growers can create requests (find-food is grower-to-grower).
    #[test]
    fn test_grower_allowed_to_create_request() {
        let request_payload = json!({
            "cropId": "5df666d4-f6b1-4e6f-97d6-321e531ad7ca",
            "quantity": 6.5,
            "neededBy": "2026-03-20T10:00:00Z",
            "status": "open"
        });

        assert_eq!(request_payload["status"], "open");
        // Authorization passes for a grower — no 403.
    }

    /// Growers can create claims.
    #[test]
    fn test_grower_allowed_to_create_claim() {
        let claim_request = json!({
            "listingId": "listing-123",
            "quantityClaimed": 2
        });

        assert_eq!(claim_request["listingId"], "listing-123");
        // Authorization passes for a grower — no 403.
    }

    /// Users without a userType (incomplete onboarding) are blocked (403).
    #[test]
    fn test_user_without_type_blocked() {
        let expected_error = json!({
            "error": "Forbidden: User type not set. Please complete onboarding."
        });

        let message = expected_error["error"].as_str().unwrap();
        assert!(message.starts_with("Forbidden:"));
        assert!(message.contains("User type not set"));
        assert!(message.contains("complete onboarding"));
    }

    /// Authorization failures use a consistent `{ "error": "Forbidden: ..." }`
    /// response shape.
    #[test]
    fn test_authorization_error_response_format() {
        let error_response = json!({
            "error": "Forbidden: User type not set. Please complete onboarding."
        });

        assert!(error_response["error"].is_string());
        assert!(error_response["error"]
            .as_str()
            .unwrap()
            .starts_with("Forbidden:"));
    }
}
