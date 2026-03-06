# Badge Evidence Verification Pipeline (v1)

## Objective
Prevent low-effort badge cheating by requiring photo-backed evidence scored with a deterministic trust model.

## Pipeline stages
1. **Ingest**
   - store submission with badge key, user, crop link, photo URL
2. **Signal extraction**
   - EXIF presence/time/location/device metadata
   - hash + perceptual hash duplicate checks
   - AI crop/stage confidence values
3. **Score**
   - compute trust score (0-100)
   - include explainable factor breakdown and penalties
4. **Decision**
   - `>=80`: `auto_approved`
   - `55-79`: `needs_review`
   - `<55`: `rejected`
5. **Audit**
   - save score breakdown and award decision snapshot for disputes/replay

## Data model
- `badge_evidence_submissions`
  - raw metadata + signals + trust score + review state
- `badge_award_audit`
  - immutable badge award snapshots linked to evidence IDs

## Anti-cheat design
- duplicate/near-duplicate penalty
- metadata mismatch penalty
- EXIF-only cannot guarantee approval for high-trust badges
- high-tier badges should require multi-photo timelines (implemented in future badge evaluators)

## Out of scope in this issue
- image upload endpoint
- async worker integration for EXIF/CV processing
- reviewer UI

Those are intentionally split into follow-up issues.
