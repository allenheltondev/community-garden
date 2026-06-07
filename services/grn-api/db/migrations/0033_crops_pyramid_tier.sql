-- Migration: add a "garden pyramid" tier to catalog crops so the planner can
-- sort crops into layers objectively from the database instead of guessing from
-- the crop name at runtime.
--
--   1 = Foundation (calorie/storage staples)
--   2 = Workhorse  (everyday grocery-replacing vegetables)
--   3 = Fresh      (fast grab-and-go greens)
--   4 = Flavor     (culinary herbs)
--   5 = Joy        (berries, fruit, treats, experiments)
--
-- NULL means the crop is not part of the food pyramid (e.g. ornamental
-- flowers). The companion migration 0034 assigns tiers to the seeded catalog.

alter table crops
  add column if not exists pyramid_tier smallint
    check (pyramid_tier is null or pyramid_tier between 1 and 5);

comment on column crops.pyramid_tier is
  'Garden pyramid layer: 1=Foundation, 2=Workhorse, 3=Fresh, 4=Flavor, 5=Joy. NULL = not part of the food pyramid (e.g. ornamentals).';

create index if not exists idx_crops_pyramid_tier on crops(pyramid_tier);
