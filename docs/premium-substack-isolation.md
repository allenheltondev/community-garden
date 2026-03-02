# Premium Sub-Stack Isolation (Issue #78)

## Decision
Use a **nested premium stack** to isolate premium-only resources from core GRN resources.

## Why
- Reduces blast radius: premium deployment failures should not block core stack changes.
- Enables independent scaling and cost attribution for premium workloads.
- Creates a clean path for stricter IAM boundaries around premium AI/agent resources.

## Initial implementation
Main stack (`backend/template.yaml`) now supports:
- `PremiumStackEnabled` parameter (`true|false`, default `false`)
- `DeployPremiumStack` condition
- conditional nested stack resource: `PremiumFeatureStack`

Nested template:
- `backend/infra/premium/template.yaml`

Initial premium resources in nested stack:
- `PremiumAgentTaskQueue` (SQS)
- `PremiumAgentTaskDlq` (SQS dead-letter queue)
- `PremiumEventArchive` (EventBridge archive)

## Operational model
- Core stack deploys as usual when `PremiumStackEnabled=false`.
- Premium resources deploy only when explicitly enabled.
- Premium stack can be toggled per environment.

## Next steps
1. Move premium AI/agent execution resources to nested stack.
2. Route premium handlers to queue-driven execution.
3. Add IAM boundary policies scoped to premium resources.
4. Add stack-level cost tags and billing report filters.
