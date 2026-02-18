# AGENTS.md

This file guides coding agents to make consistent development decisions in this repository.

## Source of truth

When in doubt, follow these documents in order:
1. `.kiro/steering/product-vision.md`
2. `.kiro/steering/architecture.md`
3. `.kiro/steering/auth-entitlements.md`
4. `.kiro/steering/frontend-standards.md`
5. `.kiro/steering/rust-standards.md`

If guidance conflicts, prefer the more specific document for the file you are changing.

## Decision heuristics

### 1) Preserve architecture boundaries
- Frontend is a PWA client only.
- Rust API owns synchronous transactional writes and reads.
- Workers own async/derived processing and AI output generation.
- AI outputs must only write derived data, never core transactional records.

### 2) Choose the smallest change that fits the phase
- Favor incremental, testable steps over broad refactors.
- Keep changes aligned to roadmap phase goals.
- Avoid introducing speculative abstractions.

### 3) Keep API contracts stable
- Prefer explicit REST endpoints with consistent payloads and status codes.
- Do not break existing request/response shapes without migration notes.
- Prefer adding fields over changing semantics of existing fields.

### 4) Enforce idempotency and replay safety
- Write paths must be idempotent.
- Use conditional writes and deterministic keys where applicable.
- Event handlers and derived pipelines must tolerate retries and replay.

### 5) Correlation ID and observability are mandatory
- Propagate correlation IDs end-to-end.
- Keep logs structured and actionable.
- Log at appropriate levels; avoid noisy logs.

## Frontend standards (TypeScript/PWA)

- Default to mobile-first UX and low-friction flows.
- Handle loading, error, empty, and offline states explicitly.
- Use semantic HTML and accessible interactions.
- Keep bundle impact in mind; lazy-load non-critical UI.
- Include component tests for behavior changes and critical path tests where needed.

### Frontend decision rules
- If backend API is missing for a UI requirement, create/track backend dependency first.
- Keep API integration concerns isolated (services/hooks) from presentational components.
- Prefer clear, human language in UX copy over system jargon.

## Backend standards (Rust API)

- Centralize authorization checks in one module.
- Read tier/entitlements from JWT claims; return 403 for insufficient access.
- Keep handlers thin: validate -> authorize -> execute use-case -> emit event.
- Use consistent error shapes and status codes.
- Emit domain events only after successful state changes.

### Backend decision rules
- Validate inputs early and fail fast.
- Prefer deterministic access patterns aligned with current table design.
- Add/adjust tests next to changed code.

## Auth and entitlement model

- Treat access control as entitlements, not ad-hoc feature flags.
- Never grant entitlements from workers.
- Keep tier labels stable (`free`, `supporter`, `pro`) unless explicitly changed.

## Data and eventing rules

- Core table stores transactional truth.
- Derived table stores computed/AI outputs and should use TTL where appropriate.
- Events are immutable facts; do not encode mutable state snapshots as source of truth.

## Testing expectations

- Add tests for behavior changes, not just happy paths.
- Prioritize tests for auth, validation, idempotency, and state transitions.
- For frontend, cover critical grower/searcher paths with focused tests.

## Non-goals guardrails

- Do not optimize for competitive metrics (leaderboards, production competition).
- Do not add AI features that mutate transactional workflows.
- Do not over-engineer for scale before reliability basics are covered.

## Pull request checklist for agents

Before finishing, confirm:
- Change matches current roadmap phase intent.
- API and auth behavior remain consistent and explicit.
- Correlation IDs/logging are preserved.
- Idempotency/replay behavior is not regressed.
- Tests were added/updated for impacted behavior.
- Documentation or issue dependencies were updated if scope changed.
