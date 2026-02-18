use crate::auth::{extract_auth_context, require_grower};
use crate::models::crop::ErrorResponse;
use lambda_http::{Body, Request, Response};
use serde::{Deserialize, Serialize};
use tracing::info;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateListingRequest {
    // Placeholder fields - will be expanded when listings are fully implemented (Phase 1)
    #[allow(dead_code)]
    pub title: String,
    #[allow(dead_code)]
    pub description: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)] // Will be used when listing creation is implemented (Phase 1)
pub struct ListingResponse {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
}

#[allow(clippy::unused_async)] // Will be async when database operations are added in Phase 1
pub async fn create_listing(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    // Extract and validate authorization context
    let auth_context = extract_auth_context(request)?;

    // Require grower user type - gatherers will receive 403 Forbidden
    require_grower(&auth_context)?;

    info!(
        correlation_id = correlation_id,
        user_id = auth_context.user_id.as_str(),
        "Creating listing for grower"
    );

    // Parse request body
    let body = request.body();
    let body_str = match body {
        Body::Text(s) => s.as_str(),
        Body::Binary(b) => std::str::from_utf8(b)
            .map_err(|_| lambda_http::Error::from("Invalid UTF-8 in request body"))?,
        Body::Empty => {
            return error_response(400, "Request body is required");
        }
    };

    let _create_request: CreateListingRequest = serde_json::from_str(body_str)
        .map_err(|e| lambda_http::Error::from(format!("Invalid JSON body: {e}")))?;

    // TODO: Implement actual listing creation logic
    // For now, return a placeholder response indicating the endpoint is not fully implemented
    error_response(
        501,
        "Listing creation is not yet implemented. This endpoint enforces authorization only.",
    )
}

fn error_response(status: u16, message: &str) -> Result<Response<Body>, lambda_http::Error> {
    let error = ErrorResponse {
        error: message.to_string(),
    };
    let body = serde_json::to_string(&error)
        .map_err(|e| lambda_http::Error::from(format!("Failed to serialize error: {e}")))?;

    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::from(body))
        .map_err(|e| lambda_http::Error::from(e.to_string()))
}

#[cfg(test)]
#[allow(clippy::unwrap_used)] // unwrap is acceptable in tests
mod tests {
    use super::*;

    #[test]
    fn test_parse_create_listing_request() {
        let json = r#"{"title":"Fresh Tomatoes","description":"Organic heirloom tomatoes"}"#;
        let request: CreateListingRequest = serde_json::from_str(json).unwrap();
        assert_eq!(request.title, "Fresh Tomatoes");
        assert_eq!(
            request.description,
            Some("Organic heirloom tomatoes".to_string())
        );
    }

    #[test]
    fn test_parse_create_listing_request_minimal() {
        let json = r#"{"title":"Fresh Tomatoes"}"#;
        let request: CreateListingRequest = serde_json::from_str(json).unwrap();
        assert_eq!(request.title, "Fresh Tomatoes");
        assert_eq!(request.description, None);
    }
}
