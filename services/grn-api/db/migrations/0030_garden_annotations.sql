-- Migration: Garden annotations (non-bed objects on the designer canvas)
-- Adds a sibling table to garden_beds for things that aren't growing
-- spaces — trees, ponds, sheds, paths, fences, generic landmarks.
-- Annotations don't carry soil/crop metadata and aren't LLM-input.

create table if not exists garden_annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  label text not null,
  icon text,                                  -- emoji or icon key
  shape text not null default 'rect',
  position_x integer,
  position_y integer,
  length_inches integer,
  width_inches integer,
  rotation_deg integer not null default 0,
  points jsonb,                               -- array of {x,y} for polygon/line
  color text,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint garden_annotations_label_not_empty check (length(trim(label)) > 0),
  constraint garden_annotations_shape_allowed check (shape in ('rect', 'circle', 'polygon', 'line')),
  constraint garden_annotations_rotation_range check (rotation_deg between -360 and 360),
  constraint garden_annotations_length_nonneg check (length_inches is null or length_inches >= 0),
  constraint garden_annotations_width_nonneg check (width_inches is null or width_inches >= 0),
  constraint garden_annotations_polygon_requires_points check (
    shape <> 'polygon' or (points is not null and jsonb_typeof(points) = 'array')
  ),
  constraint garden_annotations_line_requires_points check (
    shape <> 'line' or (points is not null and jsonb_typeof(points) = 'array')
  )
);

create index if not exists idx_garden_annotations_user
  on garden_annotations(user_id)
  where archived_at is null;
