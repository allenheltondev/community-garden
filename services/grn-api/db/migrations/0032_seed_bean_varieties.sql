-- Migration: expand the bean coverage in the curated catalog with additional
-- species (lima, fava, runner, soybean, garbanzo, cowpea, mung, adzuki,
-- yardlong) and common Phaseolus vulgaris cultivars (dragon tongue, pinto,
-- kidney, black, navy, cannellini, great northern, cranberry).
--
-- Each entry is its own top-level crop so it shows up directly in pickers,
-- mirroring how snap-pea / shelling-pea are modeled in 0031.
-- Idempotent via ON CONFLICT (slug).

insert into crops (slug, common_name, scientific_name, category, source_provider, attribution_text)
values
  -- Other bean species
  ('lima-bean',           'Lima Bean',           'Phaseolus lunatus',                          'vegetable', 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('fava-bean',           'Fava Bean',           'Vicia faba',                                 'vegetable', 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('runner-bean',         'Runner Bean',         'Phaseolus coccineus',                        'vegetable', 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('soybean',             'Soybean',             'Glycine max',                                'vegetable', 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('edamame',             'Edamame',             'Glycine max',                                'vegetable', 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('garbanzo-bean',       'Garbanzo Bean',       'Cicer arietinum',                            'vegetable', 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('cowpea',              'Cowpea',              'Vigna unguiculata',                          'vegetable', 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('mung-bean',           'Mung Bean',           'Vigna radiata',                              'vegetable', 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('adzuki-bean',         'Adzuki Bean',         'Vigna angularis',                            'vegetable', 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('yardlong-bean',       'Yardlong Bean',       'Vigna unguiculata subsp. sesquipedalis',     'vegetable', 'internal_seed', 'Olivia''s Garden curated catalog'),

  -- Phaseolus vulgaris cultivars
  ('dragon-tongue-bean',  'Dragon Tongue Bean',  'Phaseolus vulgaris',                         'vegetable', 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('pinto-bean',          'Pinto Bean',          'Phaseolus vulgaris',                         'vegetable', 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('kidney-bean',         'Kidney Bean',         'Phaseolus vulgaris',                         'vegetable', 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('black-bean',          'Black Bean',          'Phaseolus vulgaris',                         'vegetable', 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('navy-bean',           'Navy Bean',           'Phaseolus vulgaris',                         'vegetable', 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('cannellini-bean',     'Cannellini Bean',     'Phaseolus vulgaris',                         'vegetable', 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('great-northern-bean', 'Great Northern Bean', 'Phaseolus vulgaris',                         'vegetable', 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('cranberry-bean',      'Cranberry Bean',      'Phaseolus vulgaris',                         'vegetable', 'internal_seed', 'Olivia''s Garden curated catalog')
on conflict (slug) do update set
  common_name       = excluded.common_name,
  scientific_name   = excluded.scientific_name,
  category          = excluded.category,
  source_provider   = excluded.source_provider,
  attribution_text  = excluded.attribution_text,
  updated_at        = now();
