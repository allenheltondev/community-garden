-- Migration: Personal API keys for programmatic access to the GRN API
-- Each key belongs to a user and, when presented, authenticates as that user
-- (same user_type, tier, and entitlements). Only a SHA-256 hash of the key is
-- stored; the plaintext secret is shown to the user exactly once at creation
-- and cannot be recovered. Revocation is a soft delete so history and
-- last_used analytics survive, mirroring garden_share_links.

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  key_prefix text not null,          -- non-secret display prefix, e.g. "grnk_1a2b3c4d"
  key_hash text not null,            -- sha256 hex of the full presented key
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,

  constraint api_keys_name_not_empty check (length(trim(name)) > 0),
  constraint api_keys_key_hash_unique unique (key_hash)
);

-- Owner-scoped listing of active keys.
create index if not exists idx_api_keys_user
  on api_keys(user_id)
  where revoked_at is null;

-- Authorizer hot path: resolve an active key by its hash.
create index if not exists idx_api_keys_hash_active
  on api_keys(key_hash)
  where revoked_at is null;
