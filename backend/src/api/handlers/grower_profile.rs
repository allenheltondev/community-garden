use crate::db;
use crate::models::grower_profile::{
    ErrorResponse, GrowerProfile, UpsertGrowerProfileRequest, ValidationIssue,
};
use lambda_http::http::{HeaderValue, StatusCode};
use lambda_http::{Body, Request, RequestExt, Response};
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::collections::HashMap;
use tokio_postgres::Row;
use tracing::{error, info};
use uuid::Uuid;

pub async fn get_grower_profile(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    info!(
        correlation_id = correlation_id,
        "Processing GET /grower-profile request"
    );

    let Some(raw_user_id) = extract_user_id(request) else {
        return error_response(
            401,
            &ErrorResponse {
                error: "Unauthorized".to_string(),
                message: "Missing authenticated user context".to_string(),
                details: None,
            },
        );
    };

    let user_id = match parse_authenticated_user_id(&raw_user_id, correlation_id) {
        Ok(value) => value,
        Err(response) => return Ok(*response),
    };

    let client = match connect_profile_store(correlation_id, &raw_user_id).await {
        Ok(value) => value,
        Err(response) => return Ok(*response),
    };

    let profile = match load_grower_profile(&client, user_id, correlation_id).await {
        Ok(Some(profile)) => profile,
        Ok(None) => {
            return error_response(
                404,
                &ErrorResponse {
                    error: "NotFound".to_string(),
                    message: "Grower profile not found".to_string(),
                    details: None,
                },
            );
        }
        Err(response) => return Ok(*response),
    };

    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        "Successfully retrieved grower profile"
    );

    json_response(200, &profile)
}

pub async fn put_grower_profile(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    info!(
        correlation_id = correlation_id,
        "Processing PUT /grower-profile request"
    );

    let Some(raw_user_id) = extract_user_id(request) else {
        return error_response(
            401,
            &ErrorResponse {
                error: "Unauthorized".to_string(),
                message: "Missing authenticated user context".to_string(),
                details: None,
            },
        );
    };

    let user_id = match parse_authenticated_user_id(&raw_user_id, correlation_id) {
        Ok(value) => value,
        Err(response) => return Ok(*response),
    };

    let payload: UpsertGrowerProfileRequest = match parse_json_body(request) {
        Ok(value) => value,
        Err(response) => return Ok(*response),
    };

    let issues = validate_profile_payload(&payload);
    if !issues.is_empty() {
        return error_response(
            400,
            &ErrorResponse {
                error: "ValidationError".to_string(),
                message: "Request payload validation failed".to_string(),
                details: Some(issues),
            },
        );
    }

    let profile = GrowerProfile {
        home_zone: payload.home_zone.trim().to_string(),
        share_radius_km: payload.share_radius_km,
        units: payload.units.trim().to_string(),
        locale: payload.locale.trim().to_string(),
    };

    let client = match connect_profile_store(correlation_id, &raw_user_id).await {
        Ok(value) => value,
        Err(response) => return Ok(*response),
    };

    if let Err(response) = save_grower_profile(&client, user_id, &profile, correlation_id).await {
        return Ok(*response);
    }

    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        "Successfully saved grower profile"
    );

    json_response(200, &profile)
}

fn validate_profile_payload(payload: &UpsertGrowerProfileRequest) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();

    if payload.home_zone.trim().is_empty() {
        issues.push(ValidationIssue {
            field: "homeZone".to_string(),
            message: "homeZone is required".to_string(),
        });
    }

    if payload.share_radius_km <= 0.0 {
        issues.push(ValidationIssue {
            field: "shareRadiusKm".to_string(),
            message: "shareRadiusKm must be greater than 0".to_string(),
        });
    }

    let units = payload.units.trim();
    if units.is_empty() {
        issues.push(ValidationIssue {
            field: "units".to_string(),
            message: "units is required".to_string(),
        });
    } else if units != "imperial" && units != "metric" {
        issues.push(ValidationIssue {
            field: "units".to_string(),
            message: "units must be either imperial or metric".to_string(),
        });
    }

    if payload.locale.trim().is_empty() {
        issues.push(ValidationIssue {
            field: "locale".to_string(),
            message: "locale is required".to_string(),
        });
    }

    issues
}

fn extract_user_id(request: &Request) -> Option<String> {
    request
        .request_context()
        .authorizer()
        .and_then(|auth| auth.fields.get("userId"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .or_else(|| {
            request
                .extensions()
                .get::<HashMap<String, Value>>()
                .and_then(|ctx| ctx.get("userId"))
                .and_then(Value::as_str)
                .map(ToString::to_string)
        })
}

fn parse_profile_row(row: &Row) -> Result<GrowerProfile, lambda_http::Error> {
    let home_zone = row
        .get::<_, Option<String>>("home_zone")
        .ok_or_else(|| lambda_http::Error::from("Missing home_zone".to_string()))?;
    let locale = row
        .get::<_, Option<String>>("locale")
        .ok_or_else(|| lambda_http::Error::from("Missing locale".to_string()))?;

    Ok(GrowerProfile {
        home_zone,
        share_radius_km: row.get("share_radius_km"),
        units: row.get("units"),
        locale,
    })
}

fn parse_authenticated_user_id(
    raw_user_id: &str,
    correlation_id: &str,
) -> Result<Uuid, Box<Response<Body>>> {
    let Ok(user_id) = Uuid::parse_str(raw_user_id) else {
        error!(
            correlation_id = correlation_id,
            user_id = raw_user_id,
            "Invalid userId in authenticated user context"
        );
        return Err(Box::new(build_error_response(
            401,
            "Unauthorized",
            "Invalid authenticated user context",
        )));
    };

    Ok(user_id)
}

async fn connect_profile_store(
    correlation_id: &str,
    user_id: &str,
) -> Result<tokio_postgres::Client, Box<Response<Body>>> {
    db::connect().await.map_err(|err| {
        error!(
            correlation_id = correlation_id,
            user_id = user_id,
            error = %err,
            "Failed to connect to Postgres"
        );
        Box::new(build_error_response(
            500,
            "InternalServerError",
            "Failed to connect to profile store",
        ))
    })
}

async fn load_grower_profile(
    client: &tokio_postgres::Client,
    user_id: Uuid,
    correlation_id: &str,
) -> Result<Option<GrowerProfile>, Box<Response<Body>>> {
    let row = client
        .query_opt(
            "
            select home_zone, share_radius_km::double precision as share_radius_km, units::text as units, locale
            from grower_profiles
            where user_id = $1
            ",
            &[&user_id],
        )
        .await
        .map_err(|err| {
            error!(
                correlation_id = correlation_id,
                user_id = %user_id,
                error = %err,
                "Failed to read grower profile from Postgres"
            );
            Box::new(build_error_response(
                500,
                "InternalServerError",
                "Failed to read profile",
            ))
        })?;

    row.map_or(Ok(None), |profile_row| {
        parse_profile_row(&profile_row).map(Some).map_err(|err| {
            error!(
                correlation_id = correlation_id,
                user_id = %user_id,
                error = %err,
                "Stored grower profile is invalid"
            );
            Box::new(build_error_response(
                500,
                "InternalServerError",
                "Stored profile is invalid",
            ))
        })
    })
}

async fn save_grower_profile(
    client: &tokio_postgres::Client,
    user_id: Uuid,
    profile: &GrowerProfile,
    correlation_id: &str,
) -> Result<(), Box<Response<Body>>> {
    client
        .execute(
            "
            insert into grower_profiles (user_id, home_zone, share_radius_km, units, locale)
            values ($1, $2, $3, $4::units_system, $5)
            on conflict (user_id) do update
            set home_zone = excluded.home_zone,
                share_radius_km = excluded.share_radius_km,
                units = excluded.units,
                locale = excluded.locale,
                updated_at = now()
            ",
            &[
                &user_id,
                &profile.home_zone,
                &profile.share_radius_km,
                &profile.units,
                &profile.locale,
            ],
        )
        .await
        .map_err(|err| {
            error!(
                correlation_id = correlation_id,
                user_id = %user_id,
                error = %err,
                "Failed to write grower profile to Postgres"
            );
            Box::new(build_error_response(
                500,
                "InternalServerError",
                "Failed to save profile",
            ))
        })?;

    Ok(())
}

fn parse_json_body<T: DeserializeOwned>(request: &Request) -> Result<T, Box<Response<Body>>> {
    let body = match request.body() {
        Body::Text(text) => text.clone(),
        Body::Binary(bytes) => match String::from_utf8(bytes.clone()) {
            Ok(text) => text,
            Err(_) => {
                return Err(Box::new(build_error_response(
                    400,
                    "ValidationError",
                    "Request body must be valid UTF-8 JSON",
                )));
            }
        },
        Body::Empty => {
            return Err(Box::new(build_error_response(
                400,
                "ValidationError",
                "Request body is required",
            )));
        }
    };

    serde_json::from_str::<T>(&body).map_err(|_| {
        Box::new(build_error_response(
            400,
            "ValidationError",
            "Request body must be valid JSON",
        ))
    })
}

fn json_response<T: serde::Serialize>(
    status: u16,
    payload: &T,
) -> Result<Response<Body>, lambda_http::Error> {
    let body =
        serde_json::to_string(payload).map_err(|e| lambda_http::Error::from(e.to_string()))?;

    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::from(body))
        .map_err(|e| lambda_http::Error::from(e.to_string()))
}

fn error_response(
    status: u16,
    payload: &ErrorResponse,
) -> Result<Response<Body>, lambda_http::Error> {
    json_response(status, payload)
}

fn build_error_response(status: u16, error: &str, message: &str) -> Response<Body> {
    let payload = ErrorResponse {
        error: error.to_string(),
        message: message.to_string(),
        details: None,
    };

    json_response(status, &payload)
        .unwrap_or_else(|_| fallback_error_response(status, error, message))
}

fn fallback_error_response(status: u16, error: &str, message: &str) -> Response<Body> {
    let mut response = Response::new(Body::from(format!(
        "{{\"error\":\"{error}\",\"message\":\"{message}\"}}"
    )));

    *response.status_mut() =
        StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    response
        .headers_mut()
        .insert("content-type", HeaderValue::from_static("application/json"));

    response
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn validation_rejects_missing_required_fields() {
        let payload = UpsertGrowerProfileRequest {
            home_zone: " ".to_string(),
            share_radius_km: 0.0,
            units: " ".to_string(),
            locale: String::new(),
        };

        let issues = validate_profile_payload(&payload);

        assert_eq!(issues.len(), 4);
        assert!(issues.iter().any(|issue| issue.field == "homeZone"));
        assert!(issues.iter().any(|issue| issue.field == "shareRadiusKm"));
        assert!(issues.iter().any(|issue| issue.field == "units"));
        assert!(issues.iter().any(|issue| issue.field == "locale"));
    }

    #[test]
    fn validation_rejects_invalid_units() {
        let payload = UpsertGrowerProfileRequest {
            home_zone: "8a".to_string(),
            share_radius_km: 5.0,
            units: "custom".to_string(),
            locale: "en-US".to_string(),
        };

        let issues = validate_profile_payload(&payload);

        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].field, "units");
    }

    #[test]
    fn validation_accepts_valid_payload() {
        let payload = UpsertGrowerProfileRequest {
            home_zone: "8a".to_string(),
            share_radius_km: 5.0,
            units: "metric".to_string(),
            locale: "en-US".to_string(),
        };

        let issues = validate_profile_payload(&payload);

        assert!(issues.is_empty());
    }
}
