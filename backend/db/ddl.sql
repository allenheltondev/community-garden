-- ============================
-- Extensions
-- ============================
create extension if not exists pgcrypto; -- gen_random_uuid()
create extension if not exists citext;

-- ============================
-- Enums
-- ============================
do $$ begin
  create type units_system as enum ('imperial', 'metric');
exception when duplicate_object then null; end $$;

do $$ begin
  create type visibility_scope as enum ('private', 'local', 'public');
exception when duplicate_object then null; end $$;

do $$ begin
  create type grower_crop_status as enum ('interested', 'planning', 'growing', 'paused');
exception when duplicate_object then null; end $$;

do $$ begin
  create type listing_status as enum ('active', 'pending', 'claimed', 'expired', 'completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type request_status as enum ('open', 'matched', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type claim_status as enum ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
exception when duplicate_object then null; end $$;

do $$ begin
  create type contact_preference as enum ('app_message', 'phone', 'knock');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pickup_disclosure_policy as enum ('immediate', 'after_confirmed', 'after_accepted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rating_context as enum ('as_giver', 'as_receiver');
exception when duplicate_object then null; end $$;

do $$ begin
  create type report_reason as enum ('spam', 'inappropriate', 'safety_concern', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type report_status as enum ('pending', 'reviewed', 'resolved');
exception when duplicate_object then null; end $$;

-- Units for listings/requests: keep flexible as text for now.
-- If you want strictness, switch to enum later.
-- create type quantity_unit as enum ('bunch','lb','bag','each','unspecified');

-- ============================
-- Timestamp helper (optional)
-- ============================
-- You can add triggers later to maintain updated_at; starting simple here.

-- ============================
-- USERS
-- ============================
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email citext unique,
  display_name text,
  is_verified boolean not null default false,
  user_type text check (user_type in ('grower', 'gatherer')),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_users_deleted_at on users(deleted_at);
create index if not exists idx_users_user_type on users(user_type) where user_type is not null;

-- Cached rating summary (derived, but stored)
create table if not exists user_rating_summary (
  user_id uuid primary key references users(id) on delete cascade,
  avg_score numeric(3,2) not null default 0.00,
  rating_count integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint user_rating_summary_nonneg check (rating_count >= 0),
  constraint user_rating_summary_avg_range check (avg_score >= 0 and avg_score <= 5)
);

-- ============================
-- GROWER PROFILES
-- ============================
create table if not exists grower_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  home_zone text, -- e.g. "8a"
  geo_key text,   -- geohash
  lat double precision,
  lng double precision,
  share_radius_km numeric(8,3) not null default 5.000,
  units units_system not null default 'imperial',
  locale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grower_profiles_radius_positive check (share_radius_km > 0),
  constraint grower_profiles_lat_lng_pair check (
    (lat is null and lng is null) or (lat is not null and lng is not null)
  )
);

create index if not exists idx_grower_profiles_geo_key on grower_profiles(geo_key);

-- ============================
-- GATHERER PROFILES
-- ============================
create table if not exists gatherer_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  geo_key text not null,
  lat double precision not null,
  lng double precision not null,
  search_radius_km numeric(8,3) not null default 10.000,
  organization_affiliation text,
  units units_system not null default 'imperial',
  locale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint gatherer_profiles_radius_positive check (search_radius_km > 0),
  constraint gatherer_profiles_lat_range check (lat >= -90 and lat <= 90),
  constraint gatherer_profiles_lng_range check (lng >= -180 and lng <= 180)
);

create index if not exists idx_gatherer_profiles_geo_key on gatherer_profiles(geo_key);

-- ============================
-- CROP KNOWLEDGE BASE
-- ============================
create table if not exists crops (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,         -- "tomato"
  common_name text not null,         -- "Tomato"
  scientific_name text,
  category text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists crop_varieties (
  id uuid primary key default gen_random_uuid(),
  crop_id uuid not null references crops(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (crop_id, slug)
);

create table if not exists crop_profiles (
  id uuid primary key default gen_random_uuid(),
  crop_id uuid not null references crops(id) on delete cascade,
  variety_id uuid references crop_varieties(id) on delete cascade,

  seed_depth_mm integer,
  spacing_in_row_mm integer,
  row_spacing_mm integer,

  days_to_germination_min integer,
  days_to_germination_max integer,
  days_to_maturity_min integer,
  days_to_maturity_max integer,

  sun_requirement text,
  water_requirement text,
  sow_method text,

  attributes jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (crop_id, variety_id),

  constraint crop_profiles_nonneg_mm check (
    (seed_depth_mm is null or seed_depth_mm >= 0) and
    (spacing_in_row_mm is null or spacing_in_row_mm >= 0) and
    (row_spacing_mm is null or row_spacing_mm >= 0)
  ),
  constraint crop_profiles_days_ranges check (
    (days_to_germination_min is null or days_to_germination_max is null or days_to_germination_min <= days_to_germination_max) and
    (days_to_maturity_min is null or days_to_maturity_max is null or days_to_maturity_min <= days_to_maturity_max)
  )
);

create index if not exists idx_crop_profiles_crop on crop_profiles(crop_id);
create index if not exists idx_crop_profiles_variety on crop_profiles(variety_id);

create table if not exists crop_zone_suitability (
  id uuid primary key default gen_random_uuid(),
  crop_id uuid not null references crops(id) on delete cascade,
  variety_id uuid references crop_varieties(id) on delete cascade,
  system text not null default 'USDA',
  min_zone integer,
  min_subzone char(1),
  max_zone integer,
  max_subzone char(1),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (crop_id, variety_id, system),

  constraint crop_zone_bounds_chk check (min_zone is not null or max_zone is not null),
  constraint crop_zone_subzone_chk check (
    (min_subzone is null or min_subzone in ('a','b')) and
    (max_subzone is null or max_subzone in ('a','b'))
  )
);

create index if not exists idx_crop_zone_suitability_crop on crop_zone_suitability(crop_id);

-- ============================
-- GROWER CROP LIBRARY
-- ============================
create table if not exists grower_crop_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  crop_id uuid not null references crops(id) on delete restrict,
  variety_id uuid references crop_varieties(id) on delete restrict,

  status grower_crop_status not null default 'interested',

  visibility visibility_scope not null default 'local',
  surplus_enabled boolean not null default false,

  nickname text,
  default_unit text, -- e.g. "lb", "bunch", "bag", "each"
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, crop_id, variety_id)
);

create index if not exists idx_grower_crop_library_user on grower_crop_library(user_id);
create index if not exists idx_grower_crop_library_crop on grower_crop_library(crop_id);

-- ============================
-- SURPLUS LISTINGS
-- ============================
create table if not exists surplus_listings (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references users(id) on delete cascade,
  grower_crop_id uuid references grower_crop_library(id) on delete set null,

  crop_id uuid not null references crops(id) on delete restrict,
  variety_id uuid references crop_varieties(id) on delete restrict,

  title text,

  unit text, -- allow null/unspecified; app can normalize
  quantity_total numeric(12,3),
  quantity_remaining numeric(12,3),

  available_start timestamptz,
  available_end timestamptz,

  status listing_status not null default 'active',

  pickup_location_text text,
  pickup_address text,
  pickup_disclosure_policy pickup_disclosure_policy not null default 'after_confirmed',
  pickup_notes text,
  contact_pref contact_preference not null default 'app_message',

  geo_key text,
  lat double precision,
  lng double precision,

  created_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint surplus_listings_soft_delete_consistent check (
    (deleted_at is null) or (deleted_at is not null)
  ),
  constraint surplus_listings_lat_lng_pair check (
    (lat is null and lng is null) or (lat is not null and lng is not null)
  ),
  constraint surplus_listings_qty_nonneg check (
    (quantity_total is null or quantity_total >= 0) and
    (quantity_remaining is null or quantity_remaining >= 0)
  ),
  constraint surplus_listings_qty_remaining_le_total check (
    (quantity_total is null or quantity_remaining is null) or (quantity_remaining <= quantity_total)
  ),
  constraint surplus_listings_window_check check (
    (available_start is null or available_end is null) or (available_start <= available_end)
  )
);

create index if not exists idx_surplus_listings_geo on surplus_listings(geo_key);
create index if not exists idx_surplus_listings_status on surplus_listings(status);
create index if not exists idx_surplus_listings_user on surplus_listings(user_id);
create index if not exists idx_surplus_listings_available on surplus_listings(available_start, available_end);
create index if not exists idx_surplus_listings_user_created
  on surplus_listings(user_id, created_at desc, id desc)
  where deleted_at is null;
create index if not exists idx_surplus_listings_user_status_created
  on surplus_listings(user_id, status, created_at desc, id desc)
  where deleted_at is null;

-- Listing images
create table if not exists listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references surplus_listings(id) on delete cascade,
  url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (listing_id, url)
);

create index if not exists idx_listing_images_listing on listing_images(listing_id);

-- ============================
-- REQUESTS
-- ============================
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  crop_id uuid not null references crops(id) on delete restrict,
  variety_id uuid references crop_varieties(id) on delete restrict,

  unit text,
  quantity numeric(12,3),
  needed_by timestamptz,
  notes text,

  geo_key text,
  lat double precision,
  lng double precision,

  status request_status not null default 'open',
  created_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint requests_lat_lng_pair check (
    (lat is null and lng is null) or (lat is not null and lng is not null)
  ),
  constraint requests_qty_nonneg check (quantity is null or quantity >= 0)
);

create index if not exists idx_requests_geo on requests(geo_key);
create index if not exists idx_requests_status on requests(status);
create index if not exists idx_requests_user on requests(user_id);

-- ============================
-- CLAIMS
-- ============================
create table if not exists claims (
  id uuid primary key default gen_random_uuid(),

  listing_id uuid not null references surplus_listings(id) on delete cascade,
  request_id uuid references requests(id) on delete set null,

  claimer_id uuid not null references users(id) on delete cascade,

  quantity_claimed numeric(12,3) not null,
  status claim_status not null default 'pending',
  notes text,

  claimed_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,

  constraint claims_qty_positive check (quantity_claimed > 0)
);

create index if not exists idx_claims_listing on claims(listing_id);
create index if not exists idx_claims_request on claims(request_id);
create index if not exists idx_claims_claimer on claims(claimer_id);
create index if not exists idx_claims_status on claims(status);

-- ============================
-- RATINGS
-- ============================
create table if not exists ratings (
  id uuid primary key default gen_random_uuid(),

  claim_id uuid not null references claims(id) on delete cascade,
  rater_id uuid not null references users(id) on delete cascade,
  rated_id uuid not null references users(id) on delete cascade,

  score integer not null,
  comment text,
  context rating_context not null,

  created_at timestamptz not null default now(),

  constraint ratings_score_range check (score between 1 and 5),
  constraint ratings_unique_per_claim_context unique (claim_id, rater_id, context)
);

create index if not exists idx_ratings_rated on ratings(rated_id);
create index if not exists idx_ratings_rater on ratings(rater_id);

-- ============================
-- REPORTS
-- ============================
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),

  reporter_id uuid not null references users(id) on delete cascade,
  reported_user_id uuid references users(id) on delete set null,
  listing_id uuid references surplus_listings(id) on delete set null,
  claim_id uuid references claims(id) on delete set null,

  reason report_reason not null,
  description text,
  status report_status not null default 'pending',

  created_at timestamptz not null default now(),
  resolved_at timestamptz,

  constraint reports_target_present check (
    reported_user_id is not null or listing_id is not null or claim_id is not null
  )
);

create index if not exists idx_reports_status on reports(status);
create index if not exists idx_reports_listing on reports(listing_id);
create index if not exists idx_reports_user on reports(reported_user_id);

-- ============================
-- Transaction-safe decrement pattern (example)
-- ============================
-- When confirming a claim, do this in a single transaction:
-- 1) lock listing row FOR UPDATE
-- 2) ensure quantity_remaining is sufficient
-- 3) update quantity_remaining
-- 4) mark claim confirmed
--
-- This logic is typically in app code, but here's a safe SQL sketch:
--
-- begin;
--   select quantity_remaining from surplus_listings where id = $listing_id for update;
--   update surplus_listings
--     set quantity_remaining = quantity_remaining - $qty
--   where id = $listing_id and (quantity_remaining is null or quantity_remaining >= $qty);
--   -- check rowcount == 1
--   update claims set status='confirmed', confirmed_at=now()
--     where id = $claim_id and status='pending';
-- commit;
