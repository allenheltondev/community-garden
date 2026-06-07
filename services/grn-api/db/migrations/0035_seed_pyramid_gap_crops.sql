-- Migration: seed the crops the garden-pyramid framing was missing, with their
-- tiers assigned inline. These close gaps in the lower (most important) layers
-- — especially crops the pyramid philosophy calls out by name (dry beans,
-- scallions, fennel) that the original catalog lacked.
--
-- Idempotent: upserts on slug and reasserts the curated tier on conflict.

insert into crops (slug, common_name, scientific_name, category, pyramid_tier, source_provider, attribution_text)
values
  -- Tier 1 — Foundation: storage legumes (protein + calories you can keep).
  ('dry-bean',        'Dry Bean',        'Phaseolus vulgaris',              'vegetable', 1, 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('lentil',          'Lentil',          'Lens culinaris',                  'vegetable', 1, 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('chickpea',        'Chickpea',        'Cicer arietinum',                 'vegetable', 1, 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('fava-bean',       'Fava Bean',       'Vicia faba',                      'vegetable', 1, 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('edamame',         'Edamame',         'Glycine max',                     'vegetable', 1, 'internal_seed', 'Olivia''s Garden curated catalog'),

  -- Tier 2 — Workhorse: storage roots that keep company with beets & turnips.
  ('parsnip',         'Parsnip',         'Pastinaca sativa',                'vegetable', 2, 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('rutabaga',        'Rutabaga',        'Brassica napobrassica',           'vegetable', 2, 'internal_seed', 'Olivia''s Garden curated catalog'),

  -- Tier 3 — Fresh: quick, cut-and-come-again greens and alliums.
  ('green-onion',     'Green Onion',     'Allium fistulosum',               'vegetable', 3, 'internal_seed', 'Olivia''s Garden curated catalog'),
  ('collard-greens',  'Collard Greens',  'Brassica oleracea var. viridis',  'vegetable', 3, 'internal_seed', 'Olivia''s Garden curated catalog'),

  -- Tier 4 — Flavor: a herb the original catalog was missing.
  ('fennel',          'Fennel',          'Foeniculum vulgare',              'herb',      4, 'internal_seed', 'Olivia''s Garden curated catalog')
on conflict (slug) do update set
  common_name       = excluded.common_name,
  scientific_name   = excluded.scientific_name,
  category          = excluded.category,
  pyramid_tier      = excluded.pyramid_tier,
  source_provider   = excluded.source_provider,
  attribution_text  = excluded.attribution_text,
  updated_at        = now();
