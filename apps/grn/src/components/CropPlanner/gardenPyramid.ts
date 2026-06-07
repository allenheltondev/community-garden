// The Garden Pyramid: a 5-level way to plan a garden, biggest layer to
// smallest, inspired by the "feed-yourself first" framing growers find
// intuitive. Each layer builds on the one below it:
//
//   1. Foundation — staples you can live on (calories + storage)
//   2. Workhorse  — where the garden starts replacing the grocery store
//   3. Fresh      — grab-and-go greens you eat straight from the bed
//   4. Flavor     — herbs that make everything taste better
//   5. Joy        — berries, treats, and experiments
//
// `classifyCropToTier` auto-sorts a crop name into one of these layers using
// the same ordered-regex approach as `cropVisuals.ts`: the most specific
// patterns win, and ambiguous crops (e.g. plain "beans" or "squash") fall back
// to the layer most growers mean by default. Anything we can't place returns
// `null` so the UI can surface it as an experiment for the Joy tier.

import type { CropIconKey } from './cropIconPaths';

export type PyramidTier = 1 | 2 | 3 | 4 | 5;

export interface PyramidSuggestion {
  name: string;
  iconKey: CropIconKey;
}

export interface PyramidTierMeta {
  level: PyramidTier;
  /** Stable key used for class names + test ids. */
  key: string;
  name: string;
  /** One-line hook shown on the pyramid band. */
  tagline: string;
  /** Longer explanation shown in the tier detail panel. */
  description: string;
  /** Accent color for the band + cards (harmonizes with the GRN palette). */
  accent: string;
  /** Curated starter crops for growers who want to fill a gap in this layer. */
  suggestions: PyramidSuggestion[];
}

// Ordered low → high so the array index doubles as "build from the bottom up".
export const PYRAMID_TIERS: readonly PyramidTierMeta[] = [
  {
    level: 1,
    key: 'foundation',
    name: 'Foundation',
    tagline: 'Staples you can feed yourself with',
    description:
      'Calorie-dense crops that store for months and form the base of a self-reliant garden. If you grow nothing else, grow these.',
    accent: '#7a533c',
    suggestions: [
      { name: 'Potatoes', iconKey: 'potato' },
      { name: 'Sweet potatoes', iconKey: 'sweetPotato' },
      { name: 'Dry beans', iconKey: 'bean' },
      { name: 'Winter squash', iconKey: 'squash' },
      { name: 'Onions', iconKey: 'onion' },
      { name: 'Garlic', iconKey: 'garlic' },
    ],
  },
  {
    level: 2,
    key: 'workhorse',
    name: 'Workhorse',
    tagline: 'Where the garden replaces the grocery store',
    description:
      'High-yield, everyday vegetables that show up in most meals. These are the crops that start shrinking your grocery bill.',
    accent: '#426b3f',
    suggestions: [
      { name: 'Tomatoes', iconKey: 'tomato' },
      { name: 'Peppers', iconKey: 'pepper' },
      { name: 'Zucchini', iconKey: 'zucchini' },
      { name: 'Cabbage', iconKey: 'cabbage' },
      { name: 'Cucumbers', iconKey: 'cucumber' },
      { name: 'Carrots', iconKey: 'carrot' },
    ],
  },
  {
    level: 3,
    key: 'fresh',
    name: 'Fresh',
    tagline: 'Grab-something-fresh-from-the-garden greens',
    description:
      'Fast-growing greens you pick minutes before eating. Quick wins that keep you visiting the garden all season.',
    accent: '#6f8f5f',
    suggestions: [
      { name: 'Lettuce', iconKey: 'lettuce' },
      { name: 'Spinach', iconKey: 'spinach' },
      { name: 'Kale', iconKey: 'kale' },
      { name: 'Radishes', iconKey: 'radish' },
      { name: 'Scallions', iconKey: 'leek' },
      { name: 'Bok choy', iconKey: 'cabbage' },
    ],
  },
  {
    level: 4,
    key: 'flavor',
    name: 'Flavor',
    tagline: 'Herbs that make every meal sing',
    description:
      'A little space goes a long way. Fresh herbs add the flavor that turns homegrown produce into great cooking.',
    accent: '#d8a741',
    suggestions: [
      { name: 'Cilantro', iconKey: 'cilantro' },
      { name: 'Dill', iconKey: 'dill' },
      { name: 'Parsley', iconKey: 'parsley' },
      { name: 'Fennel', iconKey: 'fennel' },
      { name: 'Basil', iconKey: 'basil' },
    ],
  },
  {
    level: 5,
    key: 'joy',
    name: 'Joy',
    tagline: 'Berries, treats, and experiments',
    description:
      'The fun layer. Berries, novelties, and the crops you grow just because they make you happy. Pure upside once the rest is in place.',
    accent: '#a3527e',
    suggestions: [
      { name: 'Strawberries', iconKey: 'strawberry' },
      { name: 'Blueberries', iconKey: 'blueberry' },
      { name: 'Raspberries', iconKey: 'raspberry' },
      { name: 'Blackberries', iconKey: 'blackberry' },
      { name: 'Grapes', iconKey: 'grape' },
    ],
  },
] as const;

export function tierMeta(level: PyramidTier): PyramidTierMeta {
  // Levels are 1-indexed and the array is ordered, so this is always defined.
  return PYRAMID_TIERS[level - 1];
}

// Ordered most-specific → least-specific. First match wins, so disambiguating
// patterns (e.g. "winter squash", "green onion") must sit above the generic
// fallbacks ("squash", "onion").
const nameRules: ReadonlyArray<{ match: RegExp; tier: PyramidTier }> = [
  // --- Foundation: storage staples & calories ---
  { match: /sweet potato|\byam\b/i, tier: 1 },
  { match: /\bpotato(es)?\b/i, tier: 1 },
  { match: /winter squash|butternut|acorn squash|spaghetti squash|kabocha|delicata|hubbard/i, tier: 1 },
  { match: /\bpumpkin\b/i, tier: 1 },
  { match: /dry bean|dried bean|kidney bean|pinto|black bean|navy bean|cannellini|cowpea|black[- ]?eyed pea/i, tier: 1 },
  { match: /lentil|chickpea|garbanzo|soybean|soy bean|edamame|fava bean|broad bean/i, tier: 1 },
  { match: /\bgarlic\b/i, tier: 1 },
  { match: /\bshallot/i, tier: 1 },

  // --- Fresh: scallions/greens that share a name with foundation alliums ---
  { match: /green onion|spring onion|scallion|bunching onion/i, tier: 3 },

  // --- Foundation: storage onions (after the green-onion carve-out) ---
  { match: /\bonion(s)?\b/i, tier: 1 },

  // --- Workhorse: everyday vegetables ---
  { match: /summer squash|yellow squash|pattypan|crookneck|zucchini|courgette/i, tier: 2 },
  { match: /\bsquash\b|\bgourd\b/i, tier: 1 }, // bare "squash" defaults to winter squash
  { match: /green bean|snap bean|string bean|pole bean|bush bean|wax bean|lima|fresh bean/i, tier: 2 },
  { match: /\bbean(s)?\b/i, tier: 2 }, // bare "beans" defaults to fresh
  { match: /tomato/i, tier: 2 },
  { match: /pepper|capsicum|chili|chile|jalape|cayenne|habanero|serrano|poblano/i, tier: 2 },
  { match: /cucumber|gherkin/i, tier: 2 },
  { match: /\bcabbage\b/i, tier: 2 },
  { match: /\bcarrot/i, tier: 2 },
  { match: /eggplant|aubergine/i, tier: 2 },
  { match: /broccoli|cauliflower|brussels|kohlrabi/i, tier: 2 },
  { match: /\bbeet|turnip|parsnip|rutabaga|celeriac/i, tier: 2 },
  { match: /\bleek\b/i, tier: 2 },
  { match: /\bcorn\b|maize/i, tier: 2 },
  { match: /\bokra\b/i, tier: 2 },
  { match: /\bcelery\b/i, tier: 2 },
  { match: /\bpea(s)?\b/i, tier: 2 },

  // --- Fresh: fast greens ---
  { match: /lettuce|salad green|mesclun|mixed green/i, tier: 3 },
  { match: /spinach/i, tier: 3 },
  { match: /\bkale\b/i, tier: 3 },
  { match: /radish/i, tier: 3 },
  { match: /bok choy|pak choi|pac choi/i, tier: 3 },
  { match: /arugula|rocket/i, tier: 3 },
  { match: /chard/i, tier: 3 },
  { match: /collard/i, tier: 3 },
  { match: /mustard green|mizuna|tatsoi|cress|microgreen/i, tier: 3 },
  { match: /endive|escarole|radicchio/i, tier: 3 },

  // --- Flavor: herbs ---
  { match: /cilantro|coriander/i, tier: 4 },
  { match: /\bdill\b/i, tier: 4 },
  { match: /parsley/i, tier: 4 },
  { match: /\bfennel\b/i, tier: 4 },
  { match: /basil/i, tier: 4 },
  { match: /\bmint\b/i, tier: 4 },
  { match: /rosemary/i, tier: 4 },
  { match: /thyme/i, tier: 4 },
  { match: /\bsage\b/i, tier: 4 },
  { match: /oregano/i, tier: 4 },
  { match: /chive/i, tier: 4 },
  { match: /tarragon|marjoram|lemongrass|lemon balm|chamomile|lavender|bay leaf|savory/i, tier: 4 },

  // --- Joy: berries, fruit, treats ---
  { match: /strawberr/i, tier: 5 },
  { match: /blueberr/i, tier: 5 },
  { match: /raspberr/i, tier: 5 },
  { match: /blackberr/i, tier: 5 },
  { match: /goji|elderberr|gooseberr|currant|huckleberr|mulberr|cranberr/i, tier: 5 },
  { match: /\bberry\b|berries/i, tier: 5 },
  { match: /grape/i, tier: 5 },
  { match: /watermelon|cantaloupe|honeydew|muskmelon|\bmelon\b/i, tier: 5 },
  { match: /\bfig\b|apple|pear|peach|nectarine|\bplum\b|cherry|cherries|apricot|pomegranate|persimmon/i, tier: 5 },
  { match: /lemon|lime|orange|mandarin|tangerine|citrus|grapefruit/i, tier: 5 },
];

const categoryRules: Record<string, PyramidTier> = {
  herb: 4,
  herbs: 4,
  berry: 5,
  berries: 5,
  fruit: 5,
  fruits: 5,
  grain: 1,
  grains: 1,
  allium: 1,
  alliums: 1,
  legume: 1,
  legumes: 1,
  root: 2,
  roots: 2,
  brassica: 2,
  brassicas: 2,
  nightshade: 2,
  nightshades: 2,
  cucurbit: 2,
  cucurbits: 2,
  vegetable: 2,
  vegetables: 2,
};

/**
 * Sort a crop into a pyramid layer by name first, then category. Returns
 * `null` when nothing matches so callers can treat it as an unplaced
 * experiment rather than guessing.
 */
export function classifyCropToTier(
  name?: string | null,
  category?: string | null
): PyramidTier | null {
  if (name) {
    for (const rule of nameRules) {
      if (rule.match.test(name)) return rule.tier;
    }
  }
  if (category) {
    const key = category.trim().toLowerCase();
    if (key in categoryRules) return categoryRules[key];
  }
  return null;
}

function asPyramidTier(value: number | null | undefined): PyramidTier | null {
  if (value == null) return null;
  if (Number.isInteger(value) && value >= 1 && value <= 5) {
    return value as PyramidTier;
  }
  return null;
}

/**
 * Resolve the pyramid layer for a single crop. The authoritative source is the
 * `pyramidTier` carried from the catalog; only when that is absent (e.g. a
 * free-text crop with no catalog link) do we fall back to classifying the name.
 */
export function resolveCropTier(crop: {
  cropName: string;
  pyramidTier?: number | null;
}): PyramidTier | null {
  return asPyramidTier(crop.pyramidTier) ?? classifyCropToTier(crop.cropName, null);
}

/**
 * Bucket a list of crops into pyramid layers. Returns a record keyed by tier
 * level plus an `unsorted` list for crops that couldn't be placed.
 */
export function bucketCropsByTier<T extends { cropName: string; pyramidTier?: number | null }>(
  crops: readonly T[]
): { tiers: Record<PyramidTier, T[]>; unsorted: T[] } {
  const tiers: Record<PyramidTier, T[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  const unsorted: T[] = [];
  for (const crop of crops) {
    const tier = resolveCropTier(crop);
    if (tier === null) {
      unsorted.push(crop);
    } else {
      tiers[tier].push(crop);
    }
  }
  return { tiers, unsorted };
}

// ---------------------------------------------------------------------------
// Plan evaluation
// ---------------------------------------------------------------------------

const ALL_TIERS: readonly PyramidTier[] = [1, 2, 3, 4, 5];

// Lower layers carry more weight: a strong plan is built from the Foundation
// up. Weights sum to 1 so full coverage maps to a coverage score of 1.
const TIER_WEIGHTS: Record<PyramidTier, number> = {
  1: 0.3,
  2: 0.25,
  3: 0.2,
  4: 0.15,
  5: 0.1,
};

export interface PlanEvaluation {
  /** 0–100 overall plan health. */
  score: number;
  /** Friendly label for the score band. */
  label: string;
  /** Number of layers with at least one crop. */
  coveredCount: number;
  /** Lowest layer still empty (the recommended place to grow next), or null. */
  nextFocusTier: PyramidTier | null;
  /** True when an upper layer holds more crops than a layer beneath it. */
  topHeavy: boolean;
}

function scoreLabel(score: number): string {
  if (score <= 0) return 'Empty plot';
  if (score < 25) return 'Seedling plan';
  if (score < 50) return 'Taking root';
  if (score < 75) return 'Well-rooted';
  return 'Thriving garden';
}

/**
 * Evaluate how well a garden is planned using the pyramid philosophy:
 * reward covering the lower (foundational) layers, and reward a true pyramid
 * shape where each layer is no smaller than the one above it.
 */
export function evaluatePlan(counts: Record<PyramidTier, number>): PlanEvaluation {
  const total = ALL_TIERS.reduce((sum, t) => sum + (counts[t] || 0), 0);
  const coveredCount = ALL_TIERS.filter((t) => (counts[t] || 0) > 0).length;
  const nextFocusTier = ALL_TIERS.find((t) => (counts[t] || 0) === 0) ?? null;

  if (total === 0) {
    return { score: 0, label: scoreLabel(0), coveredCount: 0, nextFocusTier: 1, topHeavy: false };
  }

  // Coverage: weighted credit for each layer that has at least one crop.
  const coverage = ALL_TIERS.reduce(
    (sum, t) => sum + ((counts[t] || 0) > 0 ? TIER_WEIGHTS[t] : 0),
    0
  );

  // Shape: a violation is an upper layer holding more crops than the layer
  // directly beneath it (a top-heavy plan). Four adjacent pairs in total.
  let violations = 0;
  for (let t = 1 as PyramidTier; t < 5; t = (t + 1) as PyramidTier) {
    const lower = counts[t] || 0;
    const upper = counts[(t + 1) as PyramidTier] || 0;
    if (upper > lower) violations += 1;
  }
  const shape = 1 - violations / 4;

  const score = Math.round(100 * (0.7 * coverage + 0.3 * shape));

  return {
    score,
    label: scoreLabel(score),
    coveredCount,
    nextFocusTier,
    topHeavy: violations > 0,
  };
}

/**
 * Short, actionable guidance derived from an evaluation: what to grow next, or
 * a nudge to rebalance a top-heavy plan.
 */
export function planGuidance(evaluation: PlanEvaluation): string {
  if (evaluation.score === 0) {
    return 'Start at the Foundation — add a staple crop like potatoes or onions.';
  }
  if (evaluation.nextFocusTier !== null) {
    const meta = tierMeta(evaluation.nextFocusTier);
    return `Next up: add a ${meta.name} crop — ${meta.tagline.toLowerCase()}.`;
  }
  if (evaluation.topHeavy) {
    return 'Your plan is a little top-heavy. Add more to the lower layers to balance the pyramid.';
  }
  return 'Every layer is covered and well balanced — a beautifully planned garden!';
}
