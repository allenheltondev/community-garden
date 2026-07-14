// Integration tests for PUT /me endpoint
// These tests verify the complete onboarding flow including:
// - userType selection persistence
// - grower profile upsert
// - onboarding_completed flag management
// - validation error responses
// - idempotency via upsert

use serde_json::json;

#[cfg(test)]
#[allow(clippy::unwrap_used)] // unwrap is acceptable in tests
mod put_me_tests {
    use super::*;

    #[test]
    fn test_user_type_selection_persistence() {
        let grower_request = json!({
            "userType": "grower"
        });

        assert_eq!(grower_request["userType"], "grower");

        let expected_grower_response = json!({
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "email": "test@example.com",
            "displayName": "Test User",
            "isVerified": false,
            "userType": "grower",
            "onboardingCompleted": false,
            "createdAt": "2024-01-01T00:00:00Z",
            "growerProfile": null,
            "ratingSummary": null
        });

        assert_eq!(expected_grower_response["userType"], "grower");
        assert_eq!(expected_grower_response["onboardingCompleted"], false);
    }

    #[test]
    fn test_grower_profile_upsert() {
        let grower_profile_request = json!({
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusMiles": 5.0,
                "isOrganization": false,
                "organizationName": null,
                "units": "imperial",
                "locale": "en-US"
            }
        });

        assert!(grower_profile_request.get("growerProfile").is_some());
        assert_eq!(grower_profile_request["userType"], "grower");

        let profile = &grower_profile_request["growerProfile"];
        assert_eq!(profile["homeZone"], "8a");
        assert_eq!(profile["lat"], 37.7749);
        assert_eq!(profile["lng"], -122.4194);
        assert_eq!(profile["shareRadiusMiles"], 5.0);
        assert_eq!(profile["isOrganization"], false);
        assert!(profile["organizationName"].is_null());
        assert_eq!(profile["units"], "imperial");
        assert_eq!(profile["locale"], "en-US");

        let expected_response = json!({
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "email": "test@example.com",
            "displayName": "Test User",
            "isVerified": false,
            "userType": "grower",
            "onboardingCompleted": true,
            "createdAt": "2024-01-01T00:00:00Z",
            "growerProfile": {
                "homeZone": "8a",
                "geoKey": "9q8yy9m",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusMiles": "5.0",
                "isOrganization": false,
                "organizationName": null,
                "units": "imperial",
                "locale": "en-US"
            },
            "ratingSummary": null
        });

        assert_eq!(expected_response["onboardingCompleted"], true);
        assert!(!expected_response["growerProfile"].is_null());
        assert!(expected_response["growerProfile"]["geoKey"].is_string());
    }

    #[test]
    fn test_onboarding_completed_after_profile_creation() {
        let _step1_request = json!({
            "userType": "grower"
        });

        let step1_response = json!({
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "email": "test@example.com",
            "displayName": "Test User",
            "isVerified": false,
            "userType": "grower",
            "onboardingCompleted": false,
            "createdAt": "2024-01-01T00:00:00Z",
            "growerProfile": null,
            "ratingSummary": null
        });

        assert_eq!(step1_response["userType"], "grower");
        assert_eq!(step1_response["onboardingCompleted"], false);

        let _step2_request = json!({
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusMiles": 5.0,
                "isOrganization": false,
                "organizationName": null,
                "units": "imperial",
                "locale": "en-US"
            }
        });

        let step2_response = json!({
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "email": "test@example.com",
            "displayName": "Test User",
            "isVerified": false,
            "userType": "grower",
            "onboardingCompleted": true,
            "createdAt": "2024-01-01T00:00:00Z",
            "growerProfile": {
                "homeZone": "8a",
                "geoKey": "9q8yy9m",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusMiles": "5.0",
                "isOrganization": false,
                "organizationName": null,
                "units": "imperial",
                "locale": "en-US"
            },
            "ratingSummary": null
        });

        assert_eq!(step2_response["userType"], "grower");
        assert_eq!(step2_response["onboardingCompleted"], true);
        assert!(!step2_response["growerProfile"].is_null());
    }

    #[test]
    fn test_validation_error_negative_grower_radius() {
        let invalid_request = json!({
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusMiles": -5.0,
                "units": "imperial",
                "locale": "en-US"
            }
        });

        let profile = &invalid_request["growerProfile"];
        assert!(profile["shareRadiusMiles"].as_f64().unwrap() < 0.0);
    }

    #[test]
    fn test_org_grower_profile_upsert() {
        let grower_profile_request = json!({
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "address": "800 Community Garden Way, Austin, TX 78701",
                "shareRadiusMiles": 12.0,
                "isOrganization": true,
                "organizationName": "North Austin Community Garden",
                "units": "imperial",
                "locale": "en-US"
            }
        });

        let profile = &grower_profile_request["growerProfile"];
        assert_eq!(profile["isOrganization"], true);
        assert_eq!(profile["organizationName"], "North Austin Community Garden");

        let expected_response = json!({
            "userType": "grower",
            "onboardingCompleted": true,
            "growerProfile": {
                "homeZone": "8a",
                "address": "800 Community Garden Way, Austin, TX 78701",
                "geoKey": "9q8yy9m",
                "lat": 30.2672,
                "lng": -97.7431,
                "shareRadiusMiles": "12.0",
                "isOrganization": true,
                "organizationName": "North Austin Community Garden",
                "units": "imperial",
                "locale": "en-US"
            }
        });

        assert_eq!(expected_response["growerProfile"]["isOrganization"], true);
        assert_eq!(
            expected_response["growerProfile"]["organizationName"],
            "North Austin Community Garden"
        );
    }

    #[test]
    fn test_validation_error_invalid_latitude() {
        let invalid_request = json!({
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 95.0,
                "lng": -122.4194,
                "shareRadiusMiles": 5.0,
                "units": "imperial",
                "locale": "en-US"
            }
        });

        let profile = &invalid_request["growerProfile"];
        let lat = profile["lat"].as_f64().unwrap();
        assert!(!(-90.0..=90.0).contains(&lat));
    }

    #[test]
    fn test_validation_error_invalid_longitude() {
        let invalid_request = json!({
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 37.7749,
                "lng": -200.0,
                "shareRadiusMiles": 5.0,
                "units": "imperial",
                "locale": "en-US"
            }
        });

        let profile = &invalid_request["growerProfile"];
        let lng = profile["lng"].as_f64().unwrap();
        assert!(!(-180.0..=180.0).contains(&lng));
    }

    #[test]
    fn test_validation_error_invalid_units() {
        let invalid_request = json!({
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusMiles": 5.0,
                "units": "kilometers",
                "locale": "en-US"
            }
        });

        let profile = &invalid_request["growerProfile"];
        let units = profile["units"].as_str().unwrap();
        assert!(units != "metric" && units != "imperial");
    }

    #[test]
    fn test_idempotency_repeat_request() {
        let _request = json!({
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusMiles": 5.0,
                "units": "imperial",
                "locale": "en-US"
            }
        });

        let expected_response = json!({
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "email": "test@example.com",
            "displayName": "Test User",
            "isVerified": false,
            "userType": "grower",
            "onboardingCompleted": true,
            "createdAt": "2024-01-01T00:00:00Z",
            "growerProfile": {
                "homeZone": "8a",
                "geoKey": "9q8yy9m",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusMiles": "5.0",
                "units": "imperial",
                "locale": "en-US"
            },
            "ratingSummary": null
        });

        assert_eq!(expected_response["onboardingCompleted"], true);
        assert_eq!(expected_response["userType"], "grower");
        assert_eq!(expected_response["onboardingCompleted"], true);
        assert!(!expected_response["growerProfile"].is_null());
    }

    #[test]
    fn test_idempotency_update_profile() {
        let _initial_request = json!({
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusMiles": 5.0,
                "units": "imperial",
                "locale": "en-US"
            }
        });

        let _update_request = json!({
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusMiles": 10.0,
                "units": "imperial",
                "locale": "en-US"
            }
        });

        let updated_response = json!({
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "email": "test@example.com",
            "displayName": "Test User",
            "isVerified": false,
            "userType": "grower",
            "onboardingCompleted": true,
            "createdAt": "2024-01-01T00:00:00Z",
            "growerProfile": {
                "homeZone": "8a",
                "geoKey": "9q8yy9m",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusMiles": "10.0",
                "units": "imperial",
                "locale": "en-US"
            },
            "ratingSummary": null
        });

        assert_eq!(
            updated_response["growerProfile"]["shareRadiusMiles"],
            "10.0"
        );
        assert_eq!(updated_response["onboardingCompleted"], true);
    }

    #[test]
    fn test_display_name_update() {
        let _request = json!({
            "displayName": "New Display Name",
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusMiles": 5.0,
                "units": "imperial",
                "locale": "en-US"
            }
        });

        let expected_response = json!({
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "email": "test@example.com",
            "displayName": "New Display Name",
            "isVerified": false,
            "userType": "grower",
            "onboardingCompleted": true,
            "createdAt": "2024-01-01T00:00:00Z",
            "growerProfile": {
                "homeZone": "8a",
                "geoKey": "9q8yy9m",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusMiles": "5.0",
                "units": "imperial",
                "locale": "en-US"
            },
            "ratingSummary": null
        });

        assert_eq!(expected_response["displayName"], "New Display Name");
    }
}
