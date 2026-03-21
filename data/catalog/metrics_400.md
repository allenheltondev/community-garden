# Catalog 400-sample benchmark

- Generated: 2026-03-21T17:15:25.721Z
- Sample size: 400
- Overall: **FAIL**

## Failure summary
- promoted_pct: 0%

## Baseline delta
- none (set BENCHMARK_BASELINE_JSON to compare)

## Distributions

### Match type
- unresolved: 369 (92.25%)
- normalized_scientific: 31 (7.75%)

### Relevance class
- non_food: 399 (99.75%)
- weed_or_invasive: 1 (0.25%)

### Catalog status
- excluded: 400 (100%)

## Queue counts
- promoted: 0 (0%)
- needs_review: 0 (0%)
- excluded: 400 (100%)

## Promotion blockers (diagnostic)
- non_core_status: 400 (100%)\n- not_auto_approved: 400 (100%)\n- no_openfarm_support: 399 (99.75%)\n- low_confidence_band: 399 (99.75%)\n- guardrail_blocked: 2 (0.5%)

## Suspicious sample queue
- flagged: 0 (0%)
- file: ..\..\data\catalog\metrics_400_suspicious.jsonl

## Threshold checks
- promoted_pct: 0% -> FAIL
- needs_review_pct: 0% -> PASS
- suspicious_pct: 0% -> PASS
- fuzzy_match_pct: 0% -> PASS
