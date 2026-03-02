use crate::models::entitlements::{
    EntitlementsPolicy, EntitlementsResponse, FeatureLockedErrorResponse,
};
use tokio_postgres::Client;
use uuid::Uuid;

const ENTITLEMENTS_VERSION: &str = "v1";

const FREE_ENTITLEMENTS: &[&str] = &[
    "core.discovery",
    "core.listings.write",
    "core.requests.write",
    "core.claims.write",
    "core.derived_feed.read",
    "reminders.deterministic.schedule",
    "reminders.deterministic.manage",
];

const PREMIUM_ONLY_ENTITLEMENTS: &[&str] = &[
    "ai.copilot.weekly_grow_plan",
    "ai.feed_insights.read",
    "agent.tasks.automation",
    "premium.analytics.read",
];

#[allow(dead_code)]
pub struct FeatureLockedError {
    pub entitlement_key: String,
}

#[allow(dead_code)]
impl FeatureLockedError {
    pub fn to_response(&self) -> FeatureLockedErrorResponse {
        FeatureLockedErrorResponse {
            error: "feature_locked".to_string(),
            entitlement_key: self.entitlement_key.clone(),
            required_tier: "premium".to_string(),
            upgrade_hint_key: "upgrade.premium".to_string(),
        }
    }
}

pub async fn get_entitlements_snapshot(
    client: &Client,
    user_id: Uuid,
) -> Result<EntitlementsResponse, lambda_http::Error> {
    let tier = load_user_tier(client, user_id).await?;
    let mut keys: Vec<String> = FREE_ENTITLEMENTS.iter().map(|k| (*k).to_string()).collect();

    if tier == "premium" {
        keys.extend(PREMIUM_ONLY_ENTITLEMENTS.iter().map(|k| (*k).to_string()));
    }

    Ok(EntitlementsResponse {
        tier,
        entitlements_version: ENTITLEMENTS_VERSION.to_string(),
        entitlements: keys,
        policy: EntitlementsPolicy {
            ai_is_premium_only: true,
            free_reminders_deterministic_only: true,
        },
    })
}

pub async fn require_entitlement(
    client: &Client,
    user_id: Uuid,
    entitlement_key: &str,
) -> Result<(), FeatureLockedError> {
    let snapshot = get_entitlements_snapshot(client, user_id)
        .await
        .map_err(|_| FeatureLockedError {
            entitlement_key: entitlement_key.to_string(),
        })?;

    if snapshot
        .entitlements
        .iter()
        .any(|key| key == entitlement_key)
    {
        Ok(())
    } else {
        Err(FeatureLockedError {
            entitlement_key: entitlement_key.to_string(),
        })
    }
}

async fn load_user_tier(client: &Client, user_id: Uuid) -> Result<String, lambda_http::Error> {
    let row = client
        .query_opt(
            "select tier from users where id = $1 and deleted_at is null",
            &[&user_id],
        )
        .await
        .map_err(|e| lambda_http::Error::from(format!("Database query error: {e}")))?;

    Ok(row
        .and_then(|r| r.get::<_, Option<String>>("tier"))
        .unwrap_or_else(|| "free".to_string()))
}
