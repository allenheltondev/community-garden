use lambda_http::{Error, Request, RequestExt};
use serde::{Deserialize, Serialize};
use tracing::error;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum UserType {
    Grower,
    Gatherer,
}

#[derive(Debug, Clone)]
pub struct AuthContext {
    pub user_id: String,
    pub user_type: Option<UserType>,
    #[allow(dead_code)] // Will be used for tier-based authorization in future phases
    pub tier: String,
    #[allow(dead_code)] // Will be used for user communication features
    pub email: Option<String>,
}

pub fn extract_auth_context(request: &Request) -> Result<AuthContext, Error> {
    let user_id = extract_authorizer_field(request, "userId")
        .ok_or_else(|| Error::from("Missing userId in authorizer context"))?;

    let tier = extract_authorizer_field(request, "tier").unwrap_or_else(|| "neighbor".to_string());

    let user_type = extract_authorizer_field(request, "userType").and_then(|s| parse_user_type(&s));

    let email = extract_authorizer_field(request, "email");

    Ok(AuthContext {
        user_id,
        user_type,
        tier,
        email,
    })
}

pub fn require_grower(ctx: &AuthContext) -> Result<(), Error> {
    match &ctx.user_type {
        Some(UserType::Grower) => Ok(()),
        Some(UserType::Gatherer) => {
            error!(
                user_id = ctx.user_id.as_str(),
                "Gatherers cannot access grower-only features"
            );
            Err(Error::from(
                "Forbidden: This feature is only available to growers",
            ))
        }
        None => {
            error!(
                user_id = ctx.user_id.as_str(),
                "User type not set, onboarding may be incomplete"
            );
            Err(Error::from(
                "Forbidden: User type not set. Please complete onboarding.",
            ))
        }
    }
}

#[allow(dead_code)] // Will be used when gatherer-specific endpoints are implemented
pub fn require_user_type(ctx: &AuthContext, required: &UserType) -> Result<(), Error> {
    match &ctx.user_type {
        Some(user_type) if user_type == required => Ok(()),
        Some(_) => {
            error!(
                user_id = ctx.user_id.as_str(),
                required_type = ?required,
                actual_type = ?ctx.user_type,
                "User does not have required user type"
            );
            Err(Error::from(format!(
                "Forbidden: This feature requires user type {required:?}"
            )))
        }
        None => {
            error!(
                user_id = ctx.user_id.as_str(),
                required_type = ?required,
                "User type not set, onboarding may be incomplete"
            );
            Err(Error::from(
                "Forbidden: User type not set. Please complete onboarding.",
            ))
        }
    }
}

fn extract_authorizer_field(request: &Request, field_name: &str) -> Option<String> {
    request
        .request_context()
        .authorizer()
        .and_then(|auth| auth.fields.get(field_name))
        .and_then(|v| v.as_str())
        .map(ToString::to_string)
}

fn parse_user_type(s: &str) -> Option<UserType> {
    match s.to_lowercase().as_str() {
        "grower" => Some(UserType::Grower),
        "gatherer" => Some(UserType::Gatherer),
        _ => None,
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)] // unwrap is acceptable in tests
mod tests {
    use super::*;

    #[test]
    fn parse_user_type_grower() {
        assert_eq!(parse_user_type("grower"), Some(UserType::Grower));
        assert_eq!(parse_user_type("Grower"), Some(UserType::Grower));
        assert_eq!(parse_user_type("GROWER"), Some(UserType::Grower));
    }

    #[test]
    fn parse_user_type_gatherer() {
        assert_eq!(parse_user_type("gatherer"), Some(UserType::Gatherer));
        assert_eq!(parse_user_type("Gatherer"), Some(UserType::Gatherer));
        assert_eq!(parse_user_type("GATHERER"), Some(UserType::Gatherer));
    }

    #[test]
    fn parse_user_type_invalid() {
        assert_eq!(parse_user_type("invalid"), None);
        assert_eq!(parse_user_type(""), None);
        assert_eq!(parse_user_type("recipient"), None);
    }

    #[test]
    fn require_grower_with_grower_succeeds() {
        let ctx = AuthContext {
            user_id: String::from("test-user"),
            user_type: Some(UserType::Grower),
            tier: String::from("neighbor"),
            email: None,
        };
        assert!(require_grower(&ctx).is_ok());
    }

    #[test]
    fn require_grower_with_gatherer_fails() {
        let ctx = AuthContext {
            user_id: String::from("test-user"),
            user_type: Some(UserType::Gatherer),
            tier: String::from("neighbor"),
            email: None,
        };
        let result = require_grower(&ctx);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("only available to growers"));
    }

    #[test]
    fn require_grower_with_no_type_fails() {
        let ctx = AuthContext {
            user_id: String::from("test-user"),
            user_type: None,
            tier: String::from("neighbor"),
            email: None,
        };
        let result = require_grower(&ctx);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("User type not set"));
    }

    #[test]
    fn require_user_type_with_matching_type_succeeds() {
        let ctx = AuthContext {
            user_id: String::from("test-user"),
            user_type: Some(UserType::Gatherer),
            tier: String::from("neighbor"),
            email: None,
        };
        assert!(require_user_type(&ctx, &UserType::Gatherer).is_ok());
    }

    #[test]
    fn require_user_type_with_non_matching_type_fails() {
        let ctx = AuthContext {
            user_id: String::from("test-user"),
            user_type: Some(UserType::Grower),
            tier: String::from("neighbor"),
            email: None,
        };
        let result = require_user_type(&ctx, &UserType::Gatherer);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("requires user type"));
    }

    #[test]
    fn require_user_type_with_no_type_fails() {
        let ctx = AuthContext {
            user_id: String::from("test-user"),
            user_type: None,
            tier: String::from("neighbor"),
            email: None,
        };
        let result = require_user_type(&ctx, &UserType::Grower);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("User type not set"));
    }

    #[test]
    fn user_type_serialization() {
        let grower = UserType::Grower;
        let json = serde_json::to_string(&grower).unwrap();
        assert_eq!(json, r#""grower""#);

        let gatherer = UserType::Gatherer;
        let json = serde_json::to_string(&gatherer).unwrap();
        assert_eq!(json, r#""gatherer""#);
    }

    #[test]
    fn user_type_deserialization() {
        let grower: UserType = serde_json::from_str(r#""grower""#).unwrap();
        assert_eq!(grower, UserType::Grower);

        let gatherer: UserType = serde_json::from_str(r#""gatherer""#).unwrap();
        assert_eq!(gatherer, UserType::Gatherer);
    }
}
