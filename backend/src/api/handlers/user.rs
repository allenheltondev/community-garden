use crate::db;
use crate::models::crop::ErrorResponse;
use crate::models::profile::{
    GrowerProfile, MeProfileResponse, PublicUserResponse, PutMeRequest, UserRatingSummary, UserType,
};
use lambda_http::{Body, Request, RequestExt, Response};
use serde::Serialize;
use tokio_postgres::Row;
use tracing::error;
use uuid::Uuid;

pub async fn get_current_user(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let user_id = extract_user_id(request, correlation_id)?;
    let client = db::connect().await?;

    let user_row = client
        .query_opt(
            "select id, email::text as email, display_name, is_verified, user_type, onboarding_completed, created_at from users where id = $1 and deleted_at is null",
            &[&user_id],
        )
        .await
        .map_err(|error| db_error(&error))?;

    if let Some(row) = user_row {
        return json_response(200, &to_me_response(&client, row).await?);
    }

    json_response(
        404,
        &ErrorResponse {
            error: "User profile not found".to_string(),
        },
    )
}

#[allow(clippy::too_many_lines)] // Complex handler with validation and database logic
pub async fn upsert_current_user(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let user_id = extract_user_id(request, correlation_id)?;
    let auth_email = extract_authorizer_field(request, "email");
    let payload: PutMeRequest = parse_json_body(request)?;

    // Validate the payload
    validate_put_me_payload(&payload)?;

    let client = db::connect().await?;

    // Determine if onboarding should be completed
    let should_complete_onboarding = should_mark_onboarding_complete(&payload);

    // Upsert user record with userType and onboarding_completed
    let user_row = client
        .query_one(
            "
            insert into users (id, email, display_name, user_type, onboarding_completed)
            values ($1, $2, $3, $4, $5)
            on conflict (id) do update
            set email = coalesce(excluded.email, users.email),
                display_name = coalesce(excluded.display_name, users.display_name),
                user_type = coalesce(excluded.user_type, users.user_type),
                onboarding_completed = case
                    when excluded.onboarding_completed = true then true
                    else users.onboarding_completed
                end
            returning id, email::text as email, display_name, is_verified, user_type, onboarding_completed, created_at
            ",
            &[
                &user_id,
                &auth_email,
                &payload.display_name,
                &payload.user_type.as_ref().map(|t| match t {
                    UserType::Grower => "grower",
                    UserType::Gatherer => "gatherer",
                }),
                &should_complete_onboarding,
            ],
        )
        .await
        .map_err(|error| db_error(&error))?;

    // Handle grower profile if provided
    if let Some(grower_profile) = payload.grower_profile {
        let geo_key = calculate_geohash(grower_profile.lat, grower_profile.lng);

        client
            .execute(
                "
                insert into grower_profiles
                    (user_id, home_zone, geo_key, lat, lng, share_radius_km, units, locale)
                values
                    ($1, $2, $3, $4, $5, $6, coalesce($7::units_system, 'imperial'::units_system), $8)
                on conflict (user_id) do update
                set home_zone = excluded.home_zone,
                    geo_key = excluded.geo_key,
                    lat = excluded.lat,
                    lng = excluded.lng,
                    share_radius_km = excluded.share_radius_km,
                    units = excluded.units,
                    locale = excluded.locale,
                    updated_at = now()
                ",
                &[
                    &user_id,
                    &grower_profile.home_zone,
                    &geo_key,
                    &grower_profile.lat,
                    &grower_profile.lng,
                    &grower_profile.share_radius_km,
                    &grower_profile.units,
                    &grower_profile.locale,
                ],
            )
            .await
            .map_err(|error| db_error(&error))?;
    }

    // Handle gatherer profile if provided
    if let Some(gatherer_profile) = payload.gatherer_profile {
        let geo_key = calculate_geohash(gatherer_profile.lat, gatherer_profile.lng);

        client
            .execute(
                "
                insert into gatherer_profiles
                    (user_id, geo_key, lat, lng, search_radius_km, organization_affiliation, units, locale)
                values
                    ($1, $2, $3, $4, $5, $6, coalesce($7::units_system, 'imperial'::units_system), $8)
                on conflict (user_id) do update
                set geo_key = excluded.geo_key,
                    lat = excluded.lat,
                    lng = excluded.lng,
                    search_radius_km = excluded.search_radius_km,
                    organization_affiliation = excluded.organization_affiliation,
                    units = excluded.units,
                    locale = excluded.locale,
                    updated_at = now()
                ",
                &[
                    &user_id,
                    &geo_key,
                    &gatherer_profile.lat,
                    &gatherer_profile.lng,
                    &gatherer_profile.search_radius_km,
                    &gatherer_profile.organization_affiliation,
                    &gatherer_profile.units,
                    &gatherer_profile.locale,
                ],
            )
            .await
            .map_err(|error| db_error(&error))?;
    }

    json_response(200, &to_me_response(&client, user_row).await?)
}

pub async fn get_public_user(user_id: &str) -> Result<Response<Body>, lambda_http::Error> {
    let user_uuid = parse_uuid(user_id, "user id")?;
    let client = db::connect().await?;

    let row = client
        .query_opt(
            "select id, display_name, created_at from users where id = $1 and deleted_at is null",
            &[&user_uuid],
        )
        .await
        .map_err(|error| db_error(&error))?;

    if let Some(user_row) = row {
        let response = PublicUserResponse {
            id: user_row.get::<_, Uuid>("id").to_string(),
            display_name: user_row.get("display_name"),
            created_at: user_row
                .get::<_, chrono::DateTime<chrono::Utc>>("created_at")
                .to_rfc3339(),
            grower_profile: load_grower_profile(&client, user_uuid).await?,
            rating_summary: load_rating_summary(&client, user_uuid).await?,
        };
        return json_response(200, &response);
    }

    json_response(
        404,
        &ErrorResponse {
            error: "User not found".to_string(),
        },
    )
}

fn extract_user_id(request: &Request, correlation_id: &str) -> Result<Uuid, lambda_http::Error> {
    let user_id = extract_authorizer_field(request, "userId").ok_or_else(|| {
        error!(
            correlation_id = correlation_id,
            "Missing userId in authorizer context"
        );
        lambda_http::Error::from("Missing userId in authorizer context".to_string())
    })?;

    parse_uuid(&user_id, "userId")
}

fn extract_authorizer_field(request: &Request, field_name: &str) -> Option<String> {
    request
        .request_context()
        .authorizer()
        .and_then(|auth| auth.fields.get(field_name))
        .and_then(|v| v.as_str())
        .map(ToString::to_string)
}

fn validate_put_me_payload(payload: &PutMeRequest) -> Result<(), lambda_http::Error> {
    // Validate that only one profile type is provided per request
    if payload.grower_profile.is_some() && payload.gatherer_profile.is_some() {
        return Err(lambda_http::Error::from(
            "Cannot provide both growerProfile and gathererProfile in the same request".to_string(),
        ));
    }

    // Validate profile data matches userType
    if let Some(user_type) = &payload.user_type {
        match user_type {
            UserType::Grower => {
                if payload.gatherer_profile.is_some() {
                    return Err(lambda_http::Error::from(
                        "Cannot provide gathererProfile when userType is 'grower'".to_string(),
                    ));
                }
            }
            UserType::Gatherer => {
                if payload.grower_profile.is_some() {
                    return Err(lambda_http::Error::from(
                        "Cannot provide growerProfile when userType is 'gatherer'".to_string(),
                    ));
                }
            }
        }
    }

    // Validate grower profile if provided
    if let Some(grower) = &payload.grower_profile {
        // Validate share_radius_km
        if grower.share_radius_km <= 0.0 {
            return Err(lambda_http::Error::from(
                "share_radius_km must be greater than 0".to_string(),
            ));
        }

        // Validate lat/lng ranges
        if grower.lat < -90.0 || grower.lat > 90.0 {
            return Err(lambda_http::Error::from(
                "lat must be between -90 and 90".to_string(),
            ));
        }
        if grower.lng < -180.0 || grower.lng > 180.0 {
            return Err(lambda_http::Error::from(
                "lng must be between -180 and 180".to_string(),
            ));
        }

        // Validate units
        if grower.units != "imperial" && grower.units != "metric" {
            return Err(lambda_http::Error::from(
                "units must be one of: imperial, metric".to_string(),
            ));
        }

        // Validate homeZone format (basic check - should be alphanumeric)
        if grower.home_zone.is_empty() {
            return Err(lambda_http::Error::from(
                "homeZone cannot be empty".to_string(),
            ));
        }
    }

    // Validate gatherer profile if provided
    if let Some(gatherer) = &payload.gatherer_profile {
        // Validate search_radius_km
        if gatherer.search_radius_km <= 0.0 {
            return Err(lambda_http::Error::from(
                "search_radius_km must be greater than 0".to_string(),
            ));
        }

        // Validate lat/lng ranges
        if gatherer.lat < -90.0 || gatherer.lat > 90.0 {
            return Err(lambda_http::Error::from(
                "lat must be between -90 and 90".to_string(),
            ));
        }
        if gatherer.lng < -180.0 || gatherer.lng > 180.0 {
            return Err(lambda_http::Error::from(
                "lng must be between -180 and 180".to_string(),
            ));
        }

        // Validate units
        if gatherer.units != "imperial" && gatherer.units != "metric" {
            return Err(lambda_http::Error::from(
                "units must be one of: imperial, metric".to_string(),
            ));
        }
    }

    Ok(())
}

fn should_mark_onboarding_complete(payload: &PutMeRequest) -> bool {
    // Onboarding is complete when userType is set and the corresponding profile has all required fields
    if let Some(user_type) = &payload.user_type {
        match user_type {
            UserType::Grower => {
                // Check if grower profile has all required fields
                if let Some(grower) = &payload.grower_profile {
                    return !grower.home_zone.is_empty()
                        && grower.lat >= -90.0
                        && grower.lat <= 90.0
                        && grower.lng >= -180.0
                        && grower.lng <= 180.0
                        && grower.share_radius_km > 0.0;
                }
            }
            UserType::Gatherer => {
                // Check if gatherer profile has all required fields
                if let Some(gatherer) = &payload.gatherer_profile {
                    return gatherer.lat >= -90.0
                        && gatherer.lat <= 90.0
                        && gatherer.lng >= -180.0
                        && gatherer.lng <= 180.0
                        && gatherer.search_radius_km > 0.0;
                }
            }
        }
    }
    false
}

fn calculate_geohash(lat: f64, lng: f64) -> String {
    // Use precision 7 for geohash (approximately 153m x 153m)
    // This provides good granularity for local food sharing
    geohash::encode(geohash::Coord { x: lng, y: lat }, 7)
        .unwrap_or_else(|_| String::from("unknown"))
}

async fn to_me_response(
    client: &tokio_postgres::Client,
    user_row: Row,
) -> Result<MeProfileResponse, lambda_http::Error> {
    let user_id = user_row.get::<_, Uuid>("id");

    // Parse user_type from database text to enum
    let user_type = user_row
        .get::<_, Option<String>>("user_type")
        .and_then(|s| match s.as_str() {
            "grower" => Some(crate::models::profile::UserType::Grower),
            "gatherer" => Some(crate::models::profile::UserType::Gatherer),
            _ => None,
        });

    Ok(MeProfileResponse {
        id: user_id.to_string(),
        email: user_row.get("email"),
        display_name: user_row.get("display_name"),
        is_verified: user_row.get("is_verified"),
        user_type,
        onboarding_completed: user_row.get("onboarding_completed"),
        created_at: user_row
            .get::<_, chrono::DateTime<chrono::Utc>>("created_at")
            .to_rfc3339(),
        grower_profile: load_grower_profile(client, user_id).await?,
        gatherer_profile: load_gatherer_profile(client, user_id).await?,
        rating_summary: load_rating_summary(client, user_id).await?,
    })
}

async fn load_grower_profile(
    client: &tokio_postgres::Client,
    user_id: Uuid,
) -> Result<Option<GrowerProfile>, lambda_http::Error> {
    let row = client
        .query_opt(
            "select home_zone, geo_key, lat, lng, share_radius_km::text as share_radius_km, units::text as units, locale from grower_profiles where user_id = $1",
            &[&user_id],
        )
        .await
        .map_err(|error| db_error(&error))?;

    Ok(row.map(|grower| GrowerProfile {
        home_zone: grower.get("home_zone"),
        geo_key: grower.get("geo_key"),
        lat: grower.get("lat"),
        lng: grower.get("lng"),
        share_radius_km: grower.get("share_radius_km"),
        units: grower.get("units"),
        locale: grower.get("locale"),
    }))
}

async fn load_gatherer_profile(
    client: &tokio_postgres::Client,
    user_id: Uuid,
) -> Result<Option<crate::models::profile::GathererProfile>, lambda_http::Error> {
    let row = client
        .query_opt(
            "select geo_key, lat, lng, search_radius_km::text as search_radius_km, organization_affiliation, units::text as units, locale from gatherer_profiles where user_id = $1",
            &[&user_id],
        )
        .await
        .map_err(|error| db_error(&error))?;

    Ok(row.map(|gatherer| crate::models::profile::GathererProfile {
        geo_key: gatherer.get("geo_key"),
        lat: gatherer.get("lat"),
        lng: gatherer.get("lng"),
        search_radius_km: gatherer.get("search_radius_km"),
        organization_affiliation: gatherer.get("organization_affiliation"),
        units: gatherer.get("units"),
        locale: gatherer.get("locale"),
    }))
}

async fn load_rating_summary(
    client: &tokio_postgres::Client,
    user_id: Uuid,
) -> Result<Option<UserRatingSummary>, lambda_http::Error> {
    let row = client
        .query_opt(
            "select avg_score::text as avg_score, rating_count from user_rating_summary where user_id = $1",
            &[&user_id],
        )
        .await
        .map_err(|error| db_error(&error))?;

    Ok(row.map(|rating| UserRatingSummary {
        avg_score: rating.get("avg_score"),
        rating_count: rating.get("rating_count"),
    }))
}

fn parse_uuid(value: &str, field_name: &str) -> Result<Uuid, lambda_http::Error> {
    Uuid::parse_str(value)
        .map_err(|_| lambda_http::Error::from(format!("{field_name} must be a valid UUID")))
}

fn parse_json_body<T: serde::de::DeserializeOwned>(
    request: &Request,
) -> Result<T, lambda_http::Error> {
    match request.body() {
        Body::Text(text) => serde_json::from_str::<T>(text)
            .map_err(|e| lambda_http::Error::from(format!("Invalid JSON body: {e}"))),
        Body::Binary(bytes) => serde_json::from_slice::<T>(bytes)
            .map_err(|e| lambda_http::Error::from(format!("Invalid JSON body: {e}"))),
        Body::Empty => Err(lambda_http::Error::from(
            "Request body is required".to_string(),
        )),
    }
}

fn db_error(error: &tokio_postgres::Error) -> lambda_http::Error {
    lambda_http::Error::from(format!("Database query error: {error}"))
}

fn json_response<T: Serialize>(
    status: u16,
    payload: &T,
) -> Result<Response<Body>, lambda_http::Error> {
    let body = serde_json::to_string(payload)
        .map_err(|e| lambda_http::Error::from(format!("Failed to serialize response: {e}")))?;

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
    use crate::models::profile::{GathererProfileInput, GrowerProfileInput};

    #[test]
    fn test_validate_both_profiles_rejected() {
        let payload = PutMeRequest {
            display_name: Some("Test User".to_string()),
            user_type: Some(UserType::Grower),
            grower_profile: Some(GrowerProfileInput {
                home_zone: "8a".to_string(),
                lat: 37.7749,
                lng: -122.4194,
                share_radius_km: 5.0,
                units: "imperial".to_string(),
                locale: "en-US".to_string(),
            }),
            gatherer_profile: Some(GathererProfileInput {
                lat: 37.7749,
                lng: -122.4194,
                search_radius_km: 10.0,
                organization_affiliation: None,
                units: "metric".to_string(),
                locale: "en-US".to_string(),
            }),
        };

        let result = validate_put_me_payload(&payload);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Cannot provide both"));
    }

    #[test]
    fn test_validate_profile_mismatch_grower() {
        let payload = PutMeRequest {
            display_name: Some("Test User".to_string()),
            user_type: Some(UserType::Grower),
            grower_profile: None,
            gatherer_profile: Some(GathererProfileInput {
                lat: 37.7749,
                lng: -122.4194,
                search_radius_km: 10.0,
                organization_affiliation: None,
                units: "metric".to_string(),
                locale: "en-US".to_string(),
            }),
        };

        let result = validate_put_me_payload(&payload);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Cannot provide gathererProfile when userType is 'grower'"));
    }

    #[test]
    fn test_validate_profile_mismatch_gatherer() {
        let payload = PutMeRequest {
            display_name: Some("Test User".to_string()),
            user_type: Some(UserType::Gatherer),
            grower_profile: Some(GrowerProfileInput {
                home_zone: "8a".to_string(),
                lat: 37.7749,
                lng: -122.4194,
                share_radius_km: 5.0,
                units: "imperial".to_string(),
                locale: "en-US".to_string(),
            }),
            gatherer_profile: None,
        };

        let result = validate_put_me_payload(&payload);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Cannot provide growerProfile when userType is 'gatherer'"));
    }

    #[test]
    fn test_validate_grower_negative_radius() {
        let payload = PutMeRequest {
            display_name: Some("Test User".to_string()),
            user_type: Some(UserType::Grower),
            grower_profile: Some(GrowerProfileInput {
                home_zone: "8a".to_string(),
                lat: 37.7749,
                lng: -122.4194,
                share_radius_km: -5.0,
                units: "imperial".to_string(),
                locale: "en-US".to_string(),
            }),
            gatherer_profile: None,
        };

        let result = validate_put_me_payload(&payload);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("share_radius_km must be greater than 0"));
    }

    #[test]
    fn test_validate_grower_invalid_lat() {
        let payload = PutMeRequest {
            display_name: Some("Test User".to_string()),
            user_type: Some(UserType::Grower),
            grower_profile: Some(GrowerProfileInput {
                home_zone: "8a".to_string(),
                lat: 91.0,
                lng: -122.4194,
                share_radius_km: 5.0,
                units: "imperial".to_string(),
                locale: "en-US".to_string(),
            }),
            gatherer_profile: None,
        };

        let result = validate_put_me_payload(&payload);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("lat must be between -90 and 90"));
    }

    #[test]
    fn test_validate_grower_invalid_lng() {
        let payload = PutMeRequest {
            display_name: Some("Test User".to_string()),
            user_type: Some(UserType::Grower),
            grower_profile: Some(GrowerProfileInput {
                home_zone: "8a".to_string(),
                lat: 37.7749,
                lng: -181.0,
                share_radius_km: 5.0,
                units: "imperial".to_string(),
                locale: "en-US".to_string(),
            }),
            gatherer_profile: None,
        };

        let result = validate_put_me_payload(&payload);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("lng must be between -180 and 180"));
    }

    #[test]
    fn test_validate_grower_invalid_units() {
        let payload = PutMeRequest {
            display_name: Some("Test User".to_string()),
            user_type: Some(UserType::Grower),
            grower_profile: Some(GrowerProfileInput {
                home_zone: "8a".to_string(),
                lat: 37.7749,
                lng: -122.4194,
                share_radius_km: 5.0,
                units: "invalid".to_string(),
                locale: "en-US".to_string(),
            }),
            gatherer_profile: None,
        };

        let result = validate_put_me_payload(&payload);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("units must be one of: imperial, metric"));
    }

    #[test]
    fn test_validate_gatherer_negative_radius() {
        let payload = PutMeRequest {
            display_name: Some("Test User".to_string()),
            user_type: Some(UserType::Gatherer),
            grower_profile: None,
            gatherer_profile: Some(GathererProfileInput {
                lat: 37.7749,
                lng: -122.4194,
                search_radius_km: -10.0,
                organization_affiliation: None,
                units: "metric".to_string(),
                locale: "en-US".to_string(),
            }),
        };

        let result = validate_put_me_payload(&payload);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("search_radius_km must be greater than 0"));
    }

    #[test]
    fn test_validate_valid_grower_profile() {
        let payload = PutMeRequest {
            display_name: Some("Test User".to_string()),
            user_type: Some(UserType::Grower),
            grower_profile: Some(GrowerProfileInput {
                home_zone: "8a".to_string(),
                lat: 37.7749,
                lng: -122.4194,
                share_radius_km: 5.0,
                units: "imperial".to_string(),
                locale: "en-US".to_string(),
            }),
            gatherer_profile: None,
        };

        let result = validate_put_me_payload(&payload);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_valid_gatherer_profile() {
        let payload = PutMeRequest {
            display_name: Some("Test User".to_string()),
            user_type: Some(UserType::Gatherer),
            grower_profile: None,
            gatherer_profile: Some(GathererProfileInput {
                lat: 37.7749,
                lng: -122.4194,
                search_radius_km: 10.0,
                organization_affiliation: Some("SF Food Bank".to_string()),
                units: "metric".to_string(),
                locale: "en-US".to_string(),
            }),
        };

        let result = validate_put_me_payload(&payload);
        assert!(result.is_ok());
    }

    #[test]
    fn test_should_mark_onboarding_complete_grower() {
        let payload = PutMeRequest {
            display_name: Some("Test User".to_string()),
            user_type: Some(UserType::Grower),
            grower_profile: Some(GrowerProfileInput {
                home_zone: "8a".to_string(),
                lat: 37.7749,
                lng: -122.4194,
                share_radius_km: 5.0,
                units: "imperial".to_string(),
                locale: "en-US".to_string(),
            }),
            gatherer_profile: None,
        };

        assert!(should_mark_onboarding_complete(&payload));
    }

    #[test]
    fn test_should_mark_onboarding_complete_gatherer() {
        let payload = PutMeRequest {
            display_name: Some("Test User".to_string()),
            user_type: Some(UserType::Gatherer),
            grower_profile: None,
            gatherer_profile: Some(GathererProfileInput {
                lat: 37.7749,
                lng: -122.4194,
                search_radius_km: 10.0,
                organization_affiliation: None,
                units: "metric".to_string(),
                locale: "en-US".to_string(),
            }),
        };

        assert!(should_mark_onboarding_complete(&payload));
    }

    #[test]
    fn test_should_not_mark_onboarding_complete_no_profile() {
        let payload = PutMeRequest {
            display_name: Some("Test User".to_string()),
            user_type: Some(UserType::Grower),
            grower_profile: None,
            gatherer_profile: None,
        };

        assert!(!should_mark_onboarding_complete(&payload));
    }

    #[test]
    fn test_calculate_geohash() {
        let geo_key = calculate_geohash(37.7749, -122.4194);
        assert_eq!(geo_key.len(), 7);
        assert!(geo_key.starts_with("9q8yy"));
    }

    #[test]
    fn test_calculate_geohash_different_locations() {
        let sf = calculate_geohash(37.7749, -122.4194);
        let nyc = calculate_geohash(40.7128, -74.0060);
        assert_ne!(sf, nyc);
    }
}
