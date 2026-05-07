-- Migration: Add garden beds and per-crop planting details
-- Adds a garden_beds table so growers can describe the physical
-- locations where they grow, plus optional planting columns on
-- grower_crop_library that turn the library into a real garden plan.

create table if not exists garden_beds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  description text,
  sun_exposure text,            -- e.g. 'full_sun', 'partial_sun', 'partial_shade', 'full_shade'
  soil_type text,               -- free-form: 'sandy_loam', 'raised_bed_mix', etc.
  length_inches integer,        -- optional dimensions for future visual layouts
  width_inches integer,
  location_notes text,          -- e.g. 'south side, near rosemary'
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint garden_beds_name_not_empty check (length(trim(name)) > 0),
  constraint garden_beds_length_nonnegative check (length_inches is null or length_inches >= 0),
  constraint garden_beds_width_nonnegative check (width_inches is null or width_inches >= 0)
);

create index if not exists idx_garden_beds_user
  on garden_beds(user_id)
  where archived_at is null;

-- Per-crop planting metadata: where it lives, when it went in, when to expect harvest, how many plants.
alter table grower_crop_library
  add column if not exists bed_id uuid references garden_beds(id) on delete set null;

alter table grower_crop_library
  add column if not exists planting_date date;

alter table grower_crop_library
  add column if not exists expected_harvest_date date;

alter table grower_crop_library
  add column if not exists plant_count integer;

alter table grower_crop_library
  add column if not exists spacing_inches integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'grower_crop_library'::regclass
      and conname = 'grower_crop_library_plant_count_positive'
  ) then
    alter table grower_crop_library
      add constraint grower_crop_library_plant_count_positive
      check (plant_count is null or plant_count > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'grower_crop_library'::regclass
      and conname = 'grower_crop_library_spacing_nonnegative'
  ) then
    alter table grower_crop_library
      add constraint grower_crop_library_spacing_nonnegative
      check (spacing_inches is null or spacing_inches >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'grower_crop_library'::regclass
      and conname = 'grower_crop_library_harvest_after_planting'
  ) then
    alter table grower_crop_library
      add constraint grower_crop_library_harvest_after_planting
      check (
        planting_date is null
        or expected_harvest_date is null
        or expected_harvest_date >= planting_date
      );
  end if;
end $$;

create index if not exists idx_grower_crop_library_bed
  on grower_crop_library(bed_id)
  where bed_id is not null;
