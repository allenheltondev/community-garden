use crate::handlers::{catalog, claim, crop, listing, request, user};
use crate::middleware::correlation::{
    add_correlation_id_to_response, extract_or_generate_correlation_id,
};
use lambda_http::{Body, Request, Response};
use std::env;
use tracing::info;

fn add_cors_headers(mut response: Response<Body>) -> Response<Body> {
    let origin = env::var("ORIGIN").unwrap_or_else(|_| "http://localhost:5173".to_string());

    let headers = response.headers_mut();

    if let Ok(value) = origin.parse() {
        headers.insert("Access-Control-Allow-Origin", value);
    }
    if let Ok(value) = "GET,POST,PUT,DELETE,OPTIONS".parse() {
        headers.insert("Access-Control-Allow-Methods", value);
    }
    if let Ok(value) = "Content-Type,Authorization,Idempotency-Key,X-Correlation-Id,X-Amz-Date,X-Api-Key,X-Amz-Security-Token".parse() {
        headers.insert("Access-Control-Allow-Headers", value);
    }
    if let Ok(value) = "3600".parse() {
        headers.insert("Access-Control-Max-Age", value);
    }

    response
}

pub async fn route_request(event: &Request) -> Result<Response<Body>, lambda_http::Error> {
    let correlation_id = extract_or_generate_correlation_id(event);

    info!(
        correlation_id = correlation_id.as_str(),
        method = event.method().as_str(),
        path = event.uri().path(),
        "Request received"
    );

    if event.method().as_str() == "OPTIONS" {
        let response = Response::builder()
            .status(200)
            .body(Body::Empty)
            .map_err(|e| lambda_http::Error::from(e.to_string()))?;

        return Ok(add_correlation_id_to_response(
            add_cors_headers(response),
            &correlation_id,
        ));
    }

    let response = match (event.method().as_str(), event.uri().path()) {
        ("GET", "/me") => handle(user::get_current_user(event, &correlation_id).await)?,
        ("PUT", "/me") => handle(user::upsert_current_user(event, &correlation_id).await)?,

        ("GET", "/crops") => handle(crop::list_my_crops(event, &correlation_id).await)?,
        ("POST", "/crops") => handle(crop::create_my_crop(event, &correlation_id).await)?,

        ("GET", "/my/listings") => handle(listing::list_my_listings(event, &correlation_id).await)?,
        ("POST", "/listings") => handle(listing::create_listing(event, &correlation_id).await)?,
        ("POST", "/requests") => handle(request::create_request(event, &correlation_id).await)?,
        ("POST", "/claims") => handle(claim::create_claim(event, &correlation_id).await)?,

        ("GET", "/catalog/crops") => handle(catalog::list_catalog_crops().await)?,

        _ => route_dynamic_routes(event, &correlation_id).await?,
    };

    let response_with_cors = add_cors_headers(response);
    let response_with_correlation =
        add_correlation_id_to_response(response_with_cors, &correlation_id);

    info!(
        correlation_id = correlation_id.as_str(),
        status = response_with_correlation.status().as_u16(),
        "Response sent"
    );

    Ok(response_with_correlation)
}

async fn route_dynamic_routes(
    event: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    if let Some(crop_library_id) = event.uri().path().strip_prefix("/crops/") {
        let result = match event.method().as_str() {
            "GET" => crop::get_my_crop(event, correlation_id, crop_library_id).await,
            "PUT" => crop::update_my_crop(event, correlation_id, crop_library_id).await,
            "DELETE" => crop::delete_my_crop(event, correlation_id, crop_library_id).await,
            _ => method_not_allowed(),
        };
        return handle(result);
    }

    if let Some(listing_id) = event.uri().path().strip_prefix("/my/listings/") {
        let result = match event.method().as_str() {
            "GET" => listing::get_listing(event, correlation_id, listing_id).await,
            _ => method_not_allowed(),
        };
        return handle(result);
    }

    if let Some(listing_id) = event.uri().path().strip_prefix("/listings/") {
        let result = match event.method().as_str() {
            "PUT" => listing::update_listing(event, correlation_id, listing_id).await,
            _ => method_not_allowed(),
        };
        return handle(result);
    }

    if let Some(user_id) = event.uri().path().strip_prefix("/users/") {
        return if event.method().as_str() == "GET" {
            handle(user::get_public_user(user_id).await)
        } else {
            method_not_allowed()
        };
    }

    if let Some(crop_id) = event.uri().path().strip_prefix("/catalog/crops/") {
        if let Some(crop_id) = crop_id.strip_suffix("/varieties") {
            return if event.method().as_str() == "GET" {
                handle(catalog::list_catalog_varieties(crop_id).await)
            } else {
                method_not_allowed()
            };
        }
    }

    Response::builder()
        .status(404)
        .header("content-type", "application/json")
        .body(Body::from(r#"{"error":"Not Found"}"#))
        .map_err(|e| lambda_http::Error::from(e.to_string()))
}

fn method_not_allowed() -> Result<Response<Body>, lambda_http::Error> {
    Response::builder()
        .status(405)
        .header("content-type", "application/json")
        .body(Body::from(r#"{"error":"Method Not Allowed"}"#))
        .map_err(|e| lambda_http::Error::from(e.to_string()))
}

fn handle(
    result: Result<Response<Body>, lambda_http::Error>,
) -> Result<Response<Body>, lambda_http::Error> {
    match result {
        Ok(response) => Ok(response),
        Err(error) => map_api_error_to_response(&error),
    }
}

fn map_api_error_to_response(
    error: &lambda_http::Error,
) -> Result<Response<Body>, lambda_http::Error> {
    let message = error.to_string();

    if message.contains("Invalid JSON body")
        || message.contains("must be a valid UUID")
        || message.contains("Invalid status")
        || message.contains("Invalid visibility")
        || message.contains("Invalid listing status")
        || message.contains("Invalid limit")
        || message.contains("Invalid offset")
        || message.contains("Invalid pickupDisclosurePolicy")
        || message.contains("Invalid contactPref")
        || message.contains("quantityTotal")
        || message.contains("availableStart")
        || message.contains("availableEnd")
        || message.contains("title is required")
        || message.contains("unit is required")
        || message.contains("lat must be")
        || message.contains("lng must be")
        || message.contains("does not reference an existing catalog crop")
        || message.contains("must belong to the specified crop_id")
        || message.contains("Request body is required")
        || message.contains("share_radius_km")
        || message.contains("lat and lng")
        || message.contains("units must be one of")
    {
        return crop::error_response(400, &message);
    }

    if message.contains("Missing userId in authorizer context") {
        return crop::error_response(401, &message);
    }

    if message.contains("Forbidden:") {
        return crop::error_response(403, &message);
    }

    crop::error_response(500, &message)
}
