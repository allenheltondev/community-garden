use crate::handlers::user;
use crate::middleware::correlation::{
    add_correlation_id_to_response, extract_or_generate_correlation_id,
};
use lambda_http::{Body, Request, Response};
use std::env;
use tracing::info;

/// Add CORS headers to response
fn add_cors_headers(mut response: Response<Body>) -> Response<Body> {
    let origin = env::var("ORIGIN").unwrap_or_else(|_| "http://localhost:5173".to_string());

    let headers = response.headers_mut();

    // These are static strings that should always parse successfully
    if let Ok(value) = origin.parse() {
        headers.insert("Access-Control-Allow-Origin", value);
    }
    if let Ok(value) = "GET,POST,PUT,DELETE,OPTIONS".parse() {
        headers.insert("Access-Control-Allow-Methods", value);
    }
    if let Ok(value) = "Content-Type,Authorization,Idempotency-Key,X-Correlation-Id".parse() {
        headers.insert("Access-Control-Allow-Headers", value);
    }
    if let Ok(value) = "3600".parse() {
        headers.insert("Access-Control-Max-Age", value);
    }

    response
}

pub fn route_request(event: &Request) -> Result<Response<Body>, lambda_http::Error> {
    // Extract or generate correlation ID
    let correlation_id = extract_or_generate_correlation_id(event);

    info!(
        correlation_id = correlation_id.as_str(),
        method = event.method().as_str(),
        path = event.uri().path(),
        "Request received"
    );

    // Handle OPTIONS preflight requests
    if event.method().as_str() == "OPTIONS" {
        let response = Response::builder()
            .status(200)
            .body(Body::Empty)
            .map_err(|e| lambda_http::Error::from(e.to_string()))?;

        let response_with_cors = add_cors_headers(response);
        let response_with_correlation =
            add_correlation_id_to_response(response_with_cors, &correlation_id);
        return Ok(response_with_correlation);
    }

    // Route based on method and path
    let response = match (event.method().as_str(), event.uri().path()) {
        ("GET", "/me") => user::get_current_user(event, &correlation_id)?,
        _ => {
            // Catch-all route - return 404 Not Found
            Response::builder()
                .status(404)
                .header("content-type", "application/json")
                .body(Body::from(r#"{"error":"Not Found"}"#))
                .map_err(|e| lambda_http::Error::from(e.to_string()))?
        }
    };

    // Add CORS headers
    let response_with_cors = add_cors_headers(response);

    // Add correlation ID to response headers
    let response_with_correlation =
        add_correlation_id_to_response(response_with_cors, &correlation_id);

    info!(
        correlation_id = correlation_id.as_str(),
        status = response_with_correlation.status().as_u16(),
        "Response sent"
    );

    Ok(response_with_correlation)
}
