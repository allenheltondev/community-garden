//! Provisioning for the API Gateway side of an approved access request.
//!
//! The grower never sees or sends the API Gateway key. Their credential stays
//! the GRN key (`grnk_…`); the API Gateway key's value is set to the SHA-256 of
//! that credential, so the authorizer can hand API Gateway a
//! `usageIdentifierKey` computed straight from the presented token — no lookup,
//! and nothing at rest that the authorizer does not already store. That
//! identifier is what lets a usage plan throttle and meter them. Everything in
//! here is therefore invisible plumbing: the key id is recorded against the GRN
//! key so access can be disabled later.

use aws_config::BehaviorVersion;
use aws_sdk_apigateway::Client;
use tracing::{error, info};

/// What a successful provisioning run produced, to be recorded against the
/// issued GRN key.
#[derive(Debug, Clone)]
pub struct ProvisionedKey {
    pub aws_api_key_id: String,
    pub usage_plan_id: String,
}

fn usage_plan_id() -> Option<String> {
    std::env::var("INTEGRATION_USAGE_PLAN_ID")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

async fn client() -> Client {
    let config = aws_config::load_defaults(BehaviorVersion::latest()).await;
    Client::new(&config)
}

/// Create an API Gateway key for an approved request and attach it to the
/// integration usage plan.
///
/// `value` must be the SHA-256 hex of the GRN key the grower was handed: it
/// becomes the API Gateway key's value, which is the string the authorizer
/// returns as `usageIdentifierKey` on that grower's requests. Hex keeps it
/// inside the character set API Gateway accepts and well past its 20-character
/// minimum. It is not a credential on its own — with an `AUTHORIZER` key
/// source, API Gateway ignores any `x-api-key` a caller sends, so the only way
/// to be metered against this key is to pass the authorizer holding the real
/// `grnk_…` secret.
///
/// Returns `Ok(None)` when no usage plan is configured for the environment,
/// which is the case before the plan is deployed: approval still issues the GRN
/// key so the integrator is not blocked, and the key can be attached later.
/// A failure to create the key is an error, because silently issuing an
/// unthrottled credential is worse than failing the approval.
pub async fn provision(
    name: &str,
    description: &str,
    value: &str,
) -> Result<Option<ProvisionedKey>, lambda_http::Error> {
    let Some(plan_id) = usage_plan_id() else {
        info!("No INTEGRATION_USAGE_PLAN_ID configured; issuing key without a usage plan");
        return Ok(None);
    };

    let client = client().await;

    let created = client
        .create_api_key()
        .name(name)
        .description(description)
        .enabled(true)
        .value(value)
        .send()
        .await
        .map_err(|error| {
            error!(error = %error, "Failed to create API Gateway key");
            lambda_http::Error::from("Failed to create API Gateway key".to_string())
        })?;

    let key_id = created
        .id()
        .ok_or_else(|| lambda_http::Error::from("API Gateway key created without an id"))?
        .to_string();
    // Attach to the usage plan. If this fails the key exists but is unmetered,
    // so it is disabled again rather than left dangling.
    if let Err(error) = client
        .create_usage_plan_key()
        .usage_plan_id(&plan_id)
        .key_id(&key_id)
        .key_type("API_KEY")
        .send()
        .await
    {
        error!(error = %error, api_key_id = %key_id, "Failed to attach key to usage plan");
        disable(&client, &key_id).await;
        return Err(lambda_http::Error::from(
            "Failed to attach API Gateway key to the usage plan".to_string(),
        ));
    }

    info!(api_key_id = %key_id, usage_plan_id = %plan_id, "Provisioned API Gateway key");

    Ok(Some(ProvisionedKey {
        aws_api_key_id: key_id,
        usage_plan_id: plan_id,
    }))
}

async fn disable(client: &Client, key_id: &str) {
    let result = client
        .update_api_key()
        .api_key(key_id)
        .patch_operations(
            aws_sdk_apigateway::types::PatchOperation::builder()
                .op(aws_sdk_apigateway::types::Op::Replace)
                .path("/enabled")
                .value("false")
                .build(),
        )
        .send()
        .await;

    if let Err(error) = result {
        error!(error = %error, api_key_id = %key_id, "Failed to disable API Gateway key");
    }
}

/// Disable an API Gateway key when its GRN key is revoked. Best effort: the GRN
/// key is already revoked by the time this runs, so the credential is dead
/// either way and a failure here only leaves an unused key in AWS.
pub async fn revoke(aws_api_key_id: &str) {
    let client = client().await;
    disable(&client, aws_api_key_id).await;
}
