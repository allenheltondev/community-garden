use crate::auth::{extract_auth_context, require_grower};
use crate::db;
use crate::models::crop::ErrorResponse;
use crate::models::listing::{ListMyListingsResponse, ListingItem};
use lambda_http::{Body, Request, Response};
use serde::{Deserialize, Serialize};
use tokio_postgres::Row;
use tracing::info;
use uuid::Uuid;

const ALLOWED_LISTING_STATUS: [&str; 3] = ["active", "expired", "completed"];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateListingRequest {
    #[allow(dead_code)]
    pub title: String,
    #[allow(dead_code)]
    pub description: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct ListingResponse {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
}

#[derive(Debug)]
struct ListMyListingsQuery {
    status: Option<String>,
    limit: i64,
    offset: i64,
}

pub async fn list_my_listings(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth_context = extract_auth_context(request)?;
    require_grower(&auth_context)?;

    let user_id = Uuid::parse_str(&auth_context.user_id)
        .map_err(|_| lambda_http::Error::from("Invalid user ID format"))?;
    let query = parse_list_my_listings_query(request.uri().query())?;

    let client = db::connect().await?;
    let fetch_limit = query.limit + 1;

    let rows = if let Some(status) = &query.status {
        client
            .query(
                "
                select id, user_id, grower_crop_id, crop_id, variety_id, title, unit,
                       quantity_total::text as quantity_total,
                       quantity_remaining::text as quantity_remaining,
                       available_start, available_end, status::text,
                       pickup_location_text, pickup_address,
                       pickup_disclosure_policy::text, pickup_notes, contact_pref::text,
                       geo_key, lat, lng, created_at
                from surplus_listings
                where user_id = $1
                  and deleted_at is null
                  and status = $2::listing_status
                order by created_at desc, id desc
                limit $3 offset $4
                ",
                &[&user_id, status, &fetch_limit, &query.offset],
            )
            .await
            .map_err(|error| db_error(&error))?
    } else {
        client
            .query(
                "
                select id, user_id, grower_crop_id, crop_id, variety_id, title, unit,
                       quantity_total::text as quantity_total,
                       quantity_remaining::text as quantity_remaining,
                       available_start, available_end, status::text,
                       pickup_location_text, pickup_address,
                       pickup_disclosure_policy::text, pickup_notes, contact_pref::text,
                       geo_key, lat, lng, created_at
                from surplus_listings
                where user_id = $1
                  and deleted_at is null
                order by created_at desc, id desc
                limit $2 offset $3
                ",
                &[&user_id, &fetch_limit, &query.offset],
            )
            .await
            .map_err(|error| db_error(&error))?
    };

    let has_more = rows.len() as i64 > query.limit;
    let mut items = rows
        .into_iter()
        .take(query.limit as usize)
        .map(|row| row_to_listing_item(&row))
        .collect::<Vec<_>>();

    if has_more && items.len() > query.limit as usize {
        items.truncate(query.limit as usize);
    }

    let response = ListMyListingsResponse {
        items,
        limit: query.limit,
        offset: query.offset,
        has_more,
        next_offset: if has_more {
            Some(query.offset + query.limit)
        } else {
            None
        },
    };

    info!(
        correlation_id = correlation_id,
        user_id = %user_id,
        status_filter = ?query.status,
        limit = query.limit,
        offset = query.offset,
        returned_count = response.items.len(),
        has_more = response.has_more,
        "Listed grower-owned surplus listings"
    );

    json_response(200, &response)
}

pub async fn get_listing(
    request: &Request,
    correlation_id: &str,
    listing_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth_context = extract_auth_context(request)?;
    require_grower(&auth_context)?;

    let user_id = Uuid::parse_str(&auth_context.user_id)
        .map_err(|_| lambda_http::Error::from("Invalid user ID format"))?;
    let id = parse_uuid(listing_id, "listingId")?;

    let client = db::connect().await?;
    let maybe_row = client
        .query_opt(
            "
            select id, user_id, grower_crop_id, crop_id, variety_id, title, unit,
                   quantity_total::text as quantity_total,
                   quantity_remaining::text as quantity_remaining,
                   available_start, available_end, status::text,
                   pickup_location_text, pickup_address,
                   pickup_disclosure_policy::text, pickup_notes, contact_pref::text,
                   geo_key, lat, lng, created_at
            from surplus_listings
            where id = $1
              and user_id = $2
              and deleted_at is null
            ",
            &[&id, &user_id],
        )
        .await
        .map_err(|error| db_error(&error))?;

    if let Some(row) = maybe_row {
        info!(
            correlation_id = correlation_id,
            user_id = %user_id,
            listing_id = %id,
            "Fetched grower-owned listing"
        );
        return json_response(200, &row_to_listing_item(&row));
    }

    error_response(404, "Listing not found")
}

#[allow(clippy::unused_async)]
pub async fn create_listing(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth_context = extract_auth_context(request)?;
    require_grower(&auth_context)?;

    info!(
        correlation_id = correlation_id,
        user_id = auth_context.user_id.as_str(),
        "Creating listing for grower"
    );

    let body = request.body();
    let body_str = match body {
        Body::Text(s) => s.as_str(),
        Body::Binary(b) => std::str::from_utf8(b)
            .map_err(|_| lambda_http::Error::from("Invalid UTF-8 in request body"))?,
        Body::Empty => {
            return error_response(400, "Request body is required");
        }
    };

    let _create_request: CreateListingRequest = serde_json::from_str(body_str)
        .map_err(|e| lambda_http::Error::from(format!("Invalid JSON body: {e}")))?;

    error_response(
        501,
        "Listing creation is not yet implemented. This endpoint enforces authorization only.",
    )
}

fn parse_list_my_listings_query(query: Option<&str>) -> Result<ListMyListingsQuery, lambda_http::Error> {
    let mut status: Option<String> = None;
    let mut limit: i64 = 20;
    let mut offset: i64 = 0;

    if let Some(raw_query) = query {
        for pair in raw_query.split('&') {
            if pair.is_empty() {
                continue;
            }

            let (key, value) = pair.split_once('=').unwrap_or((pair, ""));

            match key {
                "status" => {
                    if !value.is_empty() {
                        if !ALLOWED_LISTING_STATUS.contains(&value) {
                            return Err(lambda_http::Error::from(format!(
                                "Invalid listing status '{}'. Allowed values: {}",
                                value,
                                ALLOWED_LISTING_STATUS.join(", ")
                            )));
                        }
                        status = Some(value.to_string());
                    }
                }
                "limit" => {
                    limit = value
                        .parse::<i64>()
                        .map_err(|_| lambda_http::Error::from("Invalid limit. Must be an integer"))?;
                    if !(1..=100).contains(&limit) {
                        return Err(lambda_http::Error::from(
                            "Invalid limit. Must be between 1 and 100",
                        ));
                    }
                }
                "offset" => {
                    offset = value
                        .parse::<i64>()
                        .map_err(|_| lambda_http::Error::from("Invalid offset. Must be an integer"))?;
                    if offset < 0 {
                        return Err(lambda_http::Error::from(
                            "Invalid offset. Must be greater than or equal to 0",
                        ));
                    }
                }
                _ => {}
            }
        }
    }

    Ok(ListMyListingsQuery {
        status,
        limit,
        offset,
    })
}

fn parse_uuid(value: &str, field_name: &str) -> Result<Uuid, lambda_http::Error> {
    Uuid::parse_str(value)
        .map_err(|_| lambda_http::Error::from(format!("{field_name} must be a valid UUID")))
}

fn row_to_listing_item(row: &Row) -> ListingItem {
    ListingItem {
        id: row.get::<_, Uuid>("id").to_string(),
        user_id: row.get::<_, Uuid>("user_id").to_string(),
        grower_crop_id: row
            .get::<_, Option<Uuid>>("grower_crop_id")
            .map(|id| id.to_string()),
        crop_id: row.get::<_, Uuid>("crop_id").to_string(),
        variety_id: row
            .get::<_, Option<Uuid>>("variety_id")
            .map(|id| id.to_string()),
        title: row.get("title"),
        unit: row.get("unit"),
        quantity_total: row.get("quantity_total"),
        quantity_remaining: row.get("quantity_remaining"),
        available_start: row
            .get::<_, Option<chrono::DateTime<chrono::Utc>>>("available_start")
            .map(|v| v.to_rfc3339()),
        available_end: row
            .get::<_, Option<chrono::DateTime<chrono::Utc>>>("available_end")
            .map(|v| v.to_rfc3339()),
        status: row.get("status"),
        pickup_location_text: row.get("pickup_location_text"),
        pickup_address: row.get("pickup_address"),
        pickup_disclosure_policy: row.get("pickup_disclosure_policy"),
        pickup_notes: row.get("pickup_notes"),
        contact_pref: row.get("contact_pref"),
        geo_key: row.get("geo_key"),
        lat: row.get("lat"),
        lng: row.get("lng"),
        created_at: row
            .get::<_, chrono::DateTime<chrono::Utc>>("created_at")
            .to_rfc3339(),
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

fn error_response(status: u16, message: &str) -> Result<Response<Body>, lambda_http::Error> {
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

    #[test]
    fn test_parse_create_listing_request() {
        let json = r#"{"title":"Fresh Tomatoes","description":"Organic heirloom tomatoes"}"#;
        let request: CreateListingRequest = serde_json::from_str(json).unwrap();
        assert_eq!(request.title, "Fresh Tomatoes");
        assert_eq!(
            request.description,
            Some("Organic heirloom tomatoes".to_string())
        );
    }

    #[test]
    fn test_parse_create_listing_request_minimal() {
        let json = r#"{"title":"Fresh Tomatoes"}"#;
        let request: CreateListingRequest = serde_json::from_str(json).unwrap();
        assert_eq!(request.title, "Fresh Tomatoes");
        assert_eq!(request.description, None);
    }

    #[test]
    fn parse_list_my_listings_query_defaults() {
        let parsed = parse_list_my_listings_query(None).unwrap();
        assert_eq!(parsed.status, None);
        assert_eq!(parsed.limit, 20);
        assert_eq!(parsed.offset, 0);
    }

    #[test]
    fn parse_list_my_listings_query_with_filters() {
        let parsed = parse_list_my_listings_query(Some("status=active&limit=10&offset=20")).unwrap();
        assert_eq!(parsed.status, Some("active".to_string()));
        assert_eq!(parsed.limit, 10);
        assert_eq!(parsed.offset, 20);
    }

    #[test]
    fn parse_list_my_listings_query_rejects_invalid_status() {
        let result = parse_list_my_listings_query(Some("status=pending"));
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Invalid listing status"));
    }

    #[test]
    fn parse_list_my_listings_query_rejects_invalid_limit() {
        let result = parse_list_my_listings_query(Some("limit=0"));
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Invalid limit"));
    }

    #[test]
    fn parse_list_my_listings_query_rejects_invalid_offset() {
        let result = parse_list_my_listings_query(Some("offset=-1"));
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Invalid offset"));
    }
}
