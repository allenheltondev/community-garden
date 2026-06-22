use serde::{Deserialize, Serialize};

/// Create or rename an API key.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertApiKeyRequest {
    pub name: String,
}

/// Non-secret metadata about an API key. The full secret is never included
/// here; it is only returned once via `CreatedApiKeyResponse`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyItem {
    pub id: String,
    pub name: String,
    /// Non-secret display prefix (e.g. `grnk_1a2b3c4d`) so users can tell keys
    /// apart in the UI without exposing the secret.
    pub key_prefix: String,
    pub last_used_at: Option<String>,
    pub created_at: String,
}

/// Returned exactly once, immediately after a key is created. Contains the
/// full plaintext secret, which cannot be retrieved again afterwards.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedApiKeyResponse {
    pub id: String,
    pub name: String,
    pub key_prefix: String,
    /// The full plaintext API key. Shown once; only a hash is stored.
    pub key: String,
    pub last_used_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyListResponse {
    pub items: Vec<ApiKeyItem>,
}
