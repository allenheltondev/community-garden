use serde::{Deserialize, Serialize};

/// A grower asking for programmatic access. Approval is what mints a key, so
/// this carries enough for an admin to make that call without a follow-up
/// conversation.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateApiAccessRequest {
    /// What they are building — shown in the admin queue and in Slack.
    pub integration_name: String,
    /// Why they need access.
    pub intended_use: String,
    /// Optional contact address if different from the account email.
    #[serde(default)]
    pub contact_email: Option<String>,
}

/// An admin's decision on a request.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecideApiAccessRequest {
    /// Optional note recorded with the decision.
    #[serde(default)]
    pub note: Option<String>,
}

/// A request as its owner sees it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiAccessRequestItem {
    pub id: String,
    pub status: String,
    pub integration_name: String,
    pub intended_use: String,
    pub contact_email: Option<String>,
    pub decision_note: Option<String>,
    pub decided_at: Option<String>,
    pub created_at: String,
    /// Set once a key has been issued for this request, so the owner can find
    /// it in their key list. The secret itself is never included here.
    pub api_key_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiAccessRequestListResponse {
    pub items: Vec<ApiAccessRequestItem>,
}

/// A queued request as an admin sees it: the same record plus who is asking,
/// so the decision does not need a second lookup.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminApiAccessRequestItem {
    pub id: String,
    pub status: String,
    pub integration_name: String,
    pub intended_use: String,
    pub contact_email: Option<String>,
    pub decision_note: Option<String>,
    pub decided_at: Option<String>,
    pub created_at: String,
    pub user_id: String,
    pub user_email: Option<String>,
    pub user_display_name: Option<String>,
    /// The requester's tier, so an admin can weigh the ask.
    pub user_tier: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminApiAccessRequestListResponse {
    pub items: Vec<AdminApiAccessRequestItem>,
    pub total: i64,
}

/// Returned to the admin after an approval. The key secret goes to the
/// requester through their own key list, never through the admin console.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiAccessDecisionResponse {
    pub id: String,
    pub status: String,
    pub api_key_id: Option<String>,
    pub decided_at: String,
}
