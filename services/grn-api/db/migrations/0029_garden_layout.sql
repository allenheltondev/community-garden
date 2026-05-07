-- Migration: Garden designer layout columns + per-user garden canvas
-- Adds the geometry/positioning/typing columns garden_beds needs to be
-- rendered on a 2D designer canvas, and introduces a garden_canvases
-- table that owns canvas-level metadata (dimensions, optional background
-- image). v1 ships single-canvas-per-user; the UNIQUE on user_id can be
-- dropped later when multi-garden becomes a paid-tier feature.

alter table garden_beds
  add column if not exists bed_type text not null default 'raised';

alter table garden_beds
  add column if not exists shape text not null default 'rect';

alter table garden_beds
  add column if not exists position_x integer;

alter table garden_beds
  add column if not exists position_y integer;

alter table garden_beds
  add column if not exists rotation_deg integer not null default 0;

alter table garden_beds
  add column if not exists points jsonb;

alter table garden_beds
  add column if not exists color text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'garden_beds'::regclass
      and conname = 'garden_beds_bed_type_allowed'
  ) then
    alter table garden_beds
      add constraint garden_beds_bed_type_allowed
      check (bed_type in ('in_ground', 'raised', 'mound'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'garden_beds'::regclass
      and conname = 'garden_beds_shape_allowed'
  ) then
    alter table garden_beds
      add constraint garden_beds_shape_allowed
      check (shape in ('rect', 'circle', 'polygon'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'garden_beds'::regclass
      and conname = 'garden_beds_rotation_range'
  ) then
    alter table garden_beds
      add constraint garden_beds_rotation_range
      check (rotation_deg >= -360 and rotation_deg <= 360);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'garden_beds'::regclass
      and conname = 'garden_beds_polygon_requires_points'
  ) then
    alter table garden_beds
      add constraint garden_beds_polygon_requires_points
      check (
        shape <> 'polygon'
        or (points is not null and jsonb_typeof(points) = 'array')
      );
  end if;
end $$;

create table if not exists garden_canvases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  width_inches integer not null default 360,
  height_inches integer not null default 240,
  background_image_key text,
  background_opacity smallint not null default 60,
  north_offset_deg smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint garden_canvases_width_positive check (width_inches > 0),
  constraint garden_canvases_height_positive check (height_inches > 0),
  constraint garden_canvases_opacity_range check (background_opacity between 0 and 100),
  constraint garden_canvases_north_range check (north_offset_deg between -360 and 360)
);
