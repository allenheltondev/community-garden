// Maps catalog categories and common names to a friendly emoji + accent color
// + line-art icon key so the crop planner has visual character without needing
// a real image catalog.
//
// `categoryToVisual` is the broad fallback; `nameToVisual` overrides for crops
// with strong visual identity that gardeners will recognize at a glance.

import type { CropIconKey } from './cropIconPaths';

export interface CropVisual {
  emoji: string;
  accent: string;
  iconKey: CropIconKey;
}

const DEFAULT_VISUAL: CropVisual = { emoji: '🌱', accent: '#69874b', iconKey: 'leaf' };

const categoryToVisual: Record<string, CropVisual> = {
  vegetable: { emoji: '🥬', accent: '#5b8c4a', iconKey: 'leaf' },
  vegetables: { emoji: '🥬', accent: '#5b8c4a', iconKey: 'leaf' },
  fruit: { emoji: '🍎', accent: '#c1452f', iconKey: 'apple' },
  fruits: { emoji: '🍎', accent: '#c1452f', iconKey: 'apple' },
  herb: { emoji: '🌿', accent: '#446e3b', iconKey: 'basil' },
  herbs: { emoji: '🌿', accent: '#446e3b', iconKey: 'basil' },
  flower: { emoji: '🌸', accent: '#c97aab', iconKey: 'flower' },
  flowers: { emoji: '🌸', accent: '#c97aab', iconKey: 'flower' },
  grain: { emoji: '🌾', accent: '#b08a3d', iconKey: 'wheat' },
  grains: { emoji: '🌾', accent: '#b08a3d', iconKey: 'wheat' },
  legume: { emoji: '🫘', accent: '#7a533c', iconKey: 'pea' },
  legumes: { emoji: '🫘', accent: '#7a533c', iconKey: 'pea' },
  root: { emoji: '🥕', accent: '#d36a2c', iconKey: 'carrot' },
  roots: { emoji: '🥕', accent: '#d36a2c', iconKey: 'carrot' },
  brassica: { emoji: '🥦', accent: '#436e3b', iconKey: 'broccoli' },
  brassicas: { emoji: '🥦', accent: '#436e3b', iconKey: 'broccoli' },
  squash: { emoji: '🎃', accent: '#d57a1f', iconKey: 'pumpkin' },
  cucurbit: { emoji: '🥒', accent: '#5b8c4a', iconKey: 'cucumber' },
  cucurbits: { emoji: '🥒', accent: '#5b8c4a', iconKey: 'cucumber' },
  allium: { emoji: '🧅', accent: '#a9826b', iconKey: 'onion' },
  alliums: { emoji: '🧅', accent: '#a9826b', iconKey: 'onion' },
  nightshade: { emoji: '🍅', accent: '#c1452f', iconKey: 'tomato' },
  nightshades: { emoji: '🍅', accent: '#c1452f', iconKey: 'tomato' },
  berry: { emoji: '🫐', accent: '#5e4ea3', iconKey: 'berry' },
  berries: { emoji: '🫐', accent: '#5e4ea3', iconKey: 'berry' },
  mushroom: { emoji: '🍄', accent: '#a3654c', iconKey: 'mushroom' },
  mushrooms: { emoji: '🍄', accent: '#a3654c', iconKey: 'mushroom' },
};

const nameToVisual: Array<{ match: RegExp; visual: CropVisual }> = [
  // Nightshades
  { match: /tomato/i, visual: { emoji: '🍅', accent: '#c1452f', iconKey: 'tomato' } },
  { match: /eggplant|aubergine/i, visual: { emoji: '🍆', accent: '#5e4ea3', iconKey: 'eggplant' } },
  { match: /chili|chile|jalape|cayenne|habanero|serrano|thai pepper|hot pepper/i, visual: { emoji: '🌶️', accent: '#c1452f', iconKey: 'chiliPepper' } },
  { match: /pepper|capsicum/i, visual: { emoji: '🫑', accent: '#3f8a4f', iconKey: 'pepper' } },

  // Cucurbits
  { match: /cucumber|gherkin/i, visual: { emoji: '🥒', accent: '#5b8c4a', iconKey: 'cucumber' } },
  { match: /zucchini|courgette/i, visual: { emoji: '🥒', accent: '#5b8c4a', iconKey: 'zucchini' } },
  { match: /pumpkin/i, visual: { emoji: '🎃', accent: '#d57a1f', iconKey: 'pumpkin' } },
  { match: /watermelon/i, visual: { emoji: '🍉', accent: '#3f8a4f', iconKey: 'watermelon' } },
  { match: /cantaloupe|honeydew|muskmelon|melon/i, visual: { emoji: '🍈', accent: '#c2a64f', iconKey: 'cantaloupe' } },
  { match: /squash|gourd/i, visual: { emoji: '🎃', accent: '#d57a1f', iconKey: 'squash' } },

  // Roots
  { match: /carrot/i, visual: { emoji: '🥕', accent: '#d36a2c', iconKey: 'carrot' } },
  { match: /sweet potato|yam/i, visual: { emoji: '🍠', accent: '#a9522c', iconKey: 'sweetPotato' } },
  { match: /potato/i, visual: { emoji: '🥔', accent: '#a9826b', iconKey: 'potato' } },
  { match: /radish/i, visual: { emoji: '🌱', accent: '#c84b6e', iconKey: 'radish' } },
  { match: /beet/i, visual: { emoji: '🌱', accent: '#7a2c4a', iconKey: 'beet' } },
  { match: /turnip/i, visual: { emoji: '🌱', accent: '#a07d92', iconKey: 'turnip' } },
  { match: /parsnip/i, visual: { emoji: '🌱', accent: '#cdb89c', iconKey: 'parsnip' } },
  { match: /ginger/i, visual: { emoji: '🌱', accent: '#c2924a', iconKey: 'ginger' } },

  // Alliums
  { match: /onion/i, visual: { emoji: '🧅', accent: '#a9826b', iconKey: 'onion' } },
  { match: /garlic/i, visual: { emoji: '🧄', accent: '#cdb89c', iconKey: 'garlic' } },
  { match: /shallot/i, visual: { emoji: '🧅', accent: '#a9826b', iconKey: 'shallot' } },
  { match: /leek/i, visual: { emoji: '🌱', accent: '#5b8c4a', iconKey: 'leek' } },
  { match: /chive/i, visual: { emoji: '🌿', accent: '#446e3b', iconKey: 'chives' } },

  // Brassicas
  { match: /broccoli/i, visual: { emoji: '🥦', accent: '#436e3b', iconKey: 'broccoli' } },
  { match: /cauliflower/i, visual: { emoji: '🥦', accent: '#dccca0', iconKey: 'cauliflower' } },
  { match: /cabbage/i, visual: { emoji: '🥬', accent: '#5b8c4a', iconKey: 'cabbage' } },
  { match: /brussels/i, visual: { emoji: '🥬', accent: '#436e3b', iconKey: 'brusselsSprout' } },
  { match: /collard/i, visual: { emoji: '🥬', accent: '#446e3b', iconKey: 'collard' } },
  { match: /kale/i, visual: { emoji: '🥬', accent: '#446e3b', iconKey: 'kale' } },

  // Greens
  { match: /lettuce|salad/i, visual: { emoji: '🥬', accent: '#5b8c4a', iconKey: 'lettuce' } },
  { match: /spinach/i, visual: { emoji: '🥬', accent: '#446e3b', iconKey: 'spinach' } },
  { match: /chard|swiss chard/i, visual: { emoji: '🥬', accent: '#a23838', iconKey: 'chard' } },
  { match: /arugula|rocket/i, visual: { emoji: '🥬', accent: '#5b8c4a', iconKey: 'arugula' } },

  // Stalks
  { match: /asparagus/i, visual: { emoji: '🌱', accent: '#5b8c4a', iconKey: 'asparagus' } },
  { match: /celery/i, visual: { emoji: '🌱', accent: '#7ea35b', iconKey: 'celery' } },
  { match: /rhubarb/i, visual: { emoji: '🌱', accent: '#b54a52', iconKey: 'rhubarb' } },
  { match: /fennel/i, visual: { emoji: '🌿', accent: '#7ea35b', iconKey: 'fennel' } },
  { match: /artichoke/i, visual: { emoji: '🌱', accent: '#5b6e3b', iconKey: 'artichoke' } },
  { match: /okra/i, visual: { emoji: '🌱', accent: '#5b8c4a', iconKey: 'okra' } },

  // Grains
  { match: /corn|maize/i, visual: { emoji: '🌽', accent: '#d6a52c', iconKey: 'corn' } },
  { match: /wheat/i, visual: { emoji: '🌾', accent: '#b08a3d', iconKey: 'wheat' } },
  { match: /barley/i, visual: { emoji: '🌾', accent: '#b08a3d', iconKey: 'barley' } },
  { match: /\boat\b|oats/i, visual: { emoji: '🌾', accent: '#c2a064', iconKey: 'oat' } },
  { match: /rice/i, visual: { emoji: '🌾', accent: '#c9b58a', iconKey: 'rice' } },

  // Legumes
  { match: /chickpea|garbanzo/i, visual: { emoji: '🫘', accent: '#c2a064', iconKey: 'chickpea' } },
  { match: /lentil/i, visual: { emoji: '🫘', accent: '#7a533c', iconKey: 'lentil' } },
  { match: /soybean|soy bean/i, visual: { emoji: '🫛', accent: '#7a8a3c', iconKey: 'soybean' } },
  { match: /\bbean\b|beans/i, visual: { emoji: '🫘', accent: '#7a533c', iconKey: 'bean' } },
  { match: /\bpea\b|peas/i, visual: { emoji: '🌱', accent: '#5b8c4a', iconKey: 'pea' } },

  // Berries
  { match: /strawberry|strawberries/i, visual: { emoji: '🍓', accent: '#c1452f', iconKey: 'strawberry' } },
  { match: /blueberry|blueberries/i, visual: { emoji: '🫐', accent: '#5e4ea3', iconKey: 'blueberry' } },
  { match: /raspberry|raspberries/i, visual: { emoji: '🫐', accent: '#a23854', iconKey: 'raspberry' } },
  { match: /blackberry|blackberries/i, visual: { emoji: '🫐', accent: '#3a2244', iconKey: 'blackberry' } },
  { match: /berry|berries/i, visual: { emoji: '🫐', accent: '#5e4ea3', iconKey: 'berry' } },
  { match: /grape/i, visual: { emoji: '🍇', accent: '#5e4ea3', iconKey: 'grape' } },

  // Tree fruits
  { match: /apple/i, visual: { emoji: '🍎', accent: '#c1452f', iconKey: 'apple' } },
  { match: /pear/i, visual: { emoji: '🍐', accent: '#a8b04a', iconKey: 'pear' } },
  { match: /peach|nectarine/i, visual: { emoji: '🍑', accent: '#e0935b', iconKey: 'peach' } },
  { match: /plum/i, visual: { emoji: '🍑', accent: '#7a3a5b', iconKey: 'plum' } },
  { match: /cherry|cherries/i, visual: { emoji: '🍒', accent: '#a02035', iconKey: 'cherry' } },
  { match: /fig/i, visual: { emoji: '🍑', accent: '#7a3a5b', iconKey: 'fig' } },
  { match: /avocado/i, visual: { emoji: '🥑', accent: '#5b6e3b', iconKey: 'avocado' } },

  // Citrus
  { match: /lemon/i, visual: { emoji: '🍋', accent: '#d6c12c', iconKey: 'lemon' } },
  { match: /lime/i, visual: { emoji: '🍋', accent: '#7ea35b', iconKey: 'lime' } },
  { match: /orange|mandarin|tangerine/i, visual: { emoji: '🍊', accent: '#d6802c', iconKey: 'orange' } },

  // Herbs
  { match: /basil/i, visual: { emoji: '🌿', accent: '#446e3b', iconKey: 'basil' } },
  { match: /mint/i, visual: { emoji: '🌿', accent: '#3a7e5a', iconKey: 'mint' } },
  { match: /rosemary/i, visual: { emoji: '🌿', accent: '#5b7a55', iconKey: 'rosemary' } },
  { match: /thyme/i, visual: { emoji: '🌿', accent: '#608060', iconKey: 'thyme' } },
  { match: /parsley/i, visual: { emoji: '🌿', accent: '#446e3b', iconKey: 'parsley' } },
  { match: /cilantro|coriander/i, visual: { emoji: '🌿', accent: '#5b8c4a', iconKey: 'cilantro' } },
  { match: /sage/i, visual: { emoji: '🌿', accent: '#8a9a7a', iconKey: 'sage' } },
  { match: /oregano/i, visual: { emoji: '🌿', accent: '#608060', iconKey: 'oregano' } },
  { match: /dill/i, visual: { emoji: '🌿', accent: '#7ea35b', iconKey: 'dill' } },
  { match: /lavender/i, visual: { emoji: '🌸', accent: '#8a6ec0', iconKey: 'lavender' } },

  // Flowers
  { match: /sunflower/i, visual: { emoji: '🌻', accent: '#d6a52c', iconKey: 'sunflower' } },
  { match: /rose/i, visual: { emoji: '🌹', accent: '#c1452f', iconKey: 'rose' } },
  { match: /tulip/i, visual: { emoji: '🌷', accent: '#c97aab', iconKey: 'tulip' } },
  { match: /daisy|daisies/i, visual: { emoji: '🌼', accent: '#d6c12c', iconKey: 'daisy' } },
  { match: /marigold/i, visual: { emoji: '🌼', accent: '#d6802c', iconKey: 'marigold' } },

  // Fungi
  { match: /mushroom/i, visual: { emoji: '🍄', accent: '#a3654c', iconKey: 'mushroom' } },
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
