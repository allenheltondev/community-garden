-- Migration: assign garden-pyramid tiers to the seeded catalog crops.
--
-- Idempotent: each statement sets pyramid_tier for a fixed set of slugs, so
-- re-running simply reasserts the curated tiers. Ornamental flowers are left
-- with a NULL tier on purpose — they are not part of the food pyramid.

-- Tier 1 — Foundation: calorie-dense, storable staples.
update crops set pyramid_tier = 1 where slug in (
  'potato', 'sweet-potato', 'onion', 'garlic', 'shallot',
  'winter-squash', 'butternut-squash', 'pumpkin'
);

-- Tier 2 — Workhorse: high-yield, everyday grocery-replacing vegetables.
update crops set pyramid_tier = 2 where slug in (
  'tomato', 'carrot', 'cucumber', 'bell-pepper', 'hot-pepper',
  'broccoli', 'cauliflower', 'cabbage', 'brussels-sprouts', 'kohlrabi',
  'turnip', 'beet', 'zucchini', 'summer-squash', 'eggplant',
  'green-bean', 'snap-pea', 'shelling-pea', 'sweet-corn', 'celery',
  'okra', 'leek', 'asparagus'
);

-- Tier 3 — Fresh: fast-growing, grab-and-go greens.
update crops set pyramid_tier = 3 where slug in (
  'lettuce', 'kale', 'bok-choy', 'radish', 'arugula', 'spinach', 'swiss-chard'
);

-- Tier 4 — Flavor: culinary herbs.
update crops set pyramid_tier = 4 where slug in (
  'basil', 'parsley', 'cilantro', 'mint', 'rosemary', 'thyme', 'sage',
  'oregano', 'chives', 'dill', 'tarragon', 'lemon-balm', 'chamomile'
);

-- Tier 5 — Joy: berries, fruit, and specialty/perennial treats.
update crops set pyramid_tier = 5 where slug in (
  'strawberry', 'blueberry', 'raspberry', 'blackberry', 'apple', 'pear',
  'peach', 'nectarine', 'plum', 'cherry', 'apricot', 'fig', 'grape',
  'watermelon', 'cantaloupe', 'honeydew', 'lemon', 'lime', 'orange',
  'grapefruit', 'mandarin', 'avocado', 'pomegranate', 'persimmon',
  'mulberry', 'elderberry', 'currant', 'artichoke', 'rhubarb'
);
