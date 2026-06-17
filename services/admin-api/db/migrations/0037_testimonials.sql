-- Admin-managed testimonials surfaced on the public foundation site.
-- Written by admin-api, read publicly by web-api from the shared database.
-- Mirrors impact_metrics (0036) so quotes are editable without a deploy.

create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  quote text not null,
  attribution text not null,
  role text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists testimonials_sort_order_idx
  on testimonials (sort_order, created_at);
