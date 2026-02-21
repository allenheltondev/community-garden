use crate::auth::extract_auth_context;
use crate::db;
use crate::location;
use crate::models::feed::{DerivedFeedFreshness, DerivedFeedResponse, DerivedFeedSignal};
use crate::models::listing::ListingItem;
use chrono::{DateTime, Utc};
use lambda_http::{Body, Request, Response};
use serde::Serialize;
use tokio_postgres::Row;
use tracing::info;
use uuid::Uuid;

const DEFAULT_WINDOW_DAYS: i32 = 7;
const SUPPORTED_WINDOWS_DAYS: [i32; 3] = [7, 14, 30];

#[derive(Debug)]
struct DerivedFeedQuery {
    geo_key: String,
    window_days: i32,
    limit: i64,
    offset: i64,
}

pub async fn get_derived_feed(
    request: &Request,
    correlation_id: &str,
) -> Result<Response<Body>, lambda_http::Error> {
    let auth_context = extract_auth_context(request)?;
    let query = parse_derived_feed_query(request.uri().query())?;
    let geo_prefix = derive_geo_prefix(&query.geo_key);
    let geo_pattern = format!("{geo_prefix}%");
    let fetch_limit = query.limit + 1;
    let as_of = Utc::now();

    let client = db::connect().await?;

    let listing_rows = client
        .query(
            "
            select id, user_id, grower_crop_id, crop_id, variety_id, title, unit,
                   quantity_total::text as quantity_total,
                   quantity_remaining::text as quantity_remaining,
                   available_start, available_end, status::text,
                   pickup_location_text, pickup_address, effective_pickup_address,
                   pickup_disclosure_policy::text as pickup_disclosure_policy,
                   pickup_notes, contact_pref::text as contact_pref,
                   geo_key, lat, lng, created_at
            from surplus_listings
            where deleted_at is null
              and status = 'active'
              and geo_key is not null
              and geo_key like $1
            order by created_at desc, id desc
            limit $2 offset $3
            ",
            &[&geo_pattern, &fetch_limit, &query.offset],
        )
        .await
        .map_err(db_error)?;

    let limit = usize::try_from(query.limit)
        .map_err(|_| lambda_http::Error::from("Invalid limit. Must be between 1 and 100"))?;
    let has_more = listing_rows.len() > limit;
    let items = listing_rows
        .into_iter()
        .take(limit)
        .map(|row| row_to_listing_item(&row))
        .collect::<Vec<_>>();

    let fresh_rows = client
        .query(
            "
            select
              geo_boundary_key,
              crop_id,
              window_days::int as window_days,
              listing_count,
              request_count,
              supply_quantity::text as supply_quantity,
              demand_quantity::text as demand_quantity,
              scarcity_score::float8 as scarcity_score,
              abundance_score::float8 as abundance_score,
              computed_at,
              expires_at
            from list_latest_derived_supply_signals($1, $2, 1, 50, $3)
            order by scarcity_score desc, abundance_score desc, geo_boundary_key asc
            ",
            &[&geo_prefix, &query.window_days, &as_of],
        )
        .await
        .map_err(db_error)?;

    let (signal_rows, freshness) = if fresh_rows.is_empty() {
        let fallback_rows = client
            .query(
                "
                select distinct on (geo_boundary_key, crop_scope_id)
                  geo_boundary_key,
                  crop_id,
                  window_days::int as window_days,
                  listing_count,
                  request_count,
                  supply_quantity::text as supply_quantity,
                  demand_quantity::text as demand_quantity,
                  scarcity_score::float8 as scarcity_score,
                  abundance_score::float8 as abundance_score,
                  computed_at,
                  expires_at
                from derived_supply_signals
                where schema_version = 1
                  and window_days = $2
                  and geo_boundary_key like $1
                order by geo_boundary_key, crop_scope_id, computed_at desc, id desc
                limit 50
                ",
                &[&geo_pattern, &query.window_days],
            )
            .await
            .map_err(db_error)?;

        (
            fallback_rows,
            DerivedFeedFreshness {
                as_of: as_of.to_rfc3339(),
                is_stale: true,
                stale_fallback_used: true,
                stale_reason: Some("No non-expired derived signals available for requested scope".to_string()),
            },
        )
    } else {
        (
            fresh_rows,
            DerivedFeedFreshness {
                as_of: as_of.to_rfc3339(),
                is_stale: false,
                stale_fallback_used: false,
                stale_reason: None,
            },
        )
    };

    let signals = signal_rows
        .into_iter()
        .map(|row| row_to_signal(&row))
        .collect::<Vec<_>>();

    let response = DerivedFeedResponse {
        items,
        signals,
        freshness,
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
        user_id = auth_context.user_id.as_str(),
        geo_key = query.geo_key,
        geo_prefix = geo_prefix,
        window_days = query.window_days,
        listing_count = response.items.len(),
        signal_count = response.signals.len(),
        feed_stale = response.freshness.is_stale,
        "Returned derived feed response"
    );

    json_response(200, &response)
}

fn parse_derived_feed_query(query: Option<&str>) -> Result<DerivedFeedQuery, lambda_http::Error> {
    let mut geo_key: Option<String> = None;
    let mut window_days = DEFAULT_WINDOW_DAYS;
    let mut limit: i64 = 20;
    let mut offset: i64 = 0;

    if let Some(raw_query) = query {
        for pair in raw_query.split('&') {
            if pair.is_empty() {
                continue;
            }

            let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
            match key {
                "geoKey" => {
                    let normalized = value.trim().to_ascii_lowercase();
                    if normalized.is_empty() {
                        return Err(lambda_http::Error::from("geoKey is required"));
                    }
                    if !is_valid_geo_key(&normalized) {
                        return Err(lambda_http::Error::from(
                            "geoKey must be a valid geohash (1-12 chars, base32)",
                        ));
                    }
                    geo_key = Some(normalized);
                }
                "windowDays" => {
                    let parsed = value.parse::<i32>().map_err(|_| {
                        lambda_http::Error::from("windowDays must be one of: 7, 14, 30")
                    })?;
                    if !SUPPORTED_WINDOWS_DAYS.contains(&parsed) {
                        return Err(lambda_http::Error::from(
                            "windowDays must be one of: 7, 14, 30",
                        ));
                    }
                    window_days = parsed;
                }
                "limit" => {
                    limit = value.parse::<i64>().map_err(|_| {
                        lambda_http::Error::from("Invalid limit. Must be an integer")
                    })?;
                    if !(1..=100).contains(&limit) {
                        return Err(lambda_http::Error::from(
                            "Invalid limit. Must be between 1 and 100",
                        ));
                    }
                }
                "offset" => {
                    offset = value.parse::<i64>().map_err(|_| {
                        lambda_http::Error::from("Invalid offset. Must be an integer")
                    })?;
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

    let geo_key = geo_key.ok_or_else(|| lambda_http::Error::from("geoKey is required"))?;

    Ok(DerivedFeedQuery {
        geo_key,
        window_days,
        limit,
        offset,
    })
}

fn derive_geo_prefix(geo_key: &str) -> String {
    let prefix_len = 4.min(geo_key.len());
    geo_key[..prefix_len].to_string()
}

fn is_valid_geo_key(value: &str) -> bool {
    if value.is_empty() || value.len() > 12 {
        return false;
    }

    value
        .chars()
        .all(|ch| matches!(ch, '0'..='9' | 'b'..='h' | 'j'..='k' | 'm'..='n' | 'p'..='z'))
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
            .get::<_, Option<DateTime<Utc>>>("available_start")
            .map(|value| value.to_rfc3339()),
        available_end: row
            .get::<_, Option<DateTime<Utc>>>("available_end")
            .map(|value| value.to_rfc3339()),
        status: row.get("status"),
        pickup_location_text: row.get("pickup_location_text"),
        pickup_address: row.get("pickup_address"),
        effective_pickup_address: row.get("effective_pickup_address"),
        pickup_disclosure_policy: row.get("pickup_disclosure_policy"),
        pickup_notes: row.get("pickup_notes"),
        contact_pref: row.get("contact_pref"),
        geo_key: row.get("geo_key"),
        lat: row
            .get::<_, Option<f64>>("lat")
            .map(location::round_for_response),
        lng: row
            .get::<_, Option<f64>>("lng")
            .map(location::round_for_response),
        created_at: row.get::<_, DateTime<Utc>>("created_at").to_rfc3339(),
    }
}

fn row_to_signal(row: &Row) -> DerivedFeedSignal {
    DerivedFeedSignal {
        geo_boundary_key: row.get("geo_boundary_key"),
        crop_id: row.get::<_, Option<Uuid>>("crop_id").map(|id| id.to_string()),
        window_days: row.get("window_days"),
        listing_count: row.get("listing_count"),
        request_count: row.get("request_count"),
        supply_quantity: row.get("supply_quantity"),
        demand_quantity: row.get("demand_quantity"),
        scarcity_score: row.get("scarcity_score"),
        abundance_score: row.get("abundance_score"),
        computed_at: row.get::<_, DateTime<Utc>>("computed_at").to_rfc3339(),
        expires_at: row.get::<_, DateTime<Utc>>("expires_at").to_rfc3339(),
    }
}

fn db_error(error: tokio_postgres::Error) -> lambda_http::Error {
    lambda_http::Error::from(format!("Database query error: {error}"))
}

fn json_response<T: Serialize>(
    status: u16,
    payload: &T,
) -> Result<Response<Body>, lambda_http::Error> {
    let body = serde_json::to_string(payload).map_err(|error| {
        lambda_http::Error::from(format!("Failed to serialize response: {error}"))
    })?;

    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::from(body))
        .map_err(|error| lambda_http::Error::from(error.to_string()))
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn parse_derived_feed_query_defaults() {
        let parsed = parse_derived_feed_query(Some("geoKey=9q8yyk8")).unwrap();
        assert_eq!(parsed.geo_key, "9q8yyk8");
        assert_eq!(parsed.window_days, 7);
        assert_eq!(parsed.limit, 20);
        assert_eq!(parsed.offset, 0);
    }

    #[test]
    fn parse_derived_feed_query_accepts_supported_window() {
        let parsed = parse_derived_feed_query(Some("geoKey=9q8yyk8&windowDays=14")).unwrap();
        assert_eq!(parsed.window_days, 14);
    }

    #[test]
    fn parse_derived_feed_query_rejects_unsupported_window() {
        let result = parse_derived_feed_query(Some("geoKey=9q8yyk8&windowDays=9"));
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("windowDays must be one of: 7, 14, 30"));
    }

    #[test]
    fn parse_derived_feed_query_requires_geo_key() {
        let result = parse_derived_feed_query(Some("windowDays=7"));
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("geoKey is required"));
    }

    #[test]
    fn derive_geo_prefix_uses_4_char_scope() {
        assert_eq!(derive_geo_prefix("9q8yyk8"), "9q8y");
        assert_eq!(derive_geo_prefix("9q8"), "9q8");
    }
}
