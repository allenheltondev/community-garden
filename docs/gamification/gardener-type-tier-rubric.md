# Gardener Type Tier Rubric

Defines mutually exclusive gardener identity tiers:

- `novice`
- `intermediate`
- `pro`
- `master`

## Deterministic Scoring Model (0-100)

Weights:

- Crop diversity: 30
- Seasonal consistency: 20
- Successful sharing outcomes: 20
- Photo evidence trust: 15
- Reliability signals: 15

### Inputs

1. **Verified crop diversity**
   - Distinct crops in `grower_crop_library` with status `planning|growing`
2. **Seasonal consistency**
   - Distinct active quarters in last 365 days from `surplus_listings.created_at`
3. **Successful sharing outcomes**
   - Completed claims on the grower’s listings (`claims.status = completed`)
4. **Photo evidence trust score**
   - Average trust score from `badge_evidence_submissions` where status is reviewable
5. **Reliability signal**
   - Completion ratio = completed claims / total claims on grower listings

### Tier thresholds

- `master`: score >= 80
- `pro`: score >= 60
- `intermediate`: score >= 35
- `novice`: score < 35

## Promotion behavior

- Evaluator always computes the highest currently-earned tier.
- Promotion event is written only when tier increases.
- Every decision returns explanation + score breakdown for auditability.
- Profile displays current tier and last promotion timestamp.
