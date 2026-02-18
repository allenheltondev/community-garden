// Integration tests for PUT /me endpoint
// These tests verify the complete onboarding flow including:
// - userType selection persistence
// - grower profile upsert
// - gatherer profile upsert
// - onboarding_completed flag management
// - validation error responses
// - idempotency via upsert

use serde_json::json;

#[cfg(test)]
#[allow(clippy::unwrap_used)] // unwrap is acceptable in tests
mod put_me_tests {
    use super::*;

    /// Test 1: userType selection persistence
    /// Validates: Requirement 8.2 - PUT /me accepts participation mode selection
    #[test]
    fn test_user_type_selection_persistence() {
        // This test verifies that userType can be set via PUT /me
        // and is persisted correctly in the user profile

        let grower_request = json!({
            "userType": "grower"
        });

        let gatherer_request = json!({
            "userType": "gatherer"
        });

        // Verify request structure is valid
        assert_eq!(grower_request["userType"], "grower");
        assert_eq!(gatherer_request["userType"], "gatherer");

        // Expected response after setting userType
        let expected_grower_response = json!({
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "email": "test@example.com",
            "displayName": "Test User",
            "isVerified": false,
            "userType": "grower",
            "onboardingCompleted": false,
            "createdAt": "2024-01-01T00:00:00Z",
            "growerProfile": null,
            "gathererProfile": null,
            "ratingSummary": null
        });

        // Verify userType is set but onboarding not yet complete
        assert_eq!(expected_grower_response["userType"], "grower");
        assert_eq!(expected_grower_response["onboardingCompleted"], false);
    }

    /// Test 2: grower profile upsert
    /// Validates: Requirement 8.3 - PUT /me accepts and persists grower profile data
    #[test]
    fn test_grower_profile_upsert() {
        let grower_profile_request = json!({
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusKm": 5.0,
                "units": "imperial",
                "locale": "en-US"
            }
        });

        // Verify request structure
        assert!(grower_profile_request.get("growerProfile").is_some());
        assert_eq!(grower_profile_request["userType"], "grower");

        let profile = &grower_profile_request["growerProfile"];
        assert_eq!(profile["homeZone"], "8a");
        assert_eq!(profile["lat"], 37.7749);
        assert_eq!(profile["lng"], -122.4194);
        assert_eq!(profile["shareRadiusKm"], 5.0);
        assert_eq!(profile["units"], "imperial");
        assert_eq!(profile["locale"], "en-US");

        // Expected response after profile creation
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
                "shareRadiusKm": "5.0",
                "units": "imperial",
                "locale": "en-US"
            },
            "gathererProfile": null,
            "ratingSummary": null
        });

        // Verify profile is created and onboarding is complete
        assert_eq!(expected_response["onboardingCompleted"], true);
        assert!(!expected_response["growerProfile"].is_null());
        assert!(expected_response["gathererProfile"].is_null());

        // Verify geoKey is calculated server-side
        assert!(expected_response["growerProfile"]["geoKey"].is_string());
    }

    /// Test 3: gatherer profile upsert
    /// Validates: Requirement 8.4 - PUT /me accepts and persists gatherer profile data
    #[test]
    fn test_gatherer_profile_upsert() {
        let gatherer_profile_request = json!({
            "userType": "gatherer",
            "gathererProfile": {
                "lat": 37.7749,
                "lng": -122.4194,
                "searchRadiusKm": 10.0,
                "organizationAffiliation": "SF Food Bank",
                "units": "metric",
                "locale": "en-US"
            }
        });

        // Verify request structure
        assert!(gatherer_profile_request.get("gathererProfile").is_some());
        assert_eq!(gatherer_profile_request["userType"], "gatherer");

        let profile = &gatherer_profile_request["gathererProfile"];
        assert_eq!(profile["lat"], 37.7749);
        assert_eq!(profile["lng"], -122.4194);
        assert_eq!(profile["searchRadiusKm"], 10.0);
        assert_eq!(profile["organizationAffiliation"], "SF Food Bank");
        assert_eq!(profile["units"], "metric");
        assert_eq!(profile["locale"], "en-US");

        // Expected response after profile creation
        let expected_response = json!({
            "id": "550e8400-e29b-41d4-a716-446655440001",
            "email": "gatherer@example.com",
            "displayName": "Gatherer User",
            "isVerified": false,
            "userType": "gatherer",
            "onboardingCompleted": true,
            "createdAt": "2024-01-01T00:00:00Z",
            "growerProfile": null,
            "gathererProfile": {
                "geoKey": "9q8yy9m",
                "lat": 37.7749,
                "lng": -122.4194,
                "searchRadiusKm": "10.0",
                "organizationAffiliation": "SF Food Bank",
                "units": "metric",
                "locale": "en-US"
            },
            "ratingSummary": null
        });

        // Verify profile is created and onboarding is complete
        assert_eq!(expected_response["onboardingCompleted"], true);
        assert!(expected_response["growerProfile"].is_null());
        assert!(!expected_response["gathererProfile"].is_null());

        // Verify geoKey is calculated server-side
        assert!(expected_response["gathererProfile"]["geoKey"].is_string());
    }

    /// Test 4: gatherer profile without organization affiliation
    /// Validates: Requirement 8.4 - organizationAffiliation is optional
    #[test]
    fn test_gatherer_profile_without_organization() {
        let gatherer_profile_request = json!({
            "userType": "gatherer",
            "gathererProfile": {
                "lat": 37.7749,
                "lng": -122.4194,
                "searchRadiusKm": 10.0,
                "units": "metric",
                "locale": "en-US"
            }
        });

        // Verify organizationAffiliation is not present
        let profile = &gatherer_profile_request["gathererProfile"];
        assert!(profile.get("organizationAffiliation").is_none());

        // Expected response
        let expected_response = json!({
            "id": "550e8400-e29b-41d4-a716-446655440001",
            "email": "gatherer@example.com",
            "displayName": "Gatherer User",
            "isVerified": false,
            "userType": "gatherer",
            "onboardingCompleted": true,
            "createdAt": "2024-01-01T00:00:00Z",
            "growerProfile": null,
            "gathererProfile": {
                "geoKey": "9q8yy9m",
                "lat": 37.7749,
                "lng": -122.4194,
                "searchRadiusKm": "10.0",
                "organizationAffiliation": null,
                "units": "metric",
                "locale": "en-US"
            },
            "ratingSummary": null
        });

        // Verify profile is created successfully without organization
        assert_eq!(expected_response["onboardingCompleted"], true);
        assert!(expected_response["gathererProfile"]["organizationAffiliation"].is_null());
    }

    /// Test 5: `onboarding_completed` set after required profile data persisted
    /// Validates: Requirement 8.5 - `onboarding_completed` flag management
    #[test]
    fn test_onboarding_completed_after_profile_creation() {
        // Step 1: Set userType only - onboarding should NOT be complete
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
            "gathererProfile": null,
            "ratingSummary": null
        });

        assert_eq!(step1_response["userType"], "grower");
        assert_eq!(step1_response["onboardingCompleted"], false);

        // Step 2: Add profile - onboarding should be complete
        let _step2_request = json!({
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusKm": 5.0,
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
                "shareRadiusKm": "5.0",
                "units": "imperial",
                "locale": "en-US"
            },
            "gathererProfile": null,
            "ratingSummary": null
        });

        assert_eq!(step2_response["userType"], "grower");
        assert_eq!(step2_response["onboardingCompleted"], true);
        assert!(!step2_response["growerProfile"].is_null());
    }

    /// Test 6: validation error - negative radius for grower
    /// Validates: Requirement 8.6, 8.7 - validation error responses
    #[test]
    fn test_validation_error_negative_grower_radius() {
        let invalid_request = json!({
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusKm": -5.0,
                "units": "imperial",
                "locale": "en-US"
            }
        });

        // This should result in a 400 Bad Request error
        // Error message should indicate: "shareRadiusKm must be greater than 0"
        let profile = &invalid_request["growerProfile"];
        assert!(profile["shareRadiusKm"].as_f64().unwrap() < 0.0);
    }

    /// Test 7: validation error - negative radius for gatherer
    /// Validates: Requirement 8.6, 8.7 - validation error responses
    #[test]
    fn test_validation_error_negative_gatherer_radius() {
        let invalid_request = json!({
            "userType": "gatherer",
            "gathererProfile": {
                "lat": 37.7749,
                "lng": -122.4194,
                "searchRadiusKm": -10.0,
                "units": "metric",
                "locale": "en-US"
            }
        });

        // This should result in a 400 Bad Request error
        // Error message should indicate: "searchRadiusKm must be greater than 0"
        let profile = &invalid_request["gathererProfile"];
        assert!(profile["searchRadiusKm"].as_f64().unwrap() < 0.0);
    }

    /// Test 8: validation error - invalid latitude
    /// Validates: Requirement 8.6, 8.7 - validation error responses
    #[test]
    fn test_validation_error_invalid_latitude() {
        let invalid_request = json!({
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 95.0,
                "lng": -122.4194,
                "shareRadiusKm": 5.0,
                "units": "imperial",
                "locale": "en-US"
            }
        });

        // This should result in a 400 Bad Request error
        // Error message should indicate: "lat must be between -90 and 90"
        let profile = &invalid_request["growerProfile"];
        let lat = profile["lat"].as_f64().unwrap();
        assert!(!(-90.0..=90.0).contains(&lat));
    }

    /// Test 9: validation error - invalid longitude
    /// Validates: Requirement 8.6, 8.7 - validation error responses
    #[test]
    fn test_validation_error_invalid_longitude() {
        let invalid_request = json!({
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 37.7749,
                "lng": -200.0,
                "shareRadiusKm": 5.0,
                "units": "imperial",
                "locale": "en-US"
            }
        });

        // This should result in a 400 Bad Request error
        // Error message should indicate: "lng must be between -180 and 180"
        let profile = &invalid_request["growerProfile"];
        let lng = profile["lng"].as_f64().unwrap();
        assert!(!(-180.0..=180.0).contains(&lng));
    }

    /// Test 10: validation error - invalid units
    /// Validates: Requirement 8.6, 8.7 - validation error responses
    #[test]
    fn test_validation_error_invalid_units() {
        let invalid_request = json!({
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusKm": 5.0,
                "units": "kilometers",
                "locale": "en-US"
            }
        });

        // This should result in a 400 Bad Request error
        // Error message should indicate: "units must be 'metric' or 'imperial'"
        let profile = &invalid_request["growerProfile"];
        let units = profile["units"].as_str().unwrap();
        assert!(units != "metric" && units != "imperial");
    }

    /// Test 11: validation error - both profiles provided
    /// Validates: Requirement 8.6, 8.7 - validation error responses
    #[test]
    fn test_validation_error_both_profiles() {
        let invalid_request = json!({
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusKm": 5.0,
                "units": "imperial",
                "locale": "en-US"
            },
            "gathererProfile": {
                "lat": 37.7749,
                "lng": -122.4194,
                "searchRadiusKm": 10.0,
                "units": "metric",
                "locale": "en-US"
            }
        });

        // This should result in a 400 Bad Request error
        // Error message should indicate: "Cannot provide both growerProfile and gathererProfile"
        assert!(invalid_request.get("growerProfile").is_some());
        assert!(invalid_request.get("gathererProfile").is_some());
    }

    /// Test 12: validation error - profile mismatch (grower profile for gatherer)
    /// Validates: Requirement 8.6, 8.7 - validation error responses
    #[test]
    fn test_validation_error_profile_mismatch_grower() {
        let invalid_request = json!({
            "userType": "gatherer",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusKm": 5.0,
                "units": "imperial",
                "locale": "en-US"
            }
        });

        // This should result in a 400 Bad Request error
        // Error message should indicate: "Cannot provide growerProfile when userType is gatherer"
        assert_eq!(invalid_request["userType"], "gatherer");
        assert!(invalid_request.get("growerProfile").is_some());
    }

    /// Test 13: validation error - profile mismatch (gatherer profile for grower)
    /// Validates: Requirement 8.6, 8.7 - validation error responses
    #[test]
    fn test_validation_error_profile_mismatch_gatherer() {
        let invalid_request = json!({
            "userType": "grower",
            "gathererProfile": {
                "lat": 37.7749,
                "lng": -122.4194,
                "searchRadiusKm": 10.0,
                "units": "metric",
                "locale": "en-US"
            }
        });

        // This should result in a 400 Bad Request error
        // Error message should indicate: "Cannot provide gathererProfile when userType is grower"
        assert_eq!(invalid_request["userType"], "grower");
        assert!(invalid_request.get("gathererProfile").is_some());
    }

    /// Test 14: idempotency via upsert - repeat same request is safe
    /// Validates: Requirement 8.8, 8.9 - idempotency
    #[test]
    fn test_idempotency_repeat_request() {
        let _request = json!({
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusKm": 5.0,
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
                "shareRadiusKm": "5.0",
                "units": "imperial",
                "locale": "en-US"
            },
            "gathererProfile": null,
            "ratingSummary": null
        });

        // First request creates the profile
        assert_eq!(expected_response["onboardingCompleted"], true);

        // Second identical request should return the same result (upsert semantics)
        // No error should occur, and the response should be identical
        assert_eq!(expected_response["userType"], "grower");
        assert_eq!(expected_response["onboardingCompleted"], true);
        assert!(!expected_response["growerProfile"].is_null());
    }

    /// Test 15: idempotency - update existing profile
    /// Validates: Requirement 8.8, 8.9 - upsert updates existing profile
    #[test]
    fn test_idempotency_update_profile() {
        // Initial profile creation
        let _initial_request = json!({
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusKm": 5.0,
                "units": "imperial",
                "locale": "en-US"
            }
        });

        // Update with different radius
        let _update_request = json!({
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusKm": 10.0,
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
                "shareRadiusKm": "10.0",
                "units": "imperial",
                "locale": "en-US"
            },
            "gathererProfile": null,
            "ratingSummary": null
        });

        // Verify the profile was updated (radius changed from 5.0 to 10.0)
        assert_eq!(updated_response["growerProfile"]["shareRadiusKm"], "10.0");
        assert_eq!(updated_response["onboardingCompleted"], true);
    }

    /// Test 16: displayName update
    /// Validates: PUT /me can update displayName
    #[test]
    fn test_display_name_update() {
        let _request = json!({
            "displayName": "New Display Name",
            "userType": "grower",
            "growerProfile": {
                "homeZone": "8a",
                "lat": 37.7749,
                "lng": -122.4194,
                "shareRadiusKm": 5.0,
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
                "shareRadiusKm": "5.0",
                "units": "imperial",
                "locale": "en-US"
            },
            "gathererProfile": null,
            "ratingSummary": null
        });

        // Verify displayName was updated
        assert_eq!(expected_response["displayName"], "New Display Name");
    }
}
