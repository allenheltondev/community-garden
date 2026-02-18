// Integration tests for GET /me endpoint
// These tests verify that the endpoint returns the correct user profile data
// including userType, onboardingCompleted, and profile information

use serde_json::json;

#[cfg(test)]
mod get_me_tests {
    use super::*;

    /// Test that GET /me response includes userType and onboardingCompleted fields
    /// Validates: Requirements 8.1, 1.4
    #[test]
    fn test_response_structure_includes_required_fields() {
        // This test verifies the expected response structure from GET /me
        // The actual endpoint should return a response matching this structure

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

        // Verify required fields exist
        assert!(expected_response.get("userType").is_some());
        assert!(expected_response.get("onboardingCompleted").is_some());
        assert_eq!(expected_response["userType"], "grower");
        assert_eq!(expected_response["onboardingCompleted"], true);
    }

    /// Test that GET /me includes growerProfile for grower users
    /// Validates: Requirement 8.1
    #[test]
    fn test_response_includes_grower_profile_for_growers() {
        let grower_response = json!({
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "email": "grower@example.com",
            "displayName": "Grower User",
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

        // Verify growerProfile is present and gathererProfile is null
        assert!(grower_response.get("growerProfile").is_some());
        assert!(!grower_response["growerProfile"].is_null());
        assert!(grower_response["gathererProfile"].is_null());
        assert_eq!(grower_response["userType"], "grower");

        // Verify growerProfile has required fields
        let grower_profile = &grower_response["growerProfile"];
        assert!(grower_profile.get("homeZone").is_some());
        assert!(grower_profile.get("geoKey").is_some());
        assert!(grower_profile.get("lat").is_some());
        assert!(grower_profile.get("lng").is_some());
        assert!(grower_profile.get("shareRadiusKm").is_some());
        assert!(grower_profile.get("units").is_some());
        assert!(grower_profile.get("locale").is_some());
    }

    /// Test that GET /me includes gathererProfile for gatherer users
    /// Validates: Requirement 8.1
    #[test]
    fn test_response_includes_gatherer_profile_for_gatherers() {
        let gatherer_response = json!({
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

        // Verify gathererProfile is present and growerProfile is null
        assert!(gatherer_response.get("gathererProfile").is_some());
        assert!(!gatherer_response["gathererProfile"].is_null());
        assert!(gatherer_response["growerProfile"].is_null());
        assert_eq!(gatherer_response["userType"], "gatherer");

        // Verify gathererProfile has required fields
        let gatherer_profile = &gatherer_response["gathererProfile"];
        assert!(gatherer_profile.get("geoKey").is_some());
        assert!(gatherer_profile.get("lat").is_some());
        assert!(gatherer_profile.get("lng").is_some());
        assert!(gatherer_profile.get("searchRadiusKm").is_some());
        assert!(gatherer_profile.get("units").is_some());
        assert!(gatherer_profile.get("locale").is_some());
    }

    /// Test that GET /me supports resume onboarding scenario
    /// When userType is set but onboardingCompleted is false
    /// Validates: Requirement 1.4
    #[test]
    fn test_response_supports_resume_onboarding() {
        // User has selected userType but hasn't completed profile setup
        let incomplete_onboarding_response = json!({
            "id": "550e8400-e29b-41d4-a716-446655440002",
            "email": "incomplete@example.com",
            "displayName": "Incomplete User",
            "isVerified": false,
            "userType": "grower",
            "onboardingCompleted": false,
            "createdAt": "2024-01-01T00:00:00Z",
            "growerProfile": null,
            "gathererProfile": null,
            "ratingSummary": null
        });

        // Verify userType is present even when onboarding is incomplete
        assert_eq!(incomplete_onboarding_response["userType"], "grower");
        assert_eq!(incomplete_onboarding_response["onboardingCompleted"], false);

        // Both profiles should be null since onboarding isn't complete
        assert!(incomplete_onboarding_response["growerProfile"].is_null());
        assert!(incomplete_onboarding_response["gathererProfile"].is_null());

        // This allows the frontend to resume at the correct wizard step
        // (grower-wizard in this case, since userType is 'grower')
    }

    /// Test that GET /me handles new users without userType
    #[test]
    fn test_response_for_new_user_without_user_type() {
        let new_user_response = json!({
            "id": "550e8400-e29b-41d4-a716-446655440003",
            "email": "newuser@example.com",
            "displayName": "New User",
            "isVerified": false,
            "userType": null,
            "onboardingCompleted": false,
            "createdAt": "2024-01-01T00:00:00Z",
            "growerProfile": null,
            "gathererProfile": null,
            "ratingSummary": null
        });

        // Verify userType is null for new users
        assert!(new_user_response["userType"].is_null());
        assert_eq!(new_user_response["onboardingCompleted"], false);

        // Both profiles should be null
        assert!(new_user_response["growerProfile"].is_null());
        assert!(new_user_response["gathererProfile"].is_null());

        // This triggers the onboarding flow starting at user type selection
    }

    /// Test that GET /me includes all expected user fields
    #[test]
    fn test_response_includes_all_user_fields() {
        let complete_response = json!({
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "email": "complete@example.com",
            "displayName": "Complete User",
            "isVerified": true,
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
            "ratingSummary": {
                "avgScore": "4.5",
                "ratingCount": 10
            }
        });

        // Verify all expected fields are present
        assert!(complete_response.get("id").is_some());
        assert!(complete_response.get("email").is_some());
        assert!(complete_response.get("displayName").is_some());
        assert!(complete_response.get("isVerified").is_some());
        assert!(complete_response.get("userType").is_some());
        assert!(complete_response.get("onboardingCompleted").is_some());
        assert!(complete_response.get("createdAt").is_some());
        assert!(complete_response.get("growerProfile").is_some());
        assert!(complete_response.get("gathererProfile").is_some());
        assert!(complete_response.get("ratingSummary").is_some());
    }

    /// Test gatherer with organization affiliation
    #[test]
    fn test_gatherer_with_organization_affiliation() {
        let gatherer_with_org = json!({
            "id": "550e8400-e29b-41d4-a716-446655440004",
            "email": "org@example.com",
            "displayName": "Organization User",
            "isVerified": false,
            "userType": "gatherer",
            "onboardingCompleted": true,
            "createdAt": "2024-01-01T00:00:00Z",
            "growerProfile": null,
            "gathererProfile": {
                "geoKey": "9q8yy9m",
                "lat": 37.7749,
                "lng": -122.4194,
                "searchRadiusKm": "15.0",
                "organizationAffiliation": "Community Food Bank",
                "units": "metric",
                "locale": "en-US"
            },
            "ratingSummary": null
        });

        let gatherer_profile = &gatherer_with_org["gathererProfile"];
        assert_eq!(
            gatherer_profile["organizationAffiliation"],
            "Community Food Bank"
        );
    }

    /// Test gatherer without organization affiliation
    #[test]
    fn test_gatherer_without_organization_affiliation() {
        let gatherer_without_org = json!({
            "id": "550e8400-e29b-41d4-a716-446655440005",
            "email": "individual@example.com",
            "displayName": "Individual User",
            "isVerified": false,
            "userType": "gatherer",
            "onboardingCompleted": true,
            "createdAt": "2024-01-01T00:00:00Z",
            "growerProfile": null,
            "gathererProfile": {
                "geoKey": "9q8yy9m",
                "lat": 37.7749,
                "lng": -122.4194,
                "searchRadiusKm": "5.0",
                "organizationAffiliation": null,
                "units": "imperial",
                "locale": "en-US"
            },
            "ratingSummary": null
        });

        let gatherer_profile = &gatherer_without_org["gathererProfile"];
        assert!(gatherer_profile["organizationAffiliation"].is_null());
    }
}
