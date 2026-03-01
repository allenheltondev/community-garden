# Derived Pipeline Replay Runbook

This runbook describes how to safely replay/backfill derived supply signals.

## Binary

`derived-pipeline-replay` (Rust worker binary)

## Modes

- `REPLAY_MODE=replay` (default)
  - Reprocesses a bounded time range from source-of-truth tables.
- `REPLAY_MODE=backfill`
  - Recomputes across all active listing/request scopes.

## Environment Variables

- `DATABASE_URL` (required)
- `REPLAY_MODE` = `replay|backfill` (default: `replay`)
- `FROM_TS` = RFC3339 timestamp (optional)
- `TO_TS` = RFC3339 timestamp (optional, default: now)
- `DRY_RUN` = `true|false` (optional, default: false)
- `CHECKPOINT_FILE` = local path for replay checkpoint JSON (optional)

## Safety Controls

- **Dry-run support**: `DRY_RUN=true` logs intended recomputes without writing.
- **Checkpoint support**: if `CHECKPOINT_FILE` is set, the worker records the last processed `TO_TS` on success.
- **Idempotent upserts**: derived rows are written through `upsert_derived_supply_signal(...)` to avoid duplicate identities.

## Recommended Procedure

1. Start with a dry run

```bash
REPLAY_MODE=replay \
FROM_TS=2026-02-20T00:00:00Z \
TO_TS=2026-02-21T00:00:00Z \
DRY_RUN=true \
CHECKPOINT_FILE=.replay-checkpoint.json \
cargo run --bin derived-pipeline-replay
```

2. Execute write run

```bash
REPLAY_MODE=replay \
FROM_TS=2026-02-20T00:00:00Z \
TO_TS=2026-02-21T00:00:00Z \
DRY_RUN=false \
CHECKPOINT_FILE=.replay-checkpoint.json \
cargo run --bin derived-pipeline-replay
```

3. Verify
- Compare derived row counts by geo/window before/after.
- Spot-check feed endpoint freshness and guidance outputs for target geos.

## Rollback Strategy

Because writes are idempotent upserts, rollback usually means rerunning with corrected logic/input window.

If hard rollback is needed:
- Restore DB snapshot, or
- Delete/recompute affected `derived_supply_signals` buckets for a bounded time range and rerun replay.

## Audit Notes

Capture for each operation:
- operator
- mode (`replay|backfill`)
- `FROM_TS`, `TO_TS`
- dry-run vs write
- checkpoint file path/value
- verification notes
