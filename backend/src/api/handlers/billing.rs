use crate::auth::extract_auth_context;
use crate::db;
use lambda_http::{Body, Request, Response};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::env;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCheckoutSessionRequest {
    pub success_url: String,
    pub cancel_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCheckoutSessionResponse {
    pub checkout_url: String,
    pub checkout_session_id: String,
}

pub async fn create_checkout_session(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth = extract_auth_context(request)?;
    let user_id = Uuid::parse_str(&auth.user_id)
        .map_err(|_| lambda_http::Error::from("Invalid user ID format"))?;
    let payload: CreateCheckoutSessionRequest = parse_json_body(request)?;

    let stripe_secret = env::var("STRIPE_SECRET_KEY")
        .map_err(|_| lambda_http::Error::from("STRIPE_SECRET_KEY is not configured"))?;
    let stripe_price_id = env::var("STRIPE_PREMIUM_PRICE_ID")
        .map_err(|_| lambda_http::Error::from("STRIPE_PREMIUM_PRICE_ID is not configured"))?;

    let mut form = HashMap::new();
    form.insert("mode", "subscription".to_string());
    form.insert("line_items[0][price]", stripe_price_id);
    form.insert("line_items[0][quantity]", "1".to_string());
    form.insert("success_url", payload.success_url);
    form.insert("cancel_url", payload.cancel_url);
    form.insert("metadata[user_id]", user_id.to_string());
    form.insert("subscription_data[metadata][user_id]", user_id.to_string());

    let client = reqwest::Client::new();
    let stripe_resp = client
        .post("https://api.stripe.com/v1/checkout/sessions")
        .basic_auth(stripe_secret, Some(""))
        .form(&form)
        .send()
        .await
        .map_err(|e| lambda_http::Error::from(format!("Stripe request failed: {e}")))?;

    if !stripe_resp.status().is_success() {
        let status = stripe_resp.status();
        let body = stripe_resp.text().await.unwrap_or_default();
        return Err(lambda_http::Error::from(format!(
            "Stripe checkout creation failed ({status}): {body}"
        )));
    }

    let payload: Value = stripe_resp
        .json()
        .await
        .map_err(|e| lambda_http::Error::from(format!("Invalid Stripe response JSON: {e}")))?;

    let checkout_url = payload
        .get("url")
        .and_then(Value::as_str)
        .ok_or_else(|| lambda_http::Error::from("Stripe checkout URL missing"))?;
    let checkout_session_id = payload
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| lambda_http::Error::from("Stripe checkout id missing"))?;

    tracing::info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        checkout_session_id = checkout_session_id,
        "Created Stripe checkout session"
    );

    json_response(
        200,
        &CreateCheckoutSessionResponse {
            checkout_url: checkout_url.to_string(),
            checkout_session_id: checkout_session_id.to_string(),
        },
    )
}

pub async fn handle_webhook(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let event: Value = parse_json_body(request)?;
    let event_type = event
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();

    let object = event
        .get("data")
        .and_then(|d| d.get("object"))
        .ok_or_else(|| lambda_http::Error::from("Stripe event missing data.object"))?;

    let client = db::connect().await?;

    match event_type {
        "checkout.session.completed" => {
            if let Some(user_id) = extract_user_id_from_object(object) {
                let stripe_customer_id = object.get("customer").and_then(Value::as_str);
                let stripe_subscription_id = object.get("subscription").and_then(Value::as_str);

                client
                    .execute(
                        "
                        update users
                           set tier = 'premium',
                               subscription_status = 'active',
                               stripe_customer_id = coalesce($2, stripe_customer_id),
                               stripe_subscription_id = coalesce($3, stripe_subscription_id),
                               updated_at = now()
                         where id = $1 and deleted_at is null
                        ",
                        &[&user_id, &stripe_customer_id, &stripe_subscription_id],
                    )
                    .await
                    .map_err(|e| db_error(&e))?;
            }
        }
        "customer.subscription.deleted" | "customer.subscription.updated" => {
            let stripe_subscription_id = object.get("id").and_then(Value::as_str);
            let status = object
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or("canceled");

            if let Some(subscription_id) = stripe_subscription_id {
                let (tier, sub_status) = map_subscription_status(status);
                client
                    .execute(
                        "
                        update users
                           set tier = $2,
                               subscription_status = $3,
                               updated_at = now()
                         where stripe_subscription_id = $1
                        ",
                        &[&subscription_id, &tier, &sub_status],
                    )
                    .await
                    .map_err(|e| db_error(&e))?;
            }
        }
        _ => {
            tracing::info!(
                correlation_id = correlation_id,
                event_type,
                "Ignoring unsupported Stripe webhook event"
            );
        }
    }

    json_response(200, &serde_json::json!({"received": true}))
}

fn extract_user_id_from_object(object: &Value) -> Option<Uuid> {
    let from_metadata = object
        .get("metadata")
        .and_then(|m| m.get("user_id"))
        .and_then(Value::as_str);

    from_metadata.and_then(|s| Uuid::parse_str(s).ok())
}

fn map_subscription_status(status: &str) -> (&'static str, &'static str) {
    match status {
        "active" | "trialing" => ("premium", "active"),
        "past_due" => ("premium", "past_due"),
        _ => ("free", "canceled"),
    }
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

fn db_error(error: &tokio_postgres::Error) -> lambda_http::Error {
    lambda_http::Error::from(format!("Database query error: {error}"))
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn map_subscription_status_active_maps_to_premium_active() {
        let (tier, status) = map_subscription_status("active");
        assert_eq!(tier, "premium");
        assert_eq!(status, "active");
    }

    #[test]
    fn map_subscription_status_trialing_maps_to_premium_active() {
        let (tier, status) = map_subscription_status("trialing");
        assert_eq!(tier, "premium");
        assert_eq!(status, "active");
    }

    #[test]
    fn map_subscription_status_past_due_maps_to_premium_past_due() {
        let (tier, status) = map_subscription_status("past_due");
        assert_eq!(tier, "premium");
        assert_eq!(status, "past_due");
    }

    #[test]
    fn map_subscription_status_canceled_maps_to_free_canceled() {
        let (tier, status) = map_subscription_status("canceled");
        assert_eq!(tier, "free");
        assert_eq!(status, "canceled");
    }

    #[test]
    fn extract_user_id_from_object_uses_metadata_user_id() {
        let user_id = Uuid::new_v4();
        let payload = json!({
            "metadata": {
                "user_id": user_id.to_string()
            }
        });

        let parsed = extract_user_id_from_object(&payload);
        assert_eq!(parsed, Some(user_id));
    }

    #[test]
    fn extract_user_id_from_object_returns_none_for_missing_or_invalid_values() {
        let missing = json!({});
        let invalid = json!({"metadata": {"user_id": "not-a-uuid"}});

        assert_eq!(extract_user_id_from_object(&missing), None);
        assert_eq!(extract_user_id_from_object(&invalid), None);
    }
}
