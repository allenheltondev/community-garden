// Maps catalog categories and common names to a friendly emoji + accent color
// so the crop planner has visual character without needing a real image catalog.
//
// `categoryToVisual` is the broad fallback; `nameToVisual` overrides for crops
// with strong visual identity that gardeners will recognize at a glance.

export interface CropVisual {
  emoji: string;
  accent: string;
}

const DEFAULT_VISUAL: CropVisual = { emoji: '🌱', accent: '#69874b' };

const categoryToVisual: Record<string, CropVisual> = {
  vegetable: { emoji: '🥬', accent: '#5b8c4a' },
  vegetables: { emoji: '🥬', accent: '#5b8c4a' },
  fruit: { emoji: '🍎', accent: '#c1452f' },
  fruits: { emoji: '🍎', accent: '#c1452f' },
  herb: { emoji: '🌿', accent: '#446e3b' },
  herbs: { emoji: '🌿', accent: '#446e3b' },
  flower: { emoji: '🌸', accent: '#c97aab' },
  flowers: { emoji: '🌸', accent: '#c97aab' },
  grain: { emoji: '🌾', accent: '#b08a3d' },
  grains: { emoji: '🌾', accent: '#b08a3d' },
  legume: { emoji: '🫘', accent: '#7a533c' },
  legumes: { emoji: '🫘', accent: '#7a533c' },
  root: { emoji: '🥕', accent: '#d36a2c' },
  roots: { emoji: '🥕', accent: '#d36a2c' },
  brassica: { emoji: '🥦', accent: '#436e3b' },
  brassicas: { emoji: '🥦', accent: '#436e3b' },
  squash: { emoji: '🎃', accent: '#d57a1f' },
  cucurbit: { emoji: '🥒', accent: '#5b8c4a' },
  cucurbits: { emoji: '🥒', accent: '#5b8c4a' },
  allium: { emoji: '🧅', accent: '#a9826b' },
  alliums: { emoji: '🧅', accent: '#a9826b' },
  nightshade: { emoji: '🍅', accent: '#c1452f' },
  nightshades: { emoji: '🍅', accent: '#c1452f' },
  berry: { emoji: '🫐', accent: '#5e4ea3' },
  berries: { emoji: '🫐', accent: '#5e4ea3' },
};

const nameToVisual: Array<{ match: RegExp; visual: CropVisual }> = [
  { match: /tomato/i, visual: { emoji: '🍅', accent: '#c1452f' } },
  { match: /pepper/i, visual: { emoji: '🌶️', accent: '#c1452f' } },
  { match: /cucumber/i, visual: { emoji: '🥒', accent: '#5b8c4a' } },
  { match: /carrot/i, visual: { emoji: '🥕', accent: '#d36a2c' } },
  { match: /lettuce|salad/i, visual: { emoji: '🥬', accent: '#5b8c4a' } },
  { match: /onion/i, visual: { emoji: '🧅', accent: '#a9826b' } },
  { match: /garlic/i, visual: { emoji: '🧄', accent: '#cdb89c' } },
  { match: /broccoli/i, visual: { emoji: '🥦', accent: '#436e3b' } },
  { match: /corn|maize/i, visual: { emoji: '🌽', accent: '#d6a52c' } },
  { match: /potato/i, visual: { emoji: '🥔', accent: '#a9826b' } },
  { match: /pumpkin|squash/i, visual: { emoji: '🎃', accent: '#d57a1f' } },
  { match: /strawberry/i, visual: { emoji: '🍓', accent: '#c1452f' } },
  { match: /blueberry|berry/i, visual: { emoji: '🫐', accent: '#5e4ea3' } },
  { match: /apple/i, visual: { emoji: '🍎', accent: '#c1452f' } },
  { match: /grape/i, visual: { emoji: '🍇', accent: '#5e4ea3' } },
  { match: /watermelon/i, visual: { emoji: '🍉', accent: '#3f8a4f' } },
  { match: /lemon/i, visual: { emoji: '🍋', accent: '#d6c12c' } },
  { match: /peach/i, visual: { emoji: '🍑', accent: '#e0935b' } },
  { match: /eggplant|aubergine/i, visual: { emoji: '🍆', accent: '#5e4ea3' } },
  { match: /basil/i, visual: { emoji: '🌿', accent: '#446e3b' } },
  { match: /mint/i, visual: { emoji: '🌿', accent: '#3a7e5a' } },
  { match: /rosemary/i, visual: { emoji: '🌿', accent: '#5b7a55' } },
  { match: /thyme/i, visual: { emoji: '🌿', accent: '#608060' } },
  { match: /parsley/i, visual: { emoji: '🌿', accent: '#446e3b' } },
  { match: /cilantro|coriander/i, visual: { emoji: '🌿', accent: '#5b8c4a' } },
  { match: /sunflower/i, visual: { emoji: '🌻', accent: '#d6a52c' } },
  { match: /rose/i, visual: { emoji: '🌹', accent: '#c1452f' } },
  { match: /tulip/i, visual: { emoji: '🌷', accent: '#c97aab' } },
  { match: /bean/i, visual: { emoji: '🫘', accent: '#7a533c' } },
  { match: /pea/i, visual: { emoji: '🌱', accent: '#5b8c4a' } },
  { match: /kale|chard|spinach|collard/i, visual: { emoji: '🥬', accent: '#446e3b' } },
];

export function visualForCrop(name?: string | null, category?: string | null): CropVisual {
  if (name) {
    for (const entry of nameToVisual) {
      if (entry.match.test(name)) return entry.visual;
    }
  }
  if (category) {
    const key = category.trim().toLowerCase();
    if (categoryToVisual[key]) return categoryToVisual[key];
  }
  return DEFAULT_VISUAL;
}

export const CATEGORY_FILTERS: ReadonlyArray<{ id: string; label: string; emoji: string }> = [
  { id: 'all', label: 'All', emoji: '🌍' },
  { id: 'vegetable', label: 'Vegetables', emoji: '🥬' },
  { id: 'fruit', label: 'Fruits', emoji: '🍎' },
  { id: 'herb', label: 'Herbs', emoji: '🌿' },
  { id: 'flower', label: 'Flowers', emoji: '🌸' },
  { id: 'grain', label: 'Grains', emoji: '🌾' },
];
