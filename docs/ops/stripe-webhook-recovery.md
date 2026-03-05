# Stripe Webhook Recovery Runbook

## Purpose
Recover safely when Stripe webhook delivery fails, arrives out of order, or requires manual replay.

## Ground rules
- Webhook endpoint is idempotent by `event.id` via `stripe_webhook_events`.
- Duplicate events are safe no-ops.
- User subscription updates are guarded by `stripe_last_event_created` to prevent stale events from overwriting newer state.

## Primary tables
- `stripe_webhook_events` — processed event IDs for idempotency
- `stripe_webhook_failures` — failed processing payloads + reasons
- `users` — source-of-truth account tier + subscription status

## Triage checklist
1. Confirm Stripe endpoint health in dashboard (delivery success/error rates).
2. Inspect latest failures:
   - `select * from stripe_webhook_failures order by created_at desc limit 50;`
3. Verify impacted users:
   - `select id, tier, subscription_status, stripe_subscription_id, stripe_last_event_created from users where stripe_subscription_id = '<sub_id>';`
4. Cross-check Stripe event ordering (`created` values).

## Replay procedure
1. Identify failed `event_id` from `stripe_webhook_failures`.
2. Replay from Stripe dashboard (preferred) or Stripe CLI in test mode.
3. Confirm event appears in `stripe_webhook_events`.
4. Confirm `users` state is updated as expected.

## Manual correction (last resort)
Use only when Stripe replay is not possible.
- Update `users.tier`, `subscription_status`, and `premium_expires_at` from authoritative Stripe data.
- Set `stripe_last_event_created` to the authoritative latest event timestamp.
- Record the action in incident notes.

## Expected mappings
- `active`, `trialing` -> `tier=premium`, `subscription_status=active`
- `past_due` -> `tier=premium`, `subscription_status=past_due`
- `incomplete`, `incomplete_expired` -> `tier=free`, `subscription_status=none`
- `canceled`, `unpaid` (and unknown defaults) -> `tier=free`, `subscription_status=canceled`

## Verification after recovery
- New duplicate deliveries should return `{"received": true, "duplicate": true}`.
- New stale/out-of-order events should not regress `users` state.
- Contract + E2E checks should pass except known temporary suite instability.
