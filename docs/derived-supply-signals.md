# Derived Supply Signals

This document defines the derived-table model for rolling supply/demand signals used by Phase 3 insights.

## Entity
`derived_supply_signals`

Each row represents an aggregate snapshot for:
- a geo boundary (`geo_boundary_key` geohash prefix)
- a rolling window (`window_days`: 7, 14, 30)
- a time bucket (`bucket_start`)
- an optional crop scope (`crop_id`, null = all crops)
- a model version (`schema_version`)

## Geo-boundary behavior
- Geographic scope is explicit in `geo_boundary_key` and `geo_precision`.
- Boundaries are normalized to lowercase geohash prefixes.
- Reads use prefix matching to support controlled expansion across neighboring cells.

## Versioning and forward compatibility
- `schema_version` is part of the uniqueness key.
- Future signal changes should introduce a new schema version instead of changing semantics in place.

## Write pattern
Workers write through:
- `upsert_derived_supply_signal(...)`

The upsert identity key is:
- `schema_version`
- `geo_boundary_key`
- `window_days`
- `bucket_start`
- `crop_scope_id` (generated from `crop_id`)

This keeps updates idempotent and replay-safe.

## Read pattern
Consumers read through:
- `list_latest_derived_supply_signals(geoPrefix, windowDays, schemaVersion, limit, asOf)`

The function returns the latest non-expired row per boundary and crop scope.

## Cadence and retention
Recommended defaults:
- Update cadence: every 5 minutes for active boundaries.
- TTL/retention:
  - 7-day windows: keep 35 days
  - 14-day windows: keep 49 days
  - 30-day windows: keep 90 days

Expired rows are excluded at read time (`expires_at > asOf`) and should be purged by scheduled cleanup.
