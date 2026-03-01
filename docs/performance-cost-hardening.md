# Performance & Cost Hardening (Phase 5)

This document captures baseline load profiles, SLO targets, optimization changes, and cost-envelope assumptions.

## Representative load profiles

### API write/read mix (steady)
- 8 req/s sustained
- 95% read (`GET /discover/listings`, `GET /feed/derived`), 5% write (`POST /requests`, `POST /listings`)
- burst: 5x for 60s

### Worker/event processing
- 5,000 domain events/hour average
- burst: 20,000 events/hour for 15 minutes
- replay mode: bounded windows up to 24h event ranges

## Latency/throughput targets

- `GET /discover/listings` p95 <= 350ms
- `GET /feed/derived` p95 <= 400ms
- `POST /requests` p95 <= 450ms
- `POST /listings` p95 <= 500ms
- Worker event handling p95 <= 10s (alarm threshold aligned)

If targets are missed, create follow-up performance issues with endpoint + query plans.

## Implemented optimizations in this phase

### DB indexes (hot path)
Added migration `0008_perf_cost_hardening.sql`:

1. `idx_surplus_listings_active_geo_created_crop`
   - speeds worker aggregation over active listings by geo prefix/time window/crop
2. `idx_requests_open_geo_created_crop`
   - speeds worker aggregation over open requests by geo prefix/time window/crop
3. `idx_derived_supply_signals_lookup`
   - speeds latest non-expired derived lookups for feed path

## Regression verification

- Existing backend integration/unit tests pass.
- Existing frontend lint/test/build checks pass.
- Staging deploy failures are currently infra-environmental (stack lifecycle/quota), not code-quality failures.

## Monthly cost envelope assumptions (initial)

Assumptions:
- 8 req/s average API traffic
- worker invocations proportional to write events + replay batches
- CloudWatch dashboards/alarms from #19 always-on

Envelope model (to be tuned with real billing data):
- **Target**: low hundreds USD/month in current pre-scale phase
- Primary drivers:
  - Lambda invocation + duration (API + workers)
  - API Gateway requests
  - CloudFront data transfer + requests
  - CloudWatch metrics/log ingestion + retention

## Next tuning opportunities

- Add automated query-plan snapshots for feed/discovery queries in CI perf profile.
- Add k6/Artillery load profile scripts for repeatable pre-release checks.
- Add budget alarms tied to monthly spend threshold.
