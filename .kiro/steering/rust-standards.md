---
inclusion: fileMatch
fileMatchPattern: "**/*.rs"
---

# Rust Implementation Standards

## Language Choice

Rust is used for the synchronous API layer (monolambda behind API Gateway).

## Authorization Module

* The Rust API must include a single authorization module that evaluates required entitlements per route
* Authorization checks should be fast and consistent by reading entitlements from JWT claims
* See `auth-entitlements.md` for the full entitlement model

## Testing Requirements

* Follow Rust industry standards for testing
* Place tests side-by-side with code (in the same file or adjacent `tests` module)
* Unit tests for routing logic
* Unit tests for auth and authorization checks
* Unit tests for validation logic
* Unit tests for DynamoDB access patterns
* Tests should cover idempotency guarantees
* Minimize integration tests - those are handled separately

## Idempotency

* All write endpoints must be idempotent using client-generated IDs where appropriate
* Use DynamoDB conditional writes to enforce idempotency constraints

## Observability

* Use AWS Lambda Powertools for Rust for structured logging
* Use structured JSON logs everywhere
* Propagate correlation IDs from API request to domain events to handlers
* Include request context in all log entries
* Log at appropriate levels (error, warn, info, debug)
* Minimize CloudWatch metrics - rely on logs and traces instead

## API Design

* REST over HTTP API Gateway
* Keep the public API stable and explicit
* Prefer a small number of higher-value endpoints (feeds and summaries) over many chatty endpoints
* Return appropriate HTTP status codes
* Use consistent error response formats

## DynamoDB Access Patterns

* Design access patterns around single-table design principles
* Use composite keys effectively (PK/SK patterns)
* Leverage GSIs for alternate access patterns
* Batch operations where appropriate
* Handle pagination correctly

## Event Emission

* Emit domain events to EventBridge after successful writes
* Include correlation IDs in event payloads
* Use consistent event envelope structure
* Events should be immutable records of what happened
