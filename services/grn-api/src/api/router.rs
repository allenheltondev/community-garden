use crate::handlers::{
    agent_task, ai_copilot, analytics, annotation, api_access_request, api_key, bed, billing,
    catalog, claim, claim_read, crop, feed, garden_canvas, garden_review, garden_share, journal,
    listing, listing_discovery, reminder, request, user,
};
use crate::middleware::correlation::{
    add_correlation_id_to_response, extract_or_generate_correlation_id,
};
use lambda_http::{Body, Request, Response};
use serde::Serialize;
use std::env;
use tracing::{error, info};

fn add_cors_headers(mut response: Response<Body>) -> Response<Body> {
    let origin = env::var("ORIGIN").unwrap_or_else(|_| "http://localhost:5173".to_string());

    let headers = response.headers_mut();

    if let Ok(value) = origin.parse() {
        headers.insert("Access-Control-Allow-Origin", value);
    }
    if let Ok(value) = "GET,POST,PUT,DELETE,OPTIONS".parse() {
        headers.insert("Access-Control-Allow-Methods", value);
    }
    if let Ok(value) = "Content-Type,Authorization,Idempotency-Key,Stripe-Signature,X-Correlation-Id,X-Amz-Date,X-Api-Key,X-Amz-Security-Token".parse() {
        headers.insert("Access-Control-Allow-Headers", value);
    }
    if let Ok(value) = "3600".parse() {
        headers.insert("Access-Control-Max-Age", value);
    }

    response
}

// lambda_http builds the request URI from the proxy event's `path` and
// prefixes the stage name, so direct execute-api calls arrive as `/api/me`.
// Requests through the shared custom domain (api.<domain>/grn/...) also
// carry the `grn` base path because API Gateway does not strip base path
// mappings from REST proxy events, yielding `/api/grn/me`. Strip both so
// routes match regardless of how the request reached us.
fn normalize_route_path(path: &str) -> &str {
    strip_path_prefix(strip_path_prefix(path, "/api"), "/grn")
}

fn strip_path_prefix<'a>(path: &'a str, prefix: &str) -> &'a str {
    if path == prefix {
        return "/";
    }
    path.strip_prefix(prefix)
        .filter(|stripped| stripped.starts_with('/'))
        .unwrap_or(path)
}

pub async fn route_request(event: &Request) -> Result<Response<Body>, lambda_http::Error> {
    let correlation_id = extract_or_generate_correlation_id(event);

    let request_path = normalize_route_path(event.uri().path());

    info!(
        correlation_id = correlation_id.as_str(),
        method = event.method().as_str(),
        raw_path = event.uri().path(),
        path = request_path,
        "Request received"
    );

    if event.method().as_str() == "OPTIONS" {
        return cors_preflight_response(&correlation_id);
    }

    let response = match (event.method().as_str(), request_path) {
        ("GET", "/me") => handle(user::get_current_user(event, &correlation_id).await)?,
        ("PUT", "/me") => handle(user::upsert_current_user(event, &correlation_id).await)?,
        ("GET", "/me/entitlements") => {
            handle(user::get_current_entitlements(event, &correlation_id).await)?
        }

        ("POST", "/billing/checkout-session") => {
            handle(billing::create_checkout_session(event, &correlation_id).await)?
        }
        ("POST", "/billing/webhook") => {
            handle(billing::handle_webhook(event, &correlation_id).await)?
        }

        ("POST", "/ai/copilot/weekly-plan") => {
            handle(ai_copilot::generate_weekly_plan(event, &correlation_id).await)?
        }

        ("POST", "/ai/copilot/garden-review") => {
            // Boxed: the review future is large and the dispatch frame is
            // already near clippy's stack-size budget.
            handle(
                Box::pin(garden_review::generate_garden_review(
                    event,
                    &correlation_id,
                ))
                .await,
            )?
        }

        ("POST", "/analytics/pro/events") => {
            handle(analytics::track_pro_event(event, &correlation_id).await)?
        }
        ("GET", "/analytics/pro/kpis") => {
            handle(analytics::get_pro_kpis(event, &correlation_id).await)?
        }

        ("GET", "/agent-tasks") => {
            handle(agent_task::list_agent_tasks(event, &correlation_id).await)?
        }
        ("POST", "/agent-tasks") => {
            handle(agent_task::create_agent_task(event, &correlation_id).await)?
        }

        ("GET", "/crops") => handle(crop::list_my_crops(event, &correlation_id).await)?,
        ("POST", "/crops") => handle(crop::create_my_crop(event, &correlation_id).await)?,

        ("GET", "/my/listings") => handle(listing::list_my_listings(event, &correlation_id).await)?,
        ("GET", "/listings/discover") => {
            handle(listing_discovery::discover_listings(event, &correlation_id).await)?
        }
        ("GET", "/feed/derived") => handle(feed::get_derived_feed(event, &correlation_id).await)?,
        ("POST", "/listings") => handle(listing::create_listing(event, &correlation_id).await)?,
        ("POST", "/requests") => handle(request::create_request(event, &correlation_id).await)?,
        ("GET", "/claims") => handle(claim_read::list_claims(event, &correlation_id).await)?,
        ("POST", "/claims") => handle(claim::create_claim(event, &correlation_id).await)?,

        ("GET", "/reminders") => handle(reminder::list_reminders(event, &correlation_id).await)?,
        ("POST", "/reminders") => handle(reminder::create_reminder(event, &correlation_id).await)?,

        ("GET", "/catalog/crops") => handle(catalog::list_catalog_crops().await)?,
        _ => {
            if let Some(result) =
                Box::pin(route_journal_request(event, &correlation_id, request_path)).await
            {
                handle(result)?
            } else {
                Box::pin(route_dynamic_routes(event, &correlation_id, request_path)).await?
            }
        }
    };

    let response_with_cors = add_cors_headers(response);
    let response_with_correlation =
        add_correlation_id_to_response(response_with_cors, &correlation_id);

    let response_status = response_with_correlation.status().as_u16();

    if response_status >= 500 {
        error!(
            correlation_id = correlation_id.as_str(),
            method = event.method().as_str(),
            path = request_path,
            status = response_status,
            "Response sent with server error"
        );
    } else {
        info!(
            correlation_id = correlation_id.as_str(),
            method = event.method().as_str(),
            path = request_path,
            status = response_status,
            "Response sent"
        );
    }

    Ok(response_with_correlation)
}

async fn route_dynamic_routes(
    event: &Request,
    correlation_id: &str,
    request_path: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    if let Some(result) = route_credentials_request(event, correlation_id, request_path).await {
        return handle(result);
    }

    if let Some(rest) = request_path.strip_prefix("/crops/") {
        if let Some((crop_library_id, harvest_id)) = rest.split_once("/harvests/") {
            let result = match event.method().as_str() {
                "PUT" => {
                    crop::update_harvest(event, correlation_id, crop_library_id, harvest_id).await
                }
                "DELETE" => {
                    crop::delete_harvest(event, correlation_id, crop_library_id, harvest_id).await
                }
                _ => method_not_allowed(),
            };
            return handle(result);
        }

        if let Some(crop_library_id) = rest.strip_suffix("/harvests") {
            let result = match event.method().as_str() {
                "GET" => crop::list_harvests(event, correlation_id, crop_library_id).await,
                "POST" => crop::record_harvest(event, correlation_id, crop_library_id).await,
                _ => method_not_allowed(),
            };
            return handle(result);
        }

        let result = match event.method().as_str() {
            "GET" => crop::get_my_crop(event, correlation_id, rest).await,
            "PUT" => crop::update_my_crop(event, correlation_id, rest).await,
            "DELETE" => crop::delete_my_crop(event, correlation_id, rest).await,
            _ => method_not_allowed(),
        };
        return handle(result);
    }

    if let Some(result) = route_garden_designer_request(event, correlation_id, request_path).await {
        return handle(result);
    }

    if let Some(listing_id) = request_path.strip_prefix("/my/listings/") {
        let result = match event.method().as_str() {
            "GET" => listing::get_listing(event, correlation_id, listing_id).await,
            _ => method_not_allowed(),
        };
        return handle(result);
    }

    if let Some(listing_id) = request_path.strip_prefix("/listings/") {
        let result = match event.method().as_str() {
            "PUT" => listing::update_listing(event, correlation_id, listing_id).await,
            _ => method_not_allowed(),
        };
        return handle(result);
    }

    if let Some(request_id) = request_path.strip_prefix("/requests/") {
        let result = match event.method().as_str() {
            "PUT" => request::update_request(event, correlation_id, request_id).await,
            _ => method_not_allowed(),
        };
        return handle(result);
    }

    if let Some(reminder_id) = request_path.strip_prefix("/reminders/") {
        let result = match event.method().as_str() {
            "PUT" => reminder::update_reminder_status(event, correlation_id, reminder_id).await,
            _ => method_not_allowed(),
        };
        return handle(result);
    }

    if let Some(task_id) = request_path.strip_prefix("/agent-tasks/") {
        let result = match event.method().as_str() {
            "PUT" => agent_task::update_agent_task_status(event, correlation_id, task_id).await,
            _ => method_not_allowed(),
        };
        return handle(result);
    }

    if let Some(claim_id) = request_path.strip_prefix("/claims/") {
        let result = match event.method().as_str() {
            "PUT" => claim::transition_claim(event, correlation_id, claim_id).await,
            _ => method_not_allowed(),
        };
        return handle(result);
    }

    if let Some(user_id) = request_path.strip_prefix("/users/") {
        return if event.method().as_str() == "GET" {
            handle(user::get_public_user(user_id).await)
        } else {
            method_not_allowed()
        };
    }

    if let Some(crop_id) = request_path.strip_prefix("/catalog/crops/") {
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

fn cors_preflight_response(correlation_id: &str) -> Result<Response<Body>, lambda_http::Error> {
    let response = Response::builder()
        .status(200)
        .body(Body::Empty)
        .map_err(|event| lambda_http::Error::from(event.to_string()))?;
    Ok(add_correlation_id_to_response(
        add_cors_headers(response),
        correlation_id,
    ))
}

async fn route_journal_request(
    event: &Request,
    correlation_id: &str,
    request_path: &str,
) -> Option<Result<Response<Body>, lambda_http::Error>> {
    let result = match (event.method().as_str(), request_path) {
        ("GET", "/journal") => Box::pin(journal::list_journal(event, correlation_id)).await,
        ("POST", "/journal/notes") => journal::create_note(event, correlation_id).await,
        ("POST", "/journal/photo-upload-url") => {
            journal::create_photo_upload_url(event, correlation_id).await
        }
        (method, path) if path.starts_with("/journal/notes/") => {
            let note_id = path.trim_start_matches("/journal/notes/");
            match method {
                "DELETE" => journal::delete_note(event, correlation_id, note_id).await,
                _ => method_not_allowed(),
            }
        }
        _ => return None,
    };
    Some(result)
}

/// API access requests and the keys they authorise share a dispatch entry so
/// the main route table stays within its line budget.
async fn route_credentials_request(
    event: &Request,
    correlation_id: &str,
    request_path: &str,
) -> Option<Result<Response<Body>, lambda_http::Error>> {
    if let Some(result) = route_api_access_request(event, correlation_id, request_path).await {
        return Some(result);
    }
    route_api_key_request(event, correlation_id, request_path).await
}

async fn route_api_access_request(
    event: &Request,
    correlation_id: &str,
    request_path: &str,
) -> Option<Result<Response<Body>, lambda_http::Error>> {
    if request_path == "/me/api-access-requests" {
        return Some(match event.method().as_str() {
            "GET" => api_access_request::list_my_requests(event, correlation_id).await,
            "POST" => api_access_request::create_request(event, correlation_id).await,
            _ => method_not_allowed(),
        });
    }

    // Admin queue. Authorization is checked in the handler from the
    // authorizer's isAdmin context, which until now nothing consumed.
    if request_path == "/admin/api-access-requests" {
        return Some(match event.method().as_str() {
            "GET" => api_access_request::admin_list_requests(event, correlation_id).await,
            _ => method_not_allowed(),
        });
    }

    if let Some(rest) = request_path.strip_prefix("/admin/api-access-requests/") {
        if let Some(id) = rest.strip_suffix("/approve") {
            return Some(match event.method().as_str() {
                "POST" => api_access_request::admin_decide(event, correlation_id, id, true).await,
                _ => method_not_allowed(),
            });
        }
        if let Some(id) = rest.strip_suffix("/deny") {
            return Some(match event.method().as_str() {
                "POST" => api_access_request::admin_decide(event, correlation_id, id, false).await,
                _ => method_not_allowed(),
            });
        }
    }

    None
}

async fn route_api_key_request(
    event: &Request,
    correlation_id: &str,
    request_path: &str,
) -> Option<Result<Response<Body>, lambda_http::Error>> {
    if request_path == "/me/api-keys" {
        return Some(match event.method().as_str() {
            "GET" => api_key::list_api_keys(event, correlation_id).await,
            "POST" => api_key::create_api_key(event, correlation_id).await,
            _ => method_not_allowed(),
        });
    }
    if let Some(api_key_id) = request_path.strip_prefix("/me/api-keys/") {
        return Some(match event.method().as_str() {
            "GET" => api_key::get_api_key(event, correlation_id, api_key_id).await,
            "PUT" => api_key::update_api_key(event, correlation_id, api_key_id).await,
            "DELETE" => api_key::delete_api_key(event, correlation_id, api_key_id).await,
            _ => method_not_allowed(),
        });
    }
    None
}

async fn route_garden_designer_request(
    event: &Request,
    correlation_id: &str,
    request_path: &str,
) -> Option<Result<Response<Body>, lambda_http::Error>> {
    if request_path == "/garden" {
        return Some(match event.method().as_str() {
            "GET" => garden_canvas::get_my_canvas(event, correlation_id).await,
            "PUT" => garden_canvas::update_my_canvas(event, correlation_id).await,
            _ => method_not_allowed(),
        });
    }
    if request_path == "/garden/background-upload-url" {
        return Some(match event.method().as_str() {
            "POST" => garden_canvas::create_background_upload_url(event, correlation_id).await,
            _ => method_not_allowed(),
        });
    }
    if request_path == "/garden/share" {
        return Some(match event.method().as_str() {
            "GET" => garden_share::get_my_share_link(event, correlation_id).await,
            "POST" => garden_share::create_my_share_link(event, correlation_id).await,
            "DELETE" => garden_share::revoke_my_share_link(event, correlation_id).await,
            _ => method_not_allowed(),
        });
    }
    // Public, token-addressed view (allow-listed in the authorizer).
    if let Some(token) = request_path.strip_prefix("/shared-gardens/") {
        return Some(match event.method().as_str() {
            "GET" => garden_share::get_shared_garden(token, correlation_id).await,
            _ => method_not_allowed(),
        });
    }
    if request_path == "/beds" {
        return Some(match event.method().as_str() {
            "GET" => bed::list_my_beds(event, correlation_id).await,
            "POST" => bed::create_my_bed(event, correlation_id).await,
            _ => method_not_allowed(),
        });
    }
    if let Some(bed_id) = request_path.strip_prefix("/beds/") {
        return Some(match event.method().as_str() {
            "PUT" => bed::update_my_bed(event, correlation_id, bed_id).await,
            "DELETE" => bed::delete_my_bed(event, correlation_id, bed_id).await,
            _ => method_not_allowed(),
        });
    }
    if request_path == "/annotations" {
        return Some(match event.method().as_str() {
            "GET" => annotation::list_my_annotations(event, correlation_id).await,
            "POST" => annotation::create_my_annotation(event, correlation_id).await,
            _ => method_not_allowed(),
        });
    }
    if let Some(annotation_id) = request_path.strip_prefix("/annotations/") {
        return Some(match event.method().as_str() {
            "PUT" => annotation::update_my_annotation(event, correlation_id, annotation_id).await,
            "DELETE" => {
                annotation::delete_my_annotation(event, correlation_id, annotation_id).await
            }
            _ => method_not_allowed(),
        });
    }
    None
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
        Err(error) => {
            error!(error = %error, "Request handler returned error");
            map_api_error_to_response(&error)
        }
    }
}

fn is_garden_designer_validation_message(message: &str) -> bool {
    // Bed shape/type/geometry + canvas + presigned-upload + annotation
    // validation messages. Kept here so map_api_error_to_response stays
    // under the clippy too_many_lines threshold; each contains() check is
    // one phrase that must round-trip from a handler validation Err to a
    // 400 response.
    message.contains("Invalid bedType")
        || message.contains("Invalid bed shape")
        || message.contains("Invalid annotation shape")
        || message.contains("annotation label is required")
        || message.contains("annotation label must be")
        || message.contains("annotation icon must be")
        || message.contains("annotation dimensions must be")
        || message.contains("rotationDeg must be")
        || message.contains("points is required when shape is polygon")
        || message.contains("points is required when shape is line")
        || message.contains("points must be an array")
        || message.contains("points must contain at least 3 entries")
        || message.contains("points must contain at least 2 entries")
        || message.contains("points must contain")
        || message.contains("each point must")
        || message.contains("point coordinates must fit")
        || message.contains("color must be a 7-character hex string")
        || message.contains("widthInches must be between")
        || message.contains("heightInches must be between")
        || message.contains("backgroundOpacity must be")
        || message.contains("northOffsetDeg must be")
        || message.contains("backgroundImageKey must")
        || message.contains("contentType must be one of")
        || message.contains("contentLength must be")
}

fn is_journal_validation_message(message: &str) -> bool {
    message.contains("season must be")
        || message.contains("occurredOn")
        || message.contains("body must be")
        || message.contains("photoKey must")
        || message.contains("noteId must")
        || message.contains("Idempotency-Key header is required")
}

fn map_api_error_to_response(
    error: &lambda_http::Error,
) -> Result<Response<Body>, lambda_http::Error> {
    let message = error.to_string();

    if message.contains("Invalid JSON body")
        || message.contains("must be a valid UUID")
        || message.contains("Invalid status")
        || message.contains("status must be")
        || message.contains("Invalid claim status")
        || message.contains("Invalid claim transition")
        || message.contains("Invalid visibility")
        || message.contains("Invalid listing status")
        || message.contains("Invalid limit")
        || message.contains("Invalid offset")
        || message.contains("Invalid pickupDisclosurePolicy")
        || message.contains("Invalid contactPref")
        || message.contains("quantityTotal")
        || message.contains("quantity must be greater than 0")
        || message.contains("quantityClaimed must be greater than 0")
        || message.contains("availableStart")
        || message.contains("availableEnd")
        || message.contains("neededBy must be")
        || message.contains("title is required")
        || message.contains("unit is required")
        || message.contains("crop_name is required")
        || message.contains("name is required")
        || message.contains("name must be")
        || message.contains("bed name is required")
        || message.contains("bed name must be")
        || message.contains("Invalid sunExposure")
        || message.contains("bed dimensions must be non-negative")
        || message.contains("bed_id does not reference one of your garden beds")
        || is_garden_designer_validation_message(&message)
        || message.contains("plantingDate must be")
        || message.contains("expectedHarvestDate must be")
        || message.contains("harvestedOn must be")
        || message.contains("amount must be greater than 0")
        || message.contains("plantCount must be")
        || message.contains("spacingInches must be")
        || message.contains("does not reference an existing catalog crop")
        || message.contains("does not reference an existing grower crop")
        || message.contains("does not match the canonical crop linked to grower_crop_id")
        || message.contains("variety_id requires a crop_id or a grower_crop_id")
        || message.contains("must belong to the specified crop_id")
        || message.contains("must belong to the specified cropId")
        || message.contains("Request body is required")
        || message.contains("units must be one of")
        || message.contains("homeZone")
        || message.contains("address is required")
        || message.contains("pickupAddress is required because grower profile address is missing")
        || message.contains("geoKey")
        || message.contains("windowDays")
        || message.contains("radiusMiles")
        || message.contains("shareRadiusMiles")
        || message.contains("organizationName")
        || message.contains("A grower profile location is required")
        || message.contains("Listing is not claimable")
        || message.contains("requestId must reference an open request")
        || message.contains("requestId crop must match listing crop")
        || is_journal_validation_message(&message)
    {
        return crop::error_response(400, &message);
    }

    if message.contains("Insufficient quantity remaining") || message.contains("Idempotency key") {
        return crop::error_response(409, &message);
    }

    if message.contains("Request not found")
        || message.contains("Claim not found")
        || message.contains("Listing not found")
        || message.contains("Journal note not found")
    {
        return crop::error_response(404, &message);
    }

    if message.contains("Geocoding service unavailable") {
        return crop::error_response(503, &message);
    }

    if message.contains("is not configured")
        || message.contains("STRIPE_SECRET_KEY")
        || message.contains("STRIPE_PRO_PRICE_ID")
        || message.contains("STRIPE_WEBHOOK_SECRET")
        || message.contains("MEDIA_BUCKET_NAME")
    {
        return crop::error_response(503, "Service not configured in this environment");
    }

    if message.contains("Address could not be geocoded") {
        return crop::error_response(400, &message);
    }

    if message.contains("Missing userId in authorizer context") {
        return crop::error_response(401, &message);
    }

    if message.contains("user type not set")
        || message.contains("onboarding may be incomplete")
        || message.contains("Please complete onboarding")
    {
        return onboarding_incomplete_response();
    }

    if message.contains("Forbidden:") {
        return crop::error_response(403, &message);
    }

    crop::error_response(500, &message)
}

#[derive(Serialize)]
struct OnboardingIncompleteError {
    error: String,
    message: String,
}

fn onboarding_incomplete_response() -> Result<Response<Body>, lambda_http::Error> {
    let payload = OnboardingIncompleteError {
        error: "onboarding_incomplete".to_string(),
        message:
            "User type is not configured. Set userType via PUT /me before calling this endpoint."
                .to_string(),
    };

    let body = serde_json::to_string(&payload)
        .map_err(|e| lambda_http::Error::from(format!("Failed to serialize response: {e}")))?;

    Response::builder()
        .status(403)
        .header("content-type", "application/json")
        .body(Body::from(body))
        .map_err(|e| lambda_http::Error::from(e.to_string()))
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::{map_api_error_to_response, normalize_route_path};
    use lambda_http::Body;

    #[test]
    fn normalize_route_path_strips_api_stage_prefix() {
        assert_eq!(normalize_route_path("/api/crops"), "/crops");
        assert_eq!(normalize_route_path("/api/catalog/crops"), "/catalog/crops");
    }

    #[test]
    fn normalize_route_path_leaves_non_stage_paths_unchanged() {
        assert_eq!(normalize_route_path("/crops"), "/crops");
        assert_eq!(normalize_route_path("/catalog/crops"), "/catalog/crops");
        assert_eq!(normalize_route_path("/api"), "/");
    }

    /// Regression guard: requests through the shared custom domain
    /// (api.<domain>/grn/...) keep the `grn` base path in the event path, so
    /// the router used to fall through to the catch-all 404 for every route.
    #[test]
    fn normalize_route_path_strips_custom_domain_base_path() {
        assert_eq!(normalize_route_path("/api/grn/me"), "/me");
        assert_eq!(
            normalize_route_path("/api/grn/catalog/crops"),
            "/catalog/crops"
        );
        assert_eq!(normalize_route_path("/grn/me"), "/me");
        assert_eq!(normalize_route_path("/grn"), "/");
        assert_eq!(normalize_route_path("/api/grn"), "/");
    }

    #[test]
    fn normalize_route_path_leaves_grn_like_segments_unchanged() {
        assert_eq!(normalize_route_path("/grnxyz/me"), "/grnxyz/me");
        assert_eq!(normalize_route_path("/api/grnxyz"), "/grnxyz");
        assert_eq!(normalize_route_path("/growers"), "/growers");
    }

    #[test]
    fn map_api_error_maps_share_radius_miles_validation_to_400() {
        let error = lambda_http::Error::from("shareRadiusMiles must be greater than 0".to_string());
        let response = map_api_error_to_response(&error).unwrap();
        assert_eq!(response.status().as_u16(), 400);
    }

    #[test]
    fn map_api_error_maps_request_needed_by_validation_to_400() {
        let error =
            lambda_http::Error::from("neededBy must be within the next 365 days".to_string());
        let response = map_api_error_to_response(&error).unwrap();
        assert_eq!(response.status().as_u16(), 400);
    }

    #[test]
    fn map_api_error_maps_organization_name_validation_to_400() {
        let error = lambda_http::Error::from(
            "organizationName is required when isOrganization is true".to_string(),
        );
        let response = map_api_error_to_response(&error).unwrap();
        assert_eq!(response.status().as_u16(), 400);
    }

    #[test]
    fn map_api_error_maps_unknown_grower_crop_to_400() {
        let error = lambda_http::Error::from(
            "grower_crop_id does not reference an existing grower crop".to_string(),
        );
        let response = map_api_error_to_response(&error).unwrap();
        assert_eq!(response.status().as_u16(), 400);
    }

    #[test]
    fn map_api_error_maps_grower_crop_canonical_mismatch_to_400() {
        let error = lambda_http::Error::from(
            "crop_id 5df666d4-f6b1-4e6f-97d6-321e531ad7ca does not match the canonical crop linked to grower_crop_id 0e7ab2f8-9d1b-46b0-9c53-b6053bc90011".to_string(),
        );
        let response = map_api_error_to_response(&error).unwrap();
        assert_eq!(response.status().as_u16(), 400);
    }

    #[test]
    fn map_api_error_maps_variety_without_crop_context_to_400() {
        let error = lambda_http::Error::from(
            "variety_id requires a crop_id or a grower_crop_id linked to a catalog crop"
                .to_string(),
        );
        let response = map_api_error_to_response(&error).unwrap();
        assert_eq!(response.status().as_u16(), 400);
    }

    #[test]
    fn map_api_error_maps_insufficient_quantity_to_409() {
        let error = lambda_http::Error::from("Insufficient quantity remaining".to_string());
        let response = map_api_error_to_response(&error).unwrap();
        assert_eq!(response.status().as_u16(), 409);
    }

    #[test]
    fn map_api_error_maps_journal_validation_to_400() {
        let error = lambda_http::Error::from("season must be a year from 2000 to 2100".to_string());
        let response = map_api_error_to_response(&error).unwrap();
        assert_eq!(response.status().as_u16(), 400);
    }

    #[test]
    fn map_api_error_maps_idempotency_collision_to_409() {
        let error = lambda_http::Error::from(
            "Idempotency key collision for reminder completion".to_string(),
        );
        let response = map_api_error_to_response(&error).unwrap();
        assert_eq!(response.status().as_u16(), 409);
    }

    #[test]
    fn map_api_error_maps_request_not_found_to_404() {
        let error = lambda_http::Error::from("Request not found".to_string());
        let response = map_api_error_to_response(&error).unwrap();
        assert_eq!(response.status().as_u16(), 404);
    }

    #[test]
    fn map_api_error_maps_listing_not_found_to_404() {
        let error = lambda_http::Error::from("Listing not found".to_string());
        let response = map_api_error_to_response(&error).unwrap();
        assert_eq!(response.status().as_u16(), 404);
    }

    #[test]
    fn map_api_error_maps_missing_user_type_to_403() {
        let error =
            lambda_http::Error::from("user type not set, onboarding may be incomplete".to_string());
        let response = map_api_error_to_response(&error).unwrap();
        assert_eq!(response.status().as_u16(), 403);
    }

    #[test]
    fn map_api_error_maps_not_configured_to_503() {
        let error = lambda_http::Error::from("STRIPE_SECRET_KEY is not configured".to_string());
        let response = map_api_error_to_response(&error).unwrap();
        assert_eq!(response.status().as_u16(), 503);

        let body = match response.body() {
            Body::Text(text) => text.as_str(),
            _ => "",
        };
        assert!(
            body.contains("Service not configured"),
            "503 body should use generic message, not leak env var names"
        );
    }

    #[test]
    fn map_api_error_maps_wrapped_checkout_configuration_error_to_503() {
        let error =
            lambda_http::Error::from("Error: STRIPE_PRO_PRICE_ID is not configured".to_string());
        let response = map_api_error_to_response(&error).unwrap();
        assert_eq!(response.status().as_u16(), 503);
    }

    #[test]
    fn map_api_error_maps_wrapped_webhook_configuration_error_to_503() {
        let error = lambda_http::Error::from(
            "billing webhook failed because STRIPE_WEBHOOK_SECRET was missing".to_string(),
        );
        let response = map_api_error_to_response(&error).unwrap();
        assert_eq!(response.status().as_u16(), 503);
    }

    #[test]
    fn map_api_error_missing_user_type_returns_onboarding_code_and_message() {
        let error = lambda_http::Error::from(
            "Forbidden: User type not set. Please complete onboarding.".to_string(),
        );
        let response = map_api_error_to_response(&error).unwrap();

        assert_eq!(response.status().as_u16(), 403);

        let body = match response.body() {
            Body::Text(text) => text,
            Body::Binary(bytes) => std::str::from_utf8(bytes).unwrap(),
            Body::Empty => "",
        };

        let json: serde_json::Value = serde_json::from_str(body).unwrap();
        assert_eq!(
            json.get("error").and_then(serde_json::Value::as_str),
            Some("onboarding_incomplete")
        );
        assert_eq!(
            json.get("message").and_then(serde_json::Value::as_str),
            Some("User type is not configured. Set userType via PUT /me before calling this endpoint.")
        );
    }
}
