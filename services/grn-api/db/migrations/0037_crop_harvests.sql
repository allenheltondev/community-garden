-- Migration: Track harvests per grower crop
-- Adds a crop_harvests table so growers can log how much they have brought
-- in for each crop in their personal library. This is private bookkeeping
-- and is intentionally separate from surplus_listings (the public sharing
-- feature). The running total per crop is derived by summing amounts.

create table if not exists crop_harvests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  grower_crop_id uuid not null references grower_crop_library(id) on delete cascade,
  amount double precision not null,
  unit text,                                   -- falls back to the crop's default_unit when omitted
  harvested_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),

  constraint crop_harvests_amount_positive check (amount > 0)
);

-- Read path: aggregate and list harvests for one crop, newest first.
create index if not exists idx_crop_harvests_grower_crop
  on crop_harvests(grower_crop_id, harvested_on desc);

-- Owner-scoped lookups.
create index if not exists idx_crop_harvests_user
  on crop_harvests(user_id);
