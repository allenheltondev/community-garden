use crate::models::user::UserProfile;
use lambda_http::{Body, Request, RequestExt, Response};
use tracing::{error, info};

/// Handler for GET /me endpoint
///
/// Returns the authenticated user's profile by extracting user information
/// from the Lambda authorizer context.
///
/// # Arguments
///
/// * `request` - The incoming HTTP request with authorizer context
/// * `correlation_id` - The correlation ID for request tracing
///
/// # Returns
///
/// * `Result<Response<Body>, lambda_http::Error>` - 200 with user profile JSON or 500 on error
pub fn get_current_user(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    info!(
        correlation_id = correlation_id,
        "Processing GET /me request"
    );

    // Extract user context from Lambda authorizer
    let request_context = request.request_context();
    let authorizer = request_context.authorizer();

    // Helper function to extract string fields from authorizer context
    let get_field = |field_name: &str| -> Result<String, lambda_http::Error> {
        authorizer
            .and_then(|auth| auth.fields.get(field_name))
            .and_then(|v| v.as_str())
            .map(ToString::to_string)
            .ok_or_else(|| {
                error!(
                    correlation_id = correlation_id,
                    field = field_name,
                    "Missing field in authorizer context"
                );
                lambda_http::Error::from(format!("Missing {field_name} in authorizer context"))
            })
    };

    let user_id = get_field("userId")?;
    let email = get_field("email")?;
    let first_name = get_field("firstName")?;
    let last_name = get_field("lastName")?;
    let tier = get_field("tier")?;

    // Build user profile
    let profile = UserProfile {
        user_id: user_id.clone(),
        email,
        first_name,
        last_name,
        tier: tier.clone(),
    };

    info!(
        correlation_id = correlation_id,
        user_id = user_id.as_str(),
        tier = tier.as_str(),
        "Successfully retrieved user profile"
    );

    // Serialize profile to JSON
    let json_body = serde_json::to_string(&profile).map_err(|e| {
        error!(
            correlation_id = correlation_id,
            error = %e,
            "Failed to serialize user profile"
        );
        lambda_http::Error::from(format!("Failed to serialize user profile: {e}"))
    })?;

    // Return 200 with JSON profile
    Response::builder()
        .status(200)
        .header("content-type", "application/json")
        .body(Body::from(json_body))
        .map_err(|e| {
            error!(
                correlation_id = correlation_id,
                error = %e,
                "Failed to build response"
            );
            lambda_http::Error::from(e.to_string())
        })
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn test_user_profile_structure() {
        let profile = UserProfile {
            user_id: "user-456".to_string(),
            email: "jane@example.com".to_string(),
            first_name: "Jane".to_string(),
            last_name: "Smith".to_string(),
            tier: "supporter".to_string(),
        };

        let json = serde_json::to_value(&profile).unwrap();

        assert_eq!(json["userId"], "user-456");
        assert_eq!(json["email"], "jane@example.com");
        assert_eq!(json["firstName"], "Jane");
        assert_eq!(json["lastName"], "Smith");
        assert_eq!(json["tier"], "supporter");
    }

    #[test]
    fn test_user_profile_all_tiers() {
        let tiers = vec!["neighbor", "supporter", "caretaker"];

        for tier in tiers {
            let profile = UserProfile {
                user_id: "user-test".to_string(),
                email: "test@example.com".to_string(),
                first_name: "Test".to_string(),
                last_name: "User".to_string(),
                tier: tier.to_string(),
            };

            let json = serde_json::to_value(&profile).unwrap();
            assert_eq!(json["tier"], tier);
        }
    }
}
