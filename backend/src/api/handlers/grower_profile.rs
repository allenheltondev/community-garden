use crate::models::grower_profile::{
    ErrorResponse, GrowerProfile, UpsertGrowerProfileRequest, ValidationIssue,
};
use aws_sdk_dynamodb::{types::AttributeValue, Client as DynamoClient};
use lambda_http::{Body, Request, RequestExt, Response};
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::collections::HashMap;
use std::env;
use tracing::{error, info};

const PROFILE_SK: &str = "GROWER_PROFILE";

pub async fn get_grower_profile(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    info!(
        correlation_id = correlation_id,
        "Processing GET /grower-profile request"
    );

    let Some(user_id) = extract_user_id(request) else {
        return error_response(
            401,
            ErrorResponse {
                error: "Unauthorized".to_string(),
                message: "Missing authenticated user context".to_string(),
                details: None,
            },
        );
    };

    let table_name = match env::var("TABLE_NAME") {
        Ok(value) => value,
        Err(err) => {
            error!(
                correlation_id = correlation_id,
                error = %err,
                "TABLE_NAME is not set"
            );
            return error_response(
                500,
                ErrorResponse {
                    error: "InternalServerError".to_string(),
                    message: "Server configuration error".to_string(),
                    details: None,
                },
            );
        }
    };

    let config = aws_config::load_from_env().await;
    let client = DynamoClient::new(&config);

    let result = client
        .get_item()
        .table_name(table_name)
        .key("pk", AttributeValue::S(user_pk(&user_id)))
        .key("sk", AttributeValue::S(PROFILE_SK.to_string()))
        .send()
        .await;

    let item = match result {
        Ok(output) => output.item,
        Err(err) => {
            error!(
                correlation_id = correlation_id,
                user_id = user_id.as_str(),
                error = %err,
                "Failed to read grower profile from DynamoDB"
            );
            return error_response(
                500,
                ErrorResponse {
                    error: "InternalServerError".to_string(),
                    message: "Failed to read profile".to_string(),
                    details: None,
                },
            );
        }
    };

    let Some(item) = item else {
        return error_response(
            404,
            ErrorResponse {
                error: "NotFound".to_string(),
                message: "Grower profile not found".to_string(),
                details: None,
            },
        );
    };

    let profile = match parse_profile_item(&item) {
        Ok(profile) => profile,
        Err(message) => {
            error!(
                correlation_id = correlation_id,
                user_id = user_id.as_str(),
                error = message.as_str(),
                "Stored grower profile is invalid"
            );
            return error_response(
                500,
                ErrorResponse {
                    error: "InternalServerError".to_string(),
                    message: "Stored profile is invalid".to_string(),
                    details: None,
                },
            );
        }
    };

    info!(
        correlation_id = correlation_id,
        user_id = user_id.as_str(),
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

    let Some(user_id) = extract_user_id(request) else {
        return error_response(
            401,
            ErrorResponse {
                error: "Unauthorized".to_string(),
                message: "Missing authenticated user context".to_string(),
                details: None,
            },
        );
    };

    let payload: UpsertGrowerProfileRequest = match parse_json_body(request) {
        Ok(value) => value,
        Err(response) => return Ok(response),
    };

    let issues = validate_profile_payload(&payload);
    if !issues.is_empty() {
        return error_response(
            400,
            ErrorResponse {
                error: "ValidationError".to_string(),
                message: "Request payload validation failed".to_string(),
                details: Some(issues),
            },
        );
    }

    let table_name = match env::var("TABLE_NAME") {
        Ok(value) => value,
        Err(err) => {
            error!(
                correlation_id = correlation_id,
                error = %err,
                "TABLE_NAME is not set"
            );
            return error_response(
                500,
                ErrorResponse {
                    error: "InternalServerError".to_string(),
                    message: "Server configuration error".to_string(),
                    details: None,
                },
            );
        }
    };

    let profile = GrowerProfile {
        home_zone: payload.home_zone.trim().to_string(),
        share_radius_km: payload.share_radius_km,
        units: payload.units.trim().to_string(),
        locale: payload.locale.trim().to_string(),
    };

    let config = aws_config::load_from_env().await;
    let client = DynamoClient::new(&config);

    let write_result = client
        .put_item()
        .table_name(table_name)
        .item("pk", AttributeValue::S(user_pk(&user_id)))
        .item("sk", AttributeValue::S(PROFILE_SK.to_string()))
        .item("entityType", AttributeValue::S(PROFILE_SK.to_string()))
        .item("homeZone", AttributeValue::S(profile.home_zone.clone()))
        .item(
            "shareRadiusKm",
            AttributeValue::N(profile.share_radius_km.to_string()),
        )
        .item("units", AttributeValue::S(profile.units.clone()))
        .item("locale", AttributeValue::S(profile.locale.clone()))
        .send()
        .await;

    if let Err(err) = write_result {
        error!(
            correlation_id = correlation_id,
            user_id = user_id.as_str(),
            error = %err,
            "Failed to write grower profile to DynamoDB"
        );
        return error_response(
            500,
            ErrorResponse {
                error: "InternalServerError".to_string(),
                message: "Failed to save profile".to_string(),
                details: None,
            },
        );
    }

    info!(
        correlation_id = correlation_id,
        user_id = user_id.as_str(),
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

fn parse_profile_item(
    item: &HashMap<String, AttributeValue>,
) -> Result<GrowerProfile, lambda_http::Error> {
    let home_zone = get_string_attr(item, "homeZone")?;
    let share_radius_km = get_number_attr(item, "shareRadiusKm")?;
    let units = get_string_attr(item, "units")?;
    let locale = get_string_attr(item, "locale")?;

    Ok(GrowerProfile {
        home_zone,
        share_radius_km,
        units,
        locale,
    })
}

fn get_string_attr(
    item: &HashMap<String, AttributeValue>,
    key: &str,
) -> Result<String, lambda_http::Error> {
    item.get(key)
        .and_then(AttributeValue::as_s)
        .map(ToString::to_string)
        .map_err(|_| lambda_http::Error::from(format!("Missing or invalid string field: {key}")))
}

fn get_number_attr(
    item: &HashMap<String, AttributeValue>,
    key: &str,
) -> Result<f64, lambda_http::Error> {
    let value = item
        .get(key)
        .and_then(AttributeValue::as_n)
        .map_err(|_| lambda_http::Error::from(format!("Missing or invalid number field: {key}")))?;

    value
        .parse::<f64>()
        .map_err(|_| lambda_http::Error::from(format!("Invalid numeric field: {key}")))
}

fn user_pk(user_id: &str) -> String {
    format!("USER#{user_id}")
}

fn parse_json_body<T: DeserializeOwned>(request: &Request) -> Result<T, Response<Body>> {
    let body = match request.body() {
        Body::Text(text) => text.clone(),
        Body::Binary(bytes) => match String::from_utf8(bytes.clone()) {
            Ok(text) => text,
            Err(_) => {
                return error_response_sync(
                    400,
                    ErrorResponse {
                        error: "ValidationError".to_string(),
                        message: "Request body must be valid UTF-8 JSON".to_string(),
                        details: None,
                    },
                );
            }
        },
        Body::Empty => {
            return error_response_sync(
                400,
                ErrorResponse {
                    error: "ValidationError".to_string(),
                    message: "Request body is required".to_string(),
                    details: None,
                },
            );
        }
        _ => {
            return error_response_sync(
                400,
                ErrorResponse {
                    error: "ValidationError".to_string(),
                    message: "Unsupported request body type".to_string(),
                    details: None,
                },
            );
        }
    };

    serde_json::from_str::<T>(&body).map_err(|_| {
        error_response_sync(
            400,
            ErrorResponse {
                error: "ValidationError".to_string(),
                message: "Request body must be valid JSON".to_string(),
                details: None,
            },
        )
        .unwrap_or_else(|_| {
            Response::builder()
                .status(400)
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"error":"ValidationError","message":"Request body must be valid JSON"}"#,
                ))
                .expect("hardcoded response must be valid")
        })
    })
}

fn json_response<T: serde::Serialize>(
    status: u16,
    payload: &T,
) -> Result<Response<Body>, lambda_http::Error> {
    let body = serde_json::to_string(payload).map_err(|e| lambda_http::Error::from(e.to_string()))?;

    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::from(body))
        .map_err(|e| lambda_http::Error::from(e.to_string()))
}

fn error_response(status: u16, payload: ErrorResponse) -> Result<Response<Body>, lambda_http::Error> {
    json_response(status, &payload)
}

fn error_response_sync(status: u16, payload: ErrorResponse) -> Result<Response<Body>, Response<Body>> {
    match json_response(status, &payload) {
        Ok(response) => Ok(response),
        Err(err) => {
            error!(error = %err, "Failed to build error response");
            Response::builder()
                .status(500)
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"error":"InternalServerError","message":"Failed to build error response"}"#,
                ))
                .map_err(|_| {
                    Response::builder()
                        .status(500)
                        .body(Body::from("Internal error"))
                        .expect("hardcoded response must be valid")
                })
        }
    }
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
            locale: "".to_string(),
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

    #[test]
    fn parse_profile_item_extracts_expected_fields() {
        let mut item = HashMap::new();
        item.insert("homeZone".to_string(), AttributeValue::S("8a".to_string()));
        item.insert("shareRadiusKm".to_string(), AttributeValue::N("4.5".to_string()));
        item.insert("units".to_string(), AttributeValue::S("metric".to_string()));
        item.insert("locale".to_string(), AttributeValue::S("en-US".to_string()));

        let profile = parse_profile_item(&item).unwrap();

        assert_eq!(profile.home_zone, "8a");
        assert!((profile.share_radius_km - 4.5).abs() < f64::EPSILON);
        assert_eq!(profile.units, "metric");
        assert_eq!(profile.locale, "en-US");
    }

    #[test]
    fn user_pk_prefixes_user_id() {
        assert_eq!(user_pk("abc"), "USER#abc");
    }
}
