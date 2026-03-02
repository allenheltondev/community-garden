# Bedrock Nova Model Config + Structured JSON Contract

This doc standardizes model selection and structured JSON behavior for premium AI features.

## Environment configuration

- `AI_PROVIDER` (default: `bedrock`)
- `BEDROCK_MODEL_PRIMARY` (default: `amazon.nova-lite-v1:0`)
- `BEDROCK_MODEL_FALLBACK` (default: `amazon.nova-micro-v1:0`)
- `BEDROCK_REGION` (fallback: `AWS_REGION`, default `us-east-1`)
- `AI_RESPONSE_MODE` (default: `structured_json`)
- `AI_RESPONSE_SCHEMA_VERSION` (default: `v1`)

## Contract goals

- All premium AI endpoints return schema-shaped JSON objects.
- Model ID and response mode/version are emitted in responses.
- Feature handlers must gracefully fallback/degrade if AI generation fails.

## Current endpoints aligned

- `POST /ai/copilot/weekly-plan`
- Derived feed AI summary metadata path

## Error/fallback behavior

- Entitlement failure: `403 feature_locked`
- Guardrail cap exceeded: `429` with reason key
- AI generation failure: deterministic fallback response where applicable
