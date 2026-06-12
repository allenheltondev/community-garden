-- Public read-only sharing for the garden masterplan. One link per user;
-- revoking keeps the row (so analytics/history survive) and re-sharing
-- mints a fresh token rather than resurrecting the leaked one.

create table if not exists garden_share_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint garden_share_links_user_unique unique (user_id),
  constraint garden_share_links_token_unique unique (token)
);

create index if not exists idx_garden_share_links_token
  on garden_share_links (token)
  where revoked_at is null;
