use crate::auth::extract_auth_context;
use crate::db;
use crate::models::api_key::{
    ApiKeyItem, ApiKeyListResponse, CreatedApiKeyResponse, UpsertApiKeyRequest,
};
use lambda_http::{Body, Request, Response};
use serde::Serialize;
use sha2::{Digest, Sha256};
use tokio_postgres::Row;
use tracing::info;
use uuid::Uuid;

/// Prefix on every GRN API key. The authorizer uses it to tell an API key
/// apart from a JWT in the Authorization header.
const API_KEY_PREFIX: &str = "grnk_";
const MAX_KEY_NAME_LEN: usize = 100;

pub async fn list_api_keys(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let user_id = extract_user_id(request)?;
    let client = db::connect().await?;

    let rows = client
        .query(
            "select id, name, key_prefix, last_used_at, created_at
               from api_keys
              where user_id = $1 and revoked_at is null
              order by created_at desc",
            &[&user_id],
        )
        .await
        .map_err(|e| db_error(&e))?;

    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        api_key_count = rows.len(),
        "Listed API keys"
    );

    json_response(
        200,
        &ApiKeyListResponse {
            items: rows.iter().map(row_to_item).collect(),
        },
    )
}

pub async fn get_api_key(
    request: &Request,
    _correlation_id: &str,
    api_key_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let user_id = extract_user_id(request)?;
    let id = parse_uuid(api_key_id, "api key id")?;
    let client = db::connect().await?;

    let maybe_row = client
        .query_opt(
            "select id, name, key_prefix, last_used_at, created_at
               from api_keys
              where id = $1 and user_id = $2 and revoked_at is null",
            &[&id, &user_id],
        )
        .await
        .map_err(|e| db_error(&e))?;

    maybe_row.map_or_else(
        || error_response(404, "API key not found"),
        |row| json_response(200, &row_to_item(&row)),
    )
}

pub async fn create_api_key(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let user_id = extract_user_id(request)?;
    let payload: UpsertApiKeyRequest = parse_json_body(request)?;
    let name = validate_name(&payload.name)?;

    // Generate the secret. Two UUIDv4s give ~244 bits of entropy; the stored
    // prefix is non-secret and only used to identify the key in the UI.
    let secret = generate_api_key();
    let key_prefix: String = secret.chars().take(API_KEY_PREFIX.len() + 8).collect();
    let key_hash = sha256_hex(&secret);

    let client = db::connect().await?;
    let row = client
        .query_one(
            "insert into api_keys (user_id, name, key_prefix, key_hash)
             values ($1, $2, $3, $4)
             returning id, name, key_prefix, last_used_at, created_at",
            &[&user_id, &name, &key_prefix, &key_hash],
        )
        .await
        .map_err(|e| db_error(&e))?;

    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        api_key_id = %row.get::<_, Uuid>("id"),
        "Created API key"
    );

    json_response(
        201,
        &CreatedApiKeyResponse {
            id: row.get::<_, Uuid>("id").to_string(),
            name: row.get("name"),
            key_prefix: row.get("key_prefix"),
            key: secret,
            last_used_at: row
                .get::<_, Option<chrono::DateTime<chrono::Utc>>>("last_used_at")
                .map(|v| v.to_rfc3339()),
            created_at: row
                .get::<_, chrono::DateTime<chrono::Utc>>("created_at")
                .to_rfc3339(),
        },
    )
}

pub async fn update_api_key(
    request: &Request,
    correlation_id: &str,
    api_key_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let user_id = extract_user_id(request)?;
    let id = parse_uuid(api_key_id, "api key id")?;
    let payload: UpsertApiKeyRequest = parse_json_body(request)?;
    let name = validate_name(&payload.name)?;

    let client = db::connect().await?;
    let maybe_row = client
        .query_opt(
            "update api_keys
                set name = $1, updated_at = now()
              where id = $2 and user_id = $3 and revoked_at is null
              returning id, name, key_prefix, last_used_at, created_at",
            &[&name, &id, &user_id],
        )
        .await
        .map_err(|e| db_error(&e))?;

    maybe_row.map_or_else(
        || error_response(404, "API key not found"),
        |row| {
            info!(
                correlation_id = correlation_id,
                user_id = %user_id,
                api_key_id = %id,
                "Renamed API key"
            );
            json_response(200, &row_to_item(&row))
        },
    )
}

pub async fn delete_api_key(
    request: &Request,
    correlation_id: &str,
    api_key_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let user_id = extract_user_id(request)?;
    let id = parse_uuid(api_key_id, "api key id")?;
    let client = db::connect().await?;

    // Soft delete (revoke) so the key can no longer authenticate but history
    // and last_used analytics are preserved.
    let revoked = client
        .execute(
            "update api_keys set revoked_at = now(), updated_at = now()
              where id = $1 and user_id = $2 and revoked_at is null",
            &[&id, &user_id],
        )
        .await
        .map_err(|e| db_error(&e))?;

    if revoked == 0 {
        return error_response(404, "API key not found");
    }

    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        api_key_id = %id,
        "Revoked API key"
    );

    Response::builder()
        .status(204)
        .body(Body::Empty)
        .map_err(|e| lambda_http::Error::from(e.to_string()))
}

fn validate_name(name: &str) -> Result<String, lambda_http::Error> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(lambda_http::Error::from("name is required".to_string()));
    }
    if trimmed.chars().count() > MAX_KEY_NAME_LEN {
        return Err(lambda_http::Error::from(format!(
            "name must be {MAX_KEY_NAME_LEN} characters or fewer"
        )));
    }
    Ok(trimmed.to_string())
}

fn generate_api_key() -> String {
    format!(
        "{API_KEY_PREFIX}{}{}",
        Uuid::new_v4().simple(),
        Uuid::new_v4().simple()
    )
}

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

fn row_to_item(row: &Row) -> ApiKeyItem {
    ApiKeyItem {
        id: row.get::<_, Uuid>("id").to_string(),
        name: row.get("name"),
        key_prefix: row.get("key_prefix"),
        last_used_at: row
            .get::<_, Option<chrono::DateTime<chrono::Utc>>>("last_used_at")
            .map(|v| v.to_rfc3339()),
        created_at: row
            .get::<_, chrono::DateTime<chrono::Utc>>("created_at")
            .to_rfc3339(),
    }
}

fn extract_user_id(request: &Request) -> Result<Uuid, lambda_http::Error> {
    let auth = extract_auth_context(request)?;
    Uuid::parse_str(&auth.user_id).map_err(|_| lambda_http::Error::from("Invalid user ID format"))
}

fn parse_uuid(value: &str, field_name: &str) -> Result<Uuid, lambda_http::Error> {
    Uuid::parse_str(value.trim())
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

fn error_response(status: u16, message: &str) -> Result<Response<Body>, lambda_http::Error> {
    json_response(status, &serde_json::json!({ "error": message }))
}

fn db_error(error: &tokio_postgres::Error) -> lambda_http::Error {
    lambda_http::Error::from(format!("Database query error: {error}"))
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::{generate_api_key, sha256_hex, validate_name, API_KEY_PREFIX};

    #[test]
    fn generated_key_has_prefix_and_expected_length() {
        let key = generate_api_key();
        assert!(key.starts_with(API_KEY_PREFIX));
        // prefix + two 32-char simple UUIDs
        assert_eq!(key.len(), API_KEY_PREFIX.len() + 64);
    }

    #[test]
    fn generated_keys_are_unique() {
        assert_ne!(generate_api_key(), generate_api_key());
    }

    #[test]
    fn sha256_hex_is_stable_and_hex() {
        let a = sha256_hex("grnk_test");
        let b = sha256_hex("grnk_test");
        assert_eq!(a, b);
        assert_eq!(a.len(), 64);
        assert!(a.bytes().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn sha256_hex_differs_for_different_input() {
        assert_ne!(sha256_hex("grnk_a"), sha256_hex("grnk_b"));
    }

    #[test]
    fn validate_name_trims_and_accepts() {
        assert_eq!(validate_name("  My key  ").unwrap(), "My key");
    }

    #[test]
    fn validate_name_rejects_empty() {
        assert!(validate_name("   ").is_err());
    }

    #[test]
    fn validate_name_rejects_too_long() {
        let long = "a".repeat(101);
        assert!(validate_name(&long).is_err());
    }
}
