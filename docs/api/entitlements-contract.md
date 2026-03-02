# Entitlements API Contract (v1)

## Purpose
Provide a single backend contract for entitlement checks used by frontend and API handlers.

## Response shape

`GET /me/entitlements`

```json
{
  "tier": "free",
  "entitlementsVersion": "v1",
  "entitlements": [
    "core.discovery",
    "core.listings.write",
    "reminders.deterministic.schedule"
  ],
  "policy": {
    "aiIsPremiumOnly": true,
    "freeRemindersDeterministicOnly": true
  }
}
```

## Backend check contract

Pseudo-signature:

```text
require_entitlement(user_id, entitlement_key) -> Ok | EntitlementDenied
```

Denied response (recommended):

```json
{
  "error": "feature_locked",
  "entitlementKey": "ai.feed_insights.read",
  "requiredTier": "premium",
  "upgradeHintKey": "upgrade.premium"
}
```

## Enforcement notes

- All AI endpoints must enforce premium entitlements.
- Reminder endpoints must enforce deterministic-only behavior for free-tier paths.
- Frontend can pre-check via `/me/entitlements`, but backend remains source of truth.
