use crate::db;
use crate::models::crop::ErrorResponse;
use crate::models::profile::{
    GrowerProfile, MeProfileResponse, PublicUserResponse, UpsertMeProfileRequest, UserRatingSummary,
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
            "select id, email::text as email, display_name, is_verified, created_at from users where id = $1 and deleted_at is null",
            &[&user_id],
        )
        .await
        .map_err(db_error)?;

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

pub async fn upsert_current_user(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let user_id = extract_user_id(request, correlation_id)?;
    let auth_email = extract_authorizer_field(request, "email");
    let payload: UpsertMeProfileRequest = parse_json_body(request)?;
    validate_me_payload(&payload)?;

    let client = db::connect().await?;

    let email = payload.email.clone().or(auth_email);

    let user_row = client
        .query_one(
            "
            insert into users (id, email, display_name)
            values ($1, $2, $3)
            on conflict (id) do update
            set email = coalesce(excluded.email, users.email),
                display_name = coalesce(excluded.display_name, users.display_name)
            returning id, email::text as email, display_name, is_verified, created_at
            ",
            &[&user_id, &email, &payload.display_name],
        )
        .await
        .map_err(db_error)?;

    if let Some(grower_profile) = payload.grower_profile {
        let share_radius_km = grower_profile
            .share_radius_km
            .as_deref()
            .unwrap_or("5.000")
            .parse::<f64>()
            .map_err(|_| lambda_http::Error::from("share_radius_km must be numeric".to_string()))?;

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
                    &grower_profile.geo_key,
                    &grower_profile.lat,
                    &grower_profile.lng,
                    &share_radius_km,
                    &grower_profile.units,
                    &grower_profile.locale,
                ],
            )
            .await
            .map_err(db_error)?;
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
        .map_err(db_error)?;

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

fn validate_me_payload(payload: &UpsertMeProfileRequest) -> Result<(), lambda_http::Error> {
    if let Some(grower) = &payload.grower_profile {
        let has_lat = grower.lat.is_some();
        let has_lng = grower.lng.is_some();
        if has_lat != has_lng {
            return Err(lambda_http::Error::from(
                "lat and lng must both be provided together".to_string(),
            ));
        }

        if let Some(radius) = &grower.share_radius_km {
            let parsed = radius.parse::<f64>().map_err(|_| {
                lambda_http::Error::from("share_radius_km must be numeric".to_string())
            })?;
            if parsed <= 0.0 {
                return Err(lambda_http::Error::from(
                    "share_radius_km must be greater than 0".to_string(),
                ));
            }
        }

        if let Some(units) = &grower.units {
            if units != "imperial" && units != "metric" {
                return Err(lambda_http::Error::from(
                    "units must be one of: imperial, metric".to_string(),
                ));
            }
        }
    }

    Ok(())
}

async fn to_me_response(
    client: &tokio_postgres::Client,
    user_row: Row,
) -> Result<MeProfileResponse, lambda_http::Error> {
    let user_id = user_row.get::<_, Uuid>("id");

    Ok(MeProfileResponse {
        id: user_id.to_string(),
        email: user_row.get("email"),
        display_name: user_row.get("display_name"),
        is_verified: user_row.get("is_verified"),
        created_at: user_row
            .get::<_, chrono::DateTime<chrono::Utc>>("created_at")
            .to_rfc3339(),
        grower_profile: load_grower_profile(client, user_id).await?,
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
        .map_err(db_error)?;

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
        .map_err(db_error)?;

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

fn db_error(error: tokio_postgres::Error) -> lambda_http::Error {
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
