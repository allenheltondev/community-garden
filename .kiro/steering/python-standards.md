---
inclusion: fileMatch
fileMatchPattern: "**/*.py"
---

# Python Implementation Standards

## Language Choice

Python is used for asynchronous event handlers and workers.

## Worker Responsibilities

* **Aggregation worker**: Updates rolling windows such as 7, 14, and 30 days
* **Insight worker**: Produces community-level imbalance signals and summary text
* **AI worker**: Generates explanations and optional grower guidance, then caches results

## Entitlements in Workers

* Workers should treat entitlements as input context when generating derived outputs
* Workers must not grant entitlements
* Workers read user tier/entitlements from event context or query from core table

## Testing Requirements

* Follow Python industry standards for testing (pytest)
* Unit tests for aggregation logic
* Unit tests for event parsing and validation
* Tests should verify idempotency behavior
* Minimize integration tests - those are handled separately

## Idempotency

* Event handlers must be idempotent and safe to replay
* Use DynamoDB conditional writes or unique keys to prevent duplicate processing
* Design handlers to produce the same output given the same input

## Observability

* Use AWS Lambda Powertools for Python for structured logging
* Use structured JSON logs everywhere
* Propagate correlation IDs from events through the entire pipeline
* Include event metadata in all log entries
* Minimize CloudWatch metrics - rely on logs and traces instead
* Use Powertools tracing for X-Ray integration

## AI Integration (Amazon Bedrock)

* Amazon Bedrock is invoked only from workers
* AI outputs are stored in the derived table
* AI outputs must include TTL for cache expiration
* AI must not mutate core transactional records
* Include clear reasoning/explanations with AI outputs
* Handle Bedrock API errors gracefully with retries and fallbacks

## Event Processing

* Subscribe to EventBridge events via Lambda event source
* Parse event envelope consistently
* Validate event schema before processing
* Handle missing or malformed events gracefully
* Use dead-letter queues for failed events

## DynamoDB Access

* Workers have least privilege access to DynamoDB tables
* Write only to the derived table (never mutate core table)
* Use batch operations where appropriate
* Handle throttling with exponential backoff
