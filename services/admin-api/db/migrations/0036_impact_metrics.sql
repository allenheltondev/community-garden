-- Admin-managed impact metrics surfaced on the public foundation site.
-- These are the manually-tracked numbers (e.g. volunteer hours, pounds
-- harvested) that the public StatsRow blends with live Okra map figures.
-- Written by admin-api, read publicly by web-api from the shared database.

create table if not exists impact_metrics (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  value text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists impact_metrics_sort_order_idx
  on impact_metrics (sort_order, created_at);
