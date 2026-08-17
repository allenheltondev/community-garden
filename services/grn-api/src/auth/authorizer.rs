use aws_lambda_events::event::apigw::ApiGatewayCustomAuthorizerRequestTypeRequest;
use aws_sdk_cognitoidentityprovider::Client as CognitoClient;
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use lambda_runtime::{run, service_fn, Error, LambdaEvent};
use rustls::{ClientConfig, RootCertStore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::str::FromStr;
use tokio_postgres::config::{ChannelBinding, Config};
use tokio_postgres::Client;
use tokio_postgres_rustls::MakeRustlsConnect;
use tracing::{error, warn};
use uuid::Uuid;

/// Prefix on every GRN API key. Used to distinguish an API key from a JWT when
/// both arrive in the `Authorization: Bearer <token>` header. Must match the
/// prefix produced by the API key handler.
const API_KEY_PREFIX: &str = "grnk_";
#[derive(Clone)]
struct AppState {
    cognito: CognitoClient,
    user_pool_id: String,
    user_pool_client_id: String,
    database_url: String,
}

#[derive(Debug, Deserialize)]
struct JwtClaims {
    #[serde(default)]
    sub: Option<String>,
    #[serde(default)]
    client_id: Option<String>,
    #[serde(default)]
    token_use: Option<String>,
    #[serde(default, rename = "cognito:groups")]
    cognito_groups: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "PascalCase")]
struct PolicyDocument {
    version: String,
    statement: Vec<PolicyStatement>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "PascalCase")]
struct PolicyStatement {
    action: String,
    effect: String,
    resource: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PolicyResponse {
    principal_id: String,
    policy_document: PolicyDocument,
    #[serde(skip_serializing_if = "Option::is_none")]
    context: Option<HashMap<String, String>>,
    /// The API Gateway key this request should be metered against.
    ///
    /// Only consulted when the API's key source is AUTHORIZER and the method
    /// requires a key; otherwise API Gateway ignores it. Returning it always
    /// means enforcement can be switched on without another authorizer change,
    /// and means the integrator never sends an `x-api-key` header — their GRN
    /// key doubles as the usage-plan key, so the plan is invisible to them.
    #[serde(skip_serializing_if = "Option::is_none")]
    usage_identifier_key: Option<String>,
}

fn install_rustls_crypto_provider() {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
}
#[tokio::main]
async fn main() -> Result<(), Error> {
    install_rustls_crypto_provider();
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .json()
        .init();

    let user_pool_id = std::env::var("USER_POOL_ID")?;
    let user_pool_client_id = std::env::var("USER_POOL_CLIENT_ID")?;
    let database_url = std::env::var("DATABASE_URL")?;

    let config = aws_config::load_from_env().await;
    let state = AppState {
        cognito: CognitoClient::new(&config),
        user_pool_id,
        user_pool_client_id,
        database_url,
    };

    run(service_fn(
        |event: LambdaEvent<ApiGatewayCustomAuthorizerRequestTypeRequest>| {
            let state = state.clone();
            async move { handler(event.payload, &state).await }
        },
    ))
    .await
}

async fn handler(
    event: ApiGatewayCustomAuthorizerRequestTypeRequest,
    state: &AppState,
) -> Result<PolicyResponse, Error> {
    // Allow OPTIONS requests through without authentication for CORS preflight
    if event.http_method.as_ref().map(reqwest::Method::as_str) == Some("OPTIONS") {
        let api_arn = get_api_arn_pattern(event.method_arn.as_deref().unwrap_or_default());
        return Ok(generate_policy("anonymous", "Allow", &api_arn, None));
    }

    match handle_authorization(&event, state).await {
        Ok(policy) => Ok(policy),
        Err(err) => {
            error!(error = %err, "Authorization failed");
            let api_arn = get_api_arn_pattern(event.method_arn.as_deref().unwrap_or_default());
            Ok(generate_policy("user", "Deny", &api_arn, None))
        }
    }
}

async fn handle_authorization(
    event: &ApiGatewayCustomAuthorizerRequestTypeRequest,
    state: &AppState,
) -> Result<PolicyResponse, Error> {
    if is_public_route(event) {
        let api_arn = get_api_arn_pattern(event.method_arn.as_deref().unwrap_or_default());
        return Ok(generate_policy("anonymous", "Allow", &api_arn, None));
    }

    let auth_header = get_authorization_header(event).ok_or("No Authorization header provided")?;

    if !auth_header.starts_with("Bearer ") {
        return Err("Invalid authorization header format".into());
    }

    let token = auth_header.trim_start_matches("Bearer ");

    // API keys and JWTs both travel in the Authorization header; the key prefix
    // tells them apart. This keeps the existing Authorization-based authorizer
    // identity caching intact.
    if looks_like_api_key(token) {
        handle_api_key_auth(token, event, state).await
    } else {
        handle_jwt_auth(token, event, state).await
    }
}

fn looks_like_api_key(token: &str) -> bool {
    token.starts_with(API_KEY_PREFIX)
}

async fn handle_api_key_auth(
    token: &str,
    event: &ApiGatewayCustomAuthorizerRequestTypeRequest,
    state: &AppState,
) -> Result<PolicyResponse, Error> {
    let key_hash = sha256_hex(token);

    let client = connect_db(&state.database_url)
        .await
        .ok_or("Database unavailable for API key authorization")?;

    let row = client
        .query_opt(
            "select ak.id, ak.user_id, u.user_type, u.tier, u.email::text as email
               from api_keys ak
               join users u on u.id = ak.user_id
              where ak.key_hash = $1
                and ak.revoked_at is null
                and u.deleted_at is null",
            &[&key_hash],
        )
        .await
        .map_err(|err| format!("API key lookup failed: {err}"))?
        .ok_or("Invalid or revoked API key")?;

    let key_id: Uuid = row.get("id");
    let user_id: Uuid = row.get("user_id");
    let user_type = row
        .get::<_, Option<String>>("user_type")
        .and_then(|raw| normalize_user_type(&raw));
    let tier = row
        .get::<_, Option<String>>("tier")
        .unwrap_or_else(|| "free".to_string());
    let email = row.get::<_, Option<String>>("email");

    // Best-effort last-used tracking; a failure here must not block auth. With
    // authorizer result caching this only runs on cache misses.
    if let Err(err) = client
        .execute(
            "update api_keys set last_used_at = now() where id = $1",
            &[&key_id],
        )
        .await
    {
        warn!(error = %err, api_key_id = %key_id, "Failed to update api key last_used_at");
    }

    let principal_id = user_id.to_string();
    let api_arn = get_api_arn_pattern(event.method_arn.as_deref().unwrap_or_default());
    let context = build_context([
        ("userId", Some(principal_id.clone())),
        ("userType", user_type),
        ("email", email),
        ("tier", Some(tier)),
        ("isAdmin", Some("false".to_string())),
        ("authMethod", Some("api_key".to_string())),
    ]);

    // Integrators are metered against their own API Gateway key rather than the
    // shared first-party one, which is what puts them on the integration usage
    // plan's throttle and quota. The API Gateway key's *value* is this same
    // hash — set when the key is provisioned — so the identifier is derived
    // from the presented token with no extra lookup and no second secret at
    // rest. Only the key id is stored against the row, never a key value.
    Ok(generate_policy_with_usage_key(
        &principal_id,
        "Allow",
        &api_arn,
        context,
        Some(key_hash),
    ))
}

fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

fn get_authorization_header(
    event: &ApiGatewayCustomAuthorizerRequestTypeRequest,
) -> Option<String> {
    event
        .headers
        .get("authorization")
        .or_else(|| event.headers.get("Authorization"))
        .and_then(|value| value.to_str().ok())
        .map(ToString::to_string)
}

async fn handle_jwt_auth(
    token: &str,
    event: &ApiGatewayCustomAuthorizerRequestTypeRequest,
    state: &AppState,
) -> Result<PolicyResponse, Error> {
    let claims = verify_jwt(token, &state.user_pool_id, &state.user_pool_client_id).await?;
    let user_info = get_user_attributes(token, &state.cognito).await;

    let principal_id = user_info
        .get("sub")
        .cloned()
        .or_else(|| claims.sub.clone())
        .ok_or("Missing sub claim")?;

    let principal_uuid = Uuid::parse_str(&principal_id).map_err(|_| "Invalid sub claim format")?;
    let principal_id = principal_uuid.to_string();

    let tier = get_user_tier(&state.cognito, &state.user_pool_id, &principal_id).await;
    let is_admin = user_info.get("cognito:groups").map_or_else(
        || {
            claims
                .cognito_groups
                .iter()
                .any(|group| group.eq_ignore_ascii_case("admin"))
        },
        |groups| {
            groups
                .split(',')
                .map(str::trim)
                .any(|group| group.eq_ignore_ascii_case("admin"))
        },
    );
    let user_type = get_user_type_from_db(&state.database_url, &principal_uuid).await;

    let api_arn = get_api_arn_pattern(event.method_arn.as_deref().unwrap_or_default());
    let context = build_context([
        ("userId", Some(principal_id.clone())),
        ("userType", user_type),
        ("email", user_info.get("email").cloned()),
        ("firstName", user_info.get("given_name").cloned()),
        ("lastName", user_info.get("family_name").cloned()),
        ("tier", tier),
        (
            "isAdmin",
            Some(if is_admin { "true" } else { "false" }.to_string()),
        ),
    ]);

    Ok(generate_policy(&principal_id, "Allow", &api_arn, context))
}

fn is_public_route(event: &ApiGatewayCustomAuthorizerRequestTypeRequest) -> bool {
    let method = event.http_method.as_ref().map(reqwest::Method::as_str);
    let path = event.path.as_deref().unwrap_or_default();

    method == Some("GET") && is_public_get_path(path)
}

fn is_public_get_path(path: &str) -> bool {
    // The authorizer sees the raw request path: direct execute-api calls may
    // carry the `/api` stage, and requests through the shared custom domain
    // (api.<domain>/grn/...) carry the `grn` base path, which API Gateway
    // does not strip for REST proxy events. Remove both before matching the
    // allow-list.
    let path = strip_path_prefix(strip_path_prefix(path, "/api"), "/grn");

    path == "/catalog/crops"
        || (path.starts_with("/catalog/crops/") && path.ends_with("/varieties"))
        // Read-only shared-garden views are addressed by an unguessable
        // token; the handler returns a privacy-trimmed payload and a
        // constant 404 for unknown or revoked tokens.
        || path.starts_with("/shared-gardens/")
}

fn strip_path_prefix<'a>(path: &'a str, prefix: &str) -> &'a str {
    if path == prefix {
        return "/";
    }
    path.strip_prefix(prefix)
        .filter(|stripped| stripped.starts_with('/'))
        .unwrap_or(path)
}

async fn get_user_attributes(
    access_token: &str,
    client: &CognitoClient,
) -> HashMap<String, String> {
    match client.get_user().access_token(access_token).send().await {
        Ok(response) => response
            .user_attributes
            .into_iter()
            .filter_map(|attr| attr.value.map(|value| (attr.name, value)))
            .collect(),
        Err(err) => {
            error!(error = %err, "Error fetching user attributes");
            HashMap::new()
        }
    }
}

async fn get_user_tier(
    client: &CognitoClient,
    user_pool_id: &str,
    username: &str,
) -> Option<String> {
    match client
        .admin_list_groups_for_user()
        .user_pool_id(user_pool_id)
        .username(username)
        .send()
        .await
    {
        Ok(response) => {
            let groups = response.groups();
            // Map tier groups to tier values.
            // Groups are defined in SAM template: free-tier, supporter-tier, pro-tier.
            if groups.iter().any(|g| g.group_name() == Some("pro-tier")) {
                Some("pro".to_string())
            } else if groups
                .iter()
                .any(|g| g.group_name() == Some("supporter-tier"))
            {
                Some("supporter".to_string())
            } else {
                // Default to free for free-tier or no tier group.
                Some("free".to_string())
            }
        }
        Err(err) => {
            error!(error = %err, "Error fetching user groups");
            // Default to free on error.
            Some("free".to_string())
        }
    }
}
/// Open a one-shot Postgres connection for the authorizer. Returns None on any
/// failure (logged) so callers can degrade gracefully. Shared by the userType
/// lookup and API key authorization paths.
async fn connect_db(database_url: &str) -> Option<Client> {
    let mut config = match Config::from_str(database_url) {
        Ok(config) => config,
        Err(err) => {
            error!(error = %err, "Invalid DATABASE_URL in authorizer");
            return None;
        }
    };

    if matches!(config.get_channel_binding(), ChannelBinding::Require) {
        warn!(
            "DATABASE_URL requested channel_binding=require; downgrading to prefer in authorizer"
        );
        config.channel_binding(ChannelBinding::Prefer);
    }

    let cert_result = rustls_native_certs::load_native_certs();
    if !cert_result.errors.is_empty() {
        error!(
            error_count = cert_result.errors.len(),
            "Errors occurred while loading native root certificates for authorizer db connection"
        );
    }

    let mut root_store = RootCertStore::empty();
    let (added, _) = root_store.add_parsable_certificates(cert_result.certs);
    if added == 0 {
        error!("No native root certificates available for authorizer db connection");
        return None;
    }

    let tls_config = ClientConfig::builder()
        .with_root_certificates(root_store)
        .with_no_client_auth();
    let tls = MakeRustlsConnect::new(tls_config);

    let (client, connection) = match config.connect(tls).await {
        Ok(parts) => parts,
        Err(err) => {
            error!(
                error = %err,
                error_debug = ?err,
                "Failed to connect to database in authorizer"
            );
            return None;
        }
    };

    tokio::spawn(async move {
        if let Err(err) = connection.await {
            error!(error = %err, error_debug = ?err, "Postgres connection error in authorizer");
        }
    });

    Some(client)
}

async fn get_user_type_from_db(database_url: &str, user_id: &Uuid) -> Option<String> {
    let client = connect_db(database_url).await?;

    match client
        .query_opt(
            "select user_type from users where id = $1 and deleted_at is null",
            &[user_id],
        )
        .await
    {
        Ok(Some(row)) => row
            .get::<_, Option<String>>("user_type")
            .and_then(|raw| normalize_user_type(raw.as_str())),
        Ok(None) => None,
        Err(err) => {
            error!(error = %err, user_id = %user_id, "Failed to query userType from database");
            None
        }
    }
}

fn normalize_user_type(value: &str) -> Option<String> {
    match value.to_lowercase().as_str() {
        "grower" => Some("grower".to_string()),
        _ => None,
    }
}

async fn verify_jwt(token: &str, user_pool_id: &str, client_id: &str) -> Result<JwtClaims, Error> {
    let jwks = fetch_jwks(user_pool_id).await?;
    let header = decode_header(token)?;
    let kid = header.kid.ok_or("Missing kid")?;

    let jwk = jwks
        .keys
        .into_iter()
        .find(|key| key.common.key_id.as_deref() == Some(&kid))
        .ok_or("Matching JWK not found")?;

    let decoding_key = DecodingKey::from_jwk(&jwk)?;
    let mut validation = Validation::new(Algorithm::RS256);
    validation.validate_exp = true;
    validation.set_issuer(&[issuer_for_pool(user_pool_id)?]);

    let token_data = decode::<JwtClaims>(token, &decoding_key, &validation)?;

    if token_data
        .claims
        .token_use
        .as_deref()
        .filter(|value| *value == "access")
        .is_none()
    {
        return Err("Invalid token_use claim".into());
    }

    if token_data
        .claims
        .client_id
        .as_deref()
        .filter(|value| *value == client_id)
        .is_none()
    {
        return Err("Invalid client_id claim".into());
    }

    Ok(token_data.claims)
}

fn issuer_for_pool(user_pool_id: &str) -> Result<String, Error> {
    let region = user_pool_id
        .split('_')
        .next()
        .ok_or("Invalid USER_POOL_ID")?;
    Ok(format!(
        "https://cognito-idp.{region}.amazonaws.com/{user_pool_id}"
    ))
}

#[derive(Debug, Deserialize)]
struct JwkSet {
    keys: Vec<jsonwebtoken::jwk::Jwk>,
}

async fn fetch_jwks(user_pool_id: &str) -> Result<JwkSet, Error> {
    let region = user_pool_id
        .split('_')
        .next()
        .ok_or("Invalid USER_POOL_ID")?;
    let url =
        format!("https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json");
    let response = reqwest::get(url).await?.error_for_status()?;
    let jwks = response.json::<JwkSet>().await?;
    Ok(jwks)
}

fn build_context<const N: usize>(
    entries: [(&'static str, Option<String>); N],
) -> Option<HashMap<String, String>> {
    let mut context = HashMap::new();
    for (key, value) in entries {
        if let Some(value) = value {
            context.insert(key.to_string(), value);
        }
    }

    if context.is_empty() {
        None
    } else {
        Some(context)
    }
}

fn generate_policy(
    principal_id: &str,
    effect: &str,
    resource: &str,
    context: Option<HashMap<String, String>>,
) -> PolicyResponse {
    generate_policy_with_usage_key(
        principal_id,
        effect,
        resource,
        context,
        first_party_usage_key(),
    )
}

/// The shared key every first-party caller (the web app, signed in with
/// Cognito) is metered against. Without it, switching enforcement on would
/// reject browser traffic, which carries no API key of its own.
fn first_party_usage_key() -> Option<String> {
    std::env::var("FIRST_PARTY_API_KEY_VALUE")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn generate_policy_with_usage_key(
    principal_id: &str,
    effect: &str,
    resource: &str,
    context: Option<HashMap<String, String>>,
    usage_identifier_key: Option<String>,
) -> PolicyResponse {
    PolicyResponse {
        principal_id: principal_id.to_string(),
        policy_document: PolicyDocument {
            version: "2012-10-17".to_string(),
            statement: vec![PolicyStatement {
                action: "execute-api:Invoke".to_string(),
                effect: effect.to_string(),
                resource: resource.to_string(),
            }],
        },
        context: if effect == "Allow" { context } else { None },
        usage_identifier_key: if effect == "Allow" {
            usage_identifier_key
        } else {
            None
        },
    }
}

fn get_api_arn_pattern(method_arn: &str) -> String {
    let mut parts = method_arn.split('/');
    let first = parts.next();
    let second = parts.next();
    match (first, second) {
        (Some(part1), Some(part2)) => format!("{part1}/{part2}/*/*"),
        _ => method_arn.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_key_prefix_is_recognized() {
        assert!(looks_like_api_key("grnk_abc123"));
        assert!(!looks_like_api_key(
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig"
        ));
        assert!(!looks_like_api_key(""));
        assert!(!looks_like_api_key("grnkabc"));
    }

    #[test]
    fn sha256_hex_is_stable_and_lowercase_hex() {
        let a = sha256_hex("grnk_sample");
        let b = sha256_hex("grnk_sample");
        assert_eq!(a, b);
        assert_eq!(a.len(), 64);
        assert!(a
            .bytes()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        assert_ne!(sha256_hex("grnk_a"), sha256_hex("grnk_b"));
    }

    #[test]
    fn get_api_arn_pattern_expands_resource() {
        let arn = "arn:aws:execute-api:us-east-1:123456789012:apiId/prod/GET/resource";
        assert_eq!(
            get_api_arn_pattern(arn),
            "arn:aws:execute-api:us-east-1:123456789012:apiId/prod/*/*"
        );
    }

    #[test]
    fn get_api_arn_pattern_returns_input_when_short() {
        let arn = "invalid";
        assert_eq!(get_api_arn_pattern(arn), arn);
    }

    // Helper function to extract tier mapping logic for testing
    fn map_group_to_tier(group_names: &[&str]) -> String {
        if group_names.contains(&"pro-tier") {
            "pro".to_string()
        } else if group_names.contains(&"supporter-tier") {
            "supporter".to_string()
        } else if group_names.contains(&"free-tier") {
            "free".to_string()
        } else {
            "free".to_string()
        }
    }

    #[test]
    fn tier_mapping_pro_tier_maps_to_pro() {
        let groups = vec!["pro-tier"];
        assert_eq!(map_group_to_tier(&groups), "pro");
    }

    #[test]
    fn tier_mapping_supporter_tier_maps_to_supporter() {
        let groups = vec!["supporter-tier"];
        assert_eq!(map_group_to_tier(&groups), "supporter");
    }

    #[test]
    fn tier_mapping_free_tier_maps_to_free() {
        let groups = vec!["free-tier"];
        assert_eq!(map_group_to_tier(&groups), "free");
    }

    #[test]
    fn tier_mapping_no_group_defaults_to_free() {
        let groups: Vec<&str> = vec![];
        assert_eq!(map_group_to_tier(&groups), "free");
    }

    #[test]
    fn tier_mapping_unknown_group_defaults_to_free() {
        let groups = vec!["some-other-group"];
        assert_eq!(map_group_to_tier(&groups), "free");
    }

    #[test]
    fn tier_mapping_pro_takes_precedence_over_supporter() {
        let groups = vec!["supporter-tier", "pro-tier"];
        assert_eq!(map_group_to_tier(&groups), "pro");
    }

    #[test]
    fn tier_mapping_pro_takes_precedence_over_free() {
        let groups = vec!["free-tier", "pro-tier"];
        assert_eq!(map_group_to_tier(&groups), "pro");
    }

    #[test]
    fn tier_mapping_supporter_takes_precedence_over_free() {
        let groups = vec!["free-tier", "supporter-tier"];
        assert_eq!(map_group_to_tier(&groups), "supporter");
    }

    #[test]
    fn tier_mapping_all_groups_returns_pro() {
        let groups = vec!["free-tier", "supporter-tier", "pro-tier"];
        assert_eq!(map_group_to_tier(&groups), "pro");
    }

    #[test]
    fn normalize_user_type_accepts_supported_values_case_insensitive() {
        assert_eq!(normalize_user_type("grower"), Some("grower".to_string()));
        assert_eq!(normalize_user_type("Grower"), Some("grower".to_string()));
        assert_eq!(normalize_user_type("GROWER"), Some("grower".to_string()));
    }

    #[test]
    fn normalize_user_type_rejects_unsupported_values() {
        assert_eq!(normalize_user_type(""), None);
        assert_eq!(normalize_user_type("free"), None);
        assert_eq!(normalize_user_type("gatherer"), None);
    }

    /// Regression guard: requests through the shared custom domain
    /// (api.<domain>/grn/...) keep the `grn` base path in the authorizer
    /// event path, so public routes used to fall through to a Deny.
    #[test]
    fn public_get_paths_match_through_stage_and_base_path_prefixes() {
        for path in [
            "/catalog/crops",
            "/api/catalog/crops",
            "/grn/catalog/crops",
            "/api/grn/catalog/crops",
        ] {
            assert!(is_public_get_path(path), "{path} should be public");
        }

        assert!(is_public_get_path("/api/grn/catalog/crops/123/varieties"));
        assert!(is_public_get_path("/catalog/crops/123/varieties"));
        assert!(is_public_get_path("/grn/shared-gardens/some-token"));
        assert!(is_public_get_path("/api/shared-gardens/some-token"));
    }

    #[test]
    fn non_public_paths_stay_guarded() {
        assert!(!is_public_get_path("/me"));
        assert!(!is_public_get_path("/api/grn/me"));
        assert!(!is_public_get_path("/grn/beds"));
        assert!(!is_public_get_path("/grnxyz/catalog/crops"));
        assert!(!is_public_get_path("/catalog/crops/123"));
        assert!(!is_public_get_path("/shared-gardens"));
    }

    /// A denied caller must never be handed a usage identifier: it would let a
    /// rejected request draw down someone else's plan.
    #[test]
    fn deny_carries_no_usage_identifier() {
        let policy = generate_policy_with_usage_key(
            "user",
            "Deny",
            "arn:aws:execute-api:us-east-1:1:abc/api/*/*",
            None,
            Some("first-party-key".to_string()),
        );

        assert!(policy.usage_identifier_key.is_none());
    }

    #[test]
    fn allow_carries_the_usage_identifier_it_was_given() {
        let policy = generate_policy_with_usage_key(
            "user",
            "Allow",
            "arn:aws:execute-api:us-east-1:1:abc/api/*/*",
            None,
            Some("first-party-key".to_string()),
        );

        assert_eq!(
            policy.usage_identifier_key.as_deref(),
            Some("first-party-key")
        );
    }

    /// The field is skipped entirely when absent. API Gateway rejects a null
    /// `usageIdentifierKey` on a key-required method, so an unconfigured
    /// environment has to look like it said nothing at all.
    #[test]
    fn missing_usage_identifier_is_omitted_from_the_payload() {
        let policy = generate_policy_with_usage_key(
            "user",
            "Allow",
            "arn:aws:execute-api:us-east-1:1:abc/api/*/*",
            None,
            None,
        );
        let json = serde_json::to_string(&policy).unwrap_or_default();

        assert!(!json.contains("usageIdentifierKey"), "{json}");
    }
}
