use crate::auth::{extract_auth_context, require_grower};
use crate::db;
use crate::models::crop::ErrorResponse;
use aws_config::BehaviorVersion;
use aws_sdk_eventbridge::types::PutEventsRequestEntry;
use chrono::{DateTime, Utc};
use lambda_http::{Body, Request, Response};
use serde::{Deserialize, Serialize};
use tokio_postgres::{Client, Row};
use tracing::info;
use uuid::Uuid;

const ALLOWED_PICKUP_DISCLOSURE_POLICY: [&str; 3] = ["immediate", "after_confirmed", "after_accepted"];
const ALLOWED_CONTACT_PREF: [&str; 3] = ["app_message", "phone", "knock"];
const ALLOWED_LISTING_STATUS: [&str; 5] = ["active", "pending", "claimed", "expired", "completed"];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertListingRequest {
    pub title: String,
    pub crop_id: String,
    pub variety_id: Option<String>,
    pub quantity_total: f64,
    pub unit: String,
    pub available_start: String,
    pub available_end: String,
    pub pickup_location_text: Option<String>,
    pub pickup_address: Option<String>,
    pub pickup_disclosure_policy: Option<String>,
    pub pickup_notes: Option<String>,
    pub contact_pref: Option<String>,
    pub lat: f64,
    pub lng: f64,
    pub status: Option<String>,
}

#[derive(Debug)]
struct NormalizedListingInput {
    crop_id: Uuid,
    variety_id: Option<Uuid>,
    available_start: DateTime<Utc>,
    available_end: DateTime<Utc>,
    pickup_disclosure_policy: String,
    contact_pref: String,
    status: String,
    geo_key: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListingWriteResponse {
    pub id: String,
    pub user_id: String,
    pub crop_id: String,
    pub variety_id: Option<String>,
    pub title: String,
    pub quantity_total: String,
    pub quantity_remaining: String,
    pub unit: String,
    pub available_start: String,
    pub available_end: String,
    pub status: String,
    pub pickup_location_text: Option<String>,
    pub pickup_address: Option<String>,
    pub pickup_disclosure_policy: String,
    pub pickup_notes: Option<String>,
    pub contact_pref: String,
    pub geo_key: String,
    pub lat: f64,
    pub lng: f64,
    pub created_at: String,
}

pub async fn create_listing(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth_context = extract_auth_context(request)?;
    require_grower(&auth_context)?;

    let user_id = Uuid::parse_str(&auth_context.user_id)
        .map_err(|_| lambda_http::Error::from("Invalid user ID format"))?;
    let payload: UpsertListingRequest = parse_json_body(request)?;
    let normalized = normalize_payload(&payload)?;

    let client = db::connect().await?;
    validate_catalog_links(&client, normalized.crop_id, normalized.variety_id).await?;

    let row = client
        .query_one(
            "
            insert into surplus_listings
                (user_id, crop_id, variety_id, title, unit,
                 quantity_total, quantity_remaining,
                 available_start, available_end, status,
                 pickup_location_text, pickup_address, pickup_disclosure_policy, pickup_notes,
                 contact_pref, geo_key, lat, lng)
            values
                ($1, $2, $3, $4, $5,
                 $6, $6,
                 $7, $8, $9::listing_status,
                 $10, $11, $12::pickup_disclosure_policy, $13,
                 $14::contact_preference, $15, $16, $17)
            returning id, user_id, crop_id, variety_id, title,
                      quantity_total::text as quantity_total,
                      quantity_remaining::text as quantity_remaining,
                      unit, available_start, available_end, status::text,
                      pickup_location_text, pickup_address,
                      pickup_disclosure_policy::text as pickup_disclosure_policy,
                      pickup_notes, contact_pref::text as contact_pref,
                      geo_key, lat, lng, created_at
            ",
            &[
                &user_id,
                &normalized.crop_id,
                &normalized.variety_id,
                &payload.title,
                &payload.unit,
                &payload.quantity_total,
                &normalized.available_start,
                &normalized.available_end,
                &normalized.status,
                &payload.pickup_location_text,
                &payload.pickup_address,
                &normalized.pickup_disclosure_policy,
                &payload.pickup_notes,
                &normalized.contact_pref,
                &normalized.geo_key,
                &payload.lat,
                &payload.lng,
            ],
        )
        .await
        .map_err(|error| db_error(&error))?;

    emit_listing_event("listing.created", &row, correlation_id).await?;

    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        listing_id = %row.get::<_, Uuid>("id"),
        "Created surplus listing"
    );

    json_response(201, &row_to_write_response(&row))
}

pub async fn update_listing(
    request: &Request,
    correlation_id: &str,
    listing_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth_context = extract_auth_context(request)?;
    require_grower(&auth_context)?;

    let user_id = Uuid::parse_str(&auth_context.user_id)
        .map_err(|_| lambda_http::Error::from("Invalid user ID format"))?;
    let id = parse_uuid(listing_id, "listingId")?;

    let payload: UpsertListingRequest = parse_json_body(request)?;
    let normalized = normalize_payload(&payload)?;

    let client = db::connect().await?;
    validate_catalog_links(&client, normalized.crop_id, normalized.variety_id).await?;

    let maybe_row = client
        .query_opt(
            "
            update surplus_listings
            set crop_id = $1,
                variety_id = $2,
                title = $3,
                unit = $4,
                quantity_total = $5,
                quantity_remaining = $5,
                available_start = $6,
                available_end = $7,
                status = $8::listing_status,
                pickup_location_text = $9,
                pickup_address = $10,
                pickup_disclosure_policy = $11::pickup_disclosure_policy,
                pickup_notes = $12,
                contact_pref = $13::contact_preference,
                geo_key = $14,
                lat = $15,
                lng = $16
            where id = $17
              and user_id = $18
              and deleted_at is null
            returning id, user_id, crop_id, variety_id, title,
                      quantity_total::text as quantity_total,
                      quantity_remaining::text as quantity_remaining,
                      unit, available_start, available_end, status::text,
                      pickup_location_text, pickup_address,
                      pickup_disclosure_policy::text as pickup_disclosure_policy,
                      pickup_notes, contact_pref::text as contact_pref,
                      geo_key, lat, lng, created_at
            ",
            &[
                &normalized.crop_id,
                &normalized.variety_id,
                &payload.title,
                &payload.unit,
                &payload.quantity_total,
                &normalized.available_start,
                &normalized.available_end,
                &normalized.status,
                &payload.pickup_location_text,
                &payload.pickup_address,
                &normalized.pickup_disclosure_policy,
                &payload.pickup_notes,
                &normalized.contact_pref,
                &normalized.geo_key,
                &payload.lat,
                &payload.lng,
                &id,
                &user_id,
            ],
        )
        .await
        .map_err(|error| db_error(&error))?;

    if let Some(row) = maybe_row {
        emit_listing_event("listing.updated", &row, correlation_id).await?;

        info!(
            correlation_id = correlation_id,
            user_id = %user_id,
            listing_id = %id,
            "Updated surplus listing"
        );

        return json_response(200, &row_to_write_response(&row));
    }

    error_response(404, "Listing not found")
}

fn normalize_payload(payload: &UpsertListingRequest) -> Result<NormalizedListingInput, lambda_http::Error> {
    if payload.title.trim().is_empty() {
        return Err(lambda_http::Error::from("title is required"));
    }

    if payload.unit.trim().is_empty() {
        return Err(lambda_http::Error::from("unit is required"));
    }

    if payload.quantity_total <= 0.0 {
        return Err(lambda_http::Error::from(
            "quantityTotal must be greater than 0",
        ));
    }

    if payload.lat < -90.0 || payload.lat > 90.0 {
        return Err(lambda_http::Error::from("lat must be between -90 and 90"));
    }

    if payload.lng < -180.0 || payload.lng > 180.0 {
        return Err(lambda_http::Error::from("lng must be between -180 and 180"));
    }

    let available_start = parse_datetime(&payload.available_start, "availableStart")?;
    let available_end = parse_datetime(&payload.available_end, "availableEnd")?;

    if available_start > available_end {
        return Err(lambda_http::Error::from(
            "availableStart must be earlier than or equal to availableEnd",
        ));
    }

    let pickup_disclosure_policy = payload
        .pickup_disclosure_policy
        .clone()
        .unwrap_or_else(|| "after_confirmed".to_string());
    if !ALLOWED_PICKUP_DISCLOSURE_POLICY.contains(&pickup_disclosure_policy.as_str()) {
        return Err(lambda_http::Error::from(format!(
            "Invalid pickupDisclosurePolicy '{}'. Allowed values: {}",
            pickup_disclosure_policy,
            ALLOWED_PICKUP_DISCLOSURE_POLICY.join(", ")
        )));
    }

    let contact_pref = payload
        .contact_pref
        .clone()
        .unwrap_or_else(|| "app_message".to_string());
    if !ALLOWED_CONTACT_PREF.contains(&contact_pref.as_str()) {
        return Err(lambda_http::Error::from(format!(
            "Invalid contactPref '{}'. Allowed values: {}",
            contact_pref,
            ALLOWED_CONTACT_PREF.join(", ")
        )));
    }

    let status = payload
        .status
        .clone()
        .unwrap_or_else(|| "active".to_string());
    if !ALLOWED_LISTING_STATUS.contains(&status.as_str()) {
        return Err(lambda_http::Error::from(format!(
            "Invalid status '{}'. Allowed values: {}",
            status,
            ALLOWED_LISTING_STATUS.join(", ")
        )));
    }

    let crop_id = parse_uuid(&payload.crop_id, "crop_id")?;
    let variety_id = parse_optional_uuid(payload.variety_id.as_deref(), "variety_id")?;
    let geo_key = calculate_geohash(payload.lat, payload.lng);

    Ok(NormalizedListingInput {
        crop_id,
        variety_id,
        available_start,
        available_end,
        pickup_disclosure_policy,
        contact_pref,
        status,
        geo_key,
    })
}

async fn validate_catalog_links(
    client: &Client,
    crop_id: Uuid,
    variety_id: Option<Uuid>,
) -> Result<(), lambda_http::Error> {
    let crop_exists = client
        .query_one(
            "select exists(select 1 from crops where id = $1)",
            &[&crop_id],
        )
        .await
        .map_err(|error| db_error(&error))?
        .get::<_, bool>(0);

    if !crop_exists {
        return Err(lambda_http::Error::from(
            "crop_id does not reference an existing catalog crop".to_string(),
        ));
    }

    if let Some(variety) = variety_id {
        let matches = client
            .query_one(
                "select exists(select 1 from crop_varieties where id = $1 and crop_id = $2)",
                &[&variety, &crop_id],
            )
            .await
            .map_err(|error| db_error(&error))?
            .get::<_, bool>(0);

        if !matches {
            return Err(lambda_http::Error::from(
                "variety_id must belong to the specified crop_id".to_string(),
            ));
        }
    }

    Ok(())
}

async fn emit_listing_event(
    detail_type: &str,
    listing_row: &Row,
    correlation_id: &str,
) -> Result<(), lambda_http::Error> {
    let event_bus_name = std::env::var("EVENT_BUS_NAME").unwrap_or_else(|_| "default".to_string());

    let detail = serde_json::json!({
        "listingId": listing_row.get::<_, Uuid>("id").to_string(),
        "userId": listing_row.get::<_, Uuid>("user_id").to_string(),
        "status": listing_row.get::<_, String>("status"),
        "correlationId": correlation_id,
        "occurredAt": Utc::now().to_rfc3339(),
    });

    let config = aws_config::defaults(BehaviorVersion::latest()).load().await;
    let client = aws_sdk_eventbridge::Client::new(&config);

    let entry = PutEventsRequestEntry::builder()
        .event_bus_name(event_bus_name)
        .source("community-garden.api")
        .detail_type(detail_type)
        .detail(detail.to_string())
        .build()
        .map_err(|e| lambda_http::Error::from(format!("Failed to build event entry: {e}")))?;

    let response = client
        .put_events()
        .entries(entry)
        .send()
        .await
        .map_err(|e| lambda_http::Error::from(format!("Failed to emit listing event: {e}")))?;

    if response.failed_entry_count().unwrap_or(0) > 0 {
        return Err(lambda_http::Error::from(
            "Failed to emit listing event: one or more entries were rejected",
        ));
    }

    Ok(())
}

fn parse_datetime(value: &str, field_name: &str) -> Result<DateTime<Utc>, lambda_http::Error> {
    let parsed = DateTime::parse_from_rfc3339(value).map_err(|_| {
        lambda_http::Error::from(format!("{field_name} must be a valid RFC3339 timestamp"))
    })?;
    Ok(parsed.with_timezone(&Utc))
}

fn parse_uuid(value: &str, field_name: &str) -> Result<Uuid, lambda_http::Error> {
    Uuid::parse_str(value)
        .map_err(|_| lambda_http::Error::from(format!("{field_name} must be a valid UUID")))
}

fn parse_optional_uuid(
    value: Option<&str>,
    field_name: &str,
) -> Result<Option<Uuid>, lambda_http::Error> {
    value.map_or(Ok(None), |v| parse_uuid(v, field_name).map(Some))
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

fn calculate_geohash(lat: f64, lng: f64) -> String {
    geohash::encode(geohash::Coord { x: lng, y: lat }, 7)
        .unwrap_or_else(|_| String::from(""))
}

fn row_to_write_response(row: &Row) -> ListingWriteResponse {
    ListingWriteResponse {
        id: row.get::<_, Uuid>("id").to_string(),
        user_id: row.get::<_, Uuid>("user_id").to_string(),
        crop_id: row.get::<_, Uuid>("crop_id").to_string(),
        variety_id: row.get::<_, Option<Uuid>>("variety_id").map(|v| v.to_string()),
        title: row.get("title"),
        quantity_total: row.get("quantity_total"),
        quantity_remaining: row.get("quantity_remaining"),
        unit: row.get("unit"),
        available_start: row
            .get::<_, DateTime<Utc>>("available_start")
            .to_rfc3339(),
        available_end: row
            .get::<_, DateTime<Utc>>("available_end")
            .to_rfc3339(),
        status: row.get("status"),
        pickup_location_text: row.get("pickup_location_text"),
        pickup_address: row.get("pickup_address"),
        pickup_disclosure_policy: row.get("pickup_disclosure_policy"),
        pickup_notes: row.get("pickup_notes"),
        contact_pref: row.get("contact_pref"),
        geo_key: row.get("geo_key"),
        lat: row.get("lat"),
        lng: row.get("lng"),
        created_at: row.get::<_, DateTime<Utc>>("created_at").to_rfc3339(),
    }
}

fn db_error(error: &tokio_postgres::Error) -> lambda_http::Error {
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

pub fn error_response(status: u16, message: &str) -> Result<Response<Body>, lambda_http::Error> {
    json_response(
        status,
        &ErrorResponse {
            error: message.to_string(),
        },
    )
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    fn valid_payload() -> UpsertListingRequest {
        UpsertListingRequest {
            title: "Fresh Tomatoes".to_string(),
            crop_id: "5df666d4-f6b1-4e6f-97d6-321e531ad7ca".to_string(),
            variety_id: None,
            quantity_total: 12.5,
            unit: "lb".to_string(),
            available_start: "2026-02-20T10:00:00Z".to_string(),
            available_end: "2026-02-20T18:00:00Z".to_string(),
            pickup_location_text: Some("Front porch".to_string()),
            pickup_address: None,
            pickup_disclosure_policy: Some("after_confirmed".to_string()),
            pickup_notes: None,
            contact_pref: Some("app_message".to_string()),
            lat: 37.7749,
            lng: -122.4194,
            status: Some("active".to_string()),
        }
    }

    #[test]
    fn normalize_payload_accepts_valid_input() {
        let payload = valid_payload();
        let normalized = normalize_payload(&payload).unwrap();
        assert_eq!(normalized.status, "active");
        assert_eq!(normalized.pickup_disclosure_policy, "after_confirmed");
        assert_eq!(normalized.contact_pref, "app_message");
        assert_eq!(normalized.geo_key.len(), 7);
    }

    #[test]
    fn normalize_payload_rejects_invalid_window() {
        let mut payload = valid_payload();
        payload.available_start = "2026-02-21T10:00:00Z".to_string();
        payload.available_end = "2026-02-20T10:00:00Z".to_string();
        let result = normalize_payload(&payload);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("availableStart"));
    }

    #[test]
    fn normalize_payload_rejects_invalid_lat() {
        let mut payload = valid_payload();
        payload.lat = 91.0;
        let result = normalize_payload(&payload);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("lat must be"));
    }

    #[test]
    fn normalize_payload_rejects_invalid_lng() {
        let mut payload = valid_payload();
        payload.lng = -181.0;
        let result = normalize_payload(&payload);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("lng must be"));
    }

    #[test]
    fn normalize_payload_rejects_invalid_pickup_disclosure_policy() {
        let mut payload = valid_payload();
        payload.pickup_disclosure_policy = Some("always".to_string());
        let result = normalize_payload(&payload);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Invalid pickupDisclosurePolicy"));
    }

    #[test]
    fn normalize_payload_rejects_invalid_contact_pref() {
        let mut payload = valid_payload();
        payload.contact_pref = Some("carrier_pigeon".to_string());
        let result = normalize_payload(&payload);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Invalid contactPref"));
    }
}
