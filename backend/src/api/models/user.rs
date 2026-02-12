use serde::Serialize;

/// User profile information extracted from authentication context
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    pub user_id: String,
    pub email: String,
    pub first_name: String,
    pub last_name: String,
    pub tier: String,
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use serde_json;

    #[test]
    fn test_user_profile_serialization() {
        let profile = UserProfile {
            user_id: "test-user-123".to_string(),
            email: "test@example.com".to_string(),
            first_name: "John".to_string(),
            last_name: "Doe".to_string(),
            tier: "neighbor".to_string(),
        };

        let json = serde_json::to_string(&profile).expect("Failed to serialize");

        assert!(json.contains("\"userId\":\"test-user-123\""));
        assert!(json.contains("\"email\":\"test@example.com\""));
        assert!(json.contains("\"firstName\":\"John\""));
        assert!(json.contains("\"lastName\":\"Doe\""));
        assert!(json.contains("\"tier\":\"neighbor\""));
    }

    #[test]
    fn test_user_profile_serialization_pretty() {
        let profile = UserProfile {
            user_id: "user-456".to_string(),
            email: "jane@example.com".to_string(),
            first_name: "Jane".to_string(),
            last_name: "Smith".to_string(),
            tier: "supporter".to_string(),
        };

        let json = serde_json::to_value(&profile).expect("Failed to serialize");

        assert_eq!(json["userId"], "user-456");
        assert_eq!(json["email"], "jane@example.com");
        assert_eq!(json["firstName"], "Jane");
        assert_eq!(json["lastName"], "Smith");
        assert_eq!(json["tier"], "supporter");
    }

    #[test]
    fn test_user_profile_caretaker_tier() {
        let profile = UserProfile {
            user_id: "admin-789".to_string(),
            email: "admin@example.com".to_string(),
            first_name: "Admin".to_string(),
            last_name: "User".to_string(),
            tier: "caretaker".to_string(),
        };

        let json = serde_json::to_value(&profile).expect("Failed to serialize");
        assert_eq!(json["tier"], "caretaker");
    }

    #[test]
    fn test_user_profile_equality() {
        let profile1 = UserProfile {
            user_id: "test-123".to_string(),
            email: "test@example.com".to_string(),
            first_name: "Test".to_string(),
            last_name: "User".to_string(),
            tier: "neighbor".to_string(),
        };

        let profile2 = UserProfile {
            user_id: "test-123".to_string(),
            email: "test@example.com".to_string(),
            first_name: "Test".to_string(),
            last_name: "User".to_string(),
            tier: "neighbor".to_string(),
        };

        assert_eq!(profile1, profile2);
    }
}
