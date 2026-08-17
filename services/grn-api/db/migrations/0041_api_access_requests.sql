-- Migration: approval-gated API access
--
-- Personal API keys (migration 0038) are self-serve: any grower can mint one.
-- Integration access now goes through a request an admin approves, so we can
-- see who is building against the API before handing out a credential, and so
-- issuing one can also provision an API Gateway key and attach it to a usage
-- plan for throttling and quota.
--
-- The API Gateway side is deliberately invisible to the grower: they hold one
-- GRN key, and the authorizer meters them on the usage plan on their behalf.
-- The API Gateway key's value is the SHA-256 of the GRN key — the hash already
-- stored in key_hash — so the authorizer derives the usage identifier from the
-- presented token with no lookup, and nothing new is kept at rest. The columns
-- added below hold identifiers only, so a key can be disabled and detached
-- from its plan when the GRN key is revoked.

create table if not exists api_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending',
  integration_name text not null,
  intended_use text not null,
  contact_email text,
  decided_at timestamptz,
  decided_by uuid references users(id) on delete set null,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint api_access_requests_status_valid
    check (status in ('pending', 'approved', 'denied')),
  constraint api_access_requests_integration_name_not_empty
    check (length(trim(integration_name)) > 0),
  constraint api_access_requests_intended_use_not_empty
    check (length(trim(intended_use)) > 0),
  -- A decided request must record when it was decided, and a pending one must
  -- not: the admin queue and the "your request is still open" state in GRN
  -- both read this rather than inferring from nullable columns.
  constraint api_access_requests_decision_consistent
    check (
      (status = 'pending' and decided_at is null)
      or (status in ('approved', 'denied') and decided_at is not null)
    )
);

-- One open request per grower. Re-requesting while a decision is outstanding
-- would give the admin queue duplicates to reconcile; approved and denied rows
-- stay unconstrained so a grower can ask again later.
create unique index if not exists idx_api_access_requests_one_pending
  on api_access_requests(user_id)
  where status = 'pending';

-- Admin queue: oldest pending first.
create index if not exists idx_api_access_requests_pending
  on api_access_requests(created_at)
  where status = 'pending';

-- Grower's own history.
create index if not exists idx_api_access_requests_user
  on api_access_requests(user_id, created_at desc);

-- Link an issued key back to the request that authorised it, and record the
-- API Gateway identifiers so the key can be disabled and detached from its
-- usage plan when the GRN key is revoked.
alter table api_keys
  add column if not exists access_request_id uuid references api_access_requests(id) on delete set null,
  add column if not exists aws_api_key_id text,
  add column if not exists usage_plan_id text;

-- An API Gateway key backs at most one GRN key, so a partially failed
-- provisioning run cannot be retried into two rows pointing at the same key.
create unique index if not exists idx_api_keys_aws_api_key_id
  on api_keys(aws_api_key_id)
  where aws_api_key_id is not null;

create index if not exists idx_api_keys_access_request
  on api_keys(access_request_id)
  where access_request_id is not null;
