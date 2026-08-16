export type SeasonId = 'spring' | 'summer' | 'fall' | 'winter';

export type ClimateBand = 'short-season' | 'temperate' | 'warm' | 'hot';

export type PlantingAction =
  | 'start-indoors'
  | 'direct-sow'
  | 'transplant'
  | 'plant-cloves'
  | 'plant-slips'
  | 'tend-now'
  | 'plan-ahead';

type CropId =
  | 'basil'
  | 'beets'
  | 'broccoli'
  | 'bush-beans'
  | 'carrots'
  | 'cucumber'
  | 'eggplant'
  | 'garlic'
  | 'herbs'
  | 'kale'
  | 'lettuce'
  | 'okra'
  | 'onions'
  | 'peas'
  | 'peppers'
  | 'potatoes'
  | 'radishes'
  | 'southern-peas'
  | 'spinach'
  | 'squash'
  | 'sweet-potatoes'
  | 'swiss-chard'
  | 'tomatoes';

interface CropDefinition {
  name: string;
  why: string;
}

type CropPlan = readonly [cropId: CropId, action: PlantingAction];

export interface SeasonalSuggestion {
  cropName: string;
  action: PlantingAction;
  actionLabel: string;
  why: string;
}

export interface SeasonalGuideData {
  season: SeasonId;
  climateBand: ClimateBand;
  zone: string;
  monthName: string;
  title: string;
  summary: string;
  suggestions: SeasonalSuggestion[];
}

const CROP_DEFINITIONS: Record<CropId, CropDefinition> = {
  basil: {
    name: 'Basil',
    why: 'Warm soil and regular picking keep this kitchen herb producing.',
  },
  beets: {
    name: 'Beets',
    why: 'Cooler soil supports tender roots, and the greens are useful too.',
  },
  broccoli: {
    name: 'Broccoli',
    why: 'A protected start now can set up sturdy plants for cooler weather.',
  },
  'bush-beans': {
    name: 'Bush beans',
    why: 'They mature quickly in warm soil and fit easily into small garden gaps.',
  },
  carrots: {
    name: 'Carrots',
    why: 'Even moisture and cooling soil help roots grow straight and sweet.',
  },
  cucumber: {
    name: 'Cucumber',
    why: 'Warm soil and a simple trellis can turn a small space into a steady harvest.',
  },
  eggplant: {
    name: 'Eggplant',
    why: 'Long, warm days help these heat-loving plants flower and set fruit.',
  },
  garlic: {
    name: 'Garlic',
    why: 'A cool-season start gives cloves time to root before spring growth.',
  },
  herbs: {
    name: 'Kitchen herbs',
    why: 'A sunny windowsill or protected bed keeps fresh flavor close at hand.',
  },
  kale: {
    name: 'Kale',
    why: 'This sturdy green handles cool weather and becomes sweeter after a light frost.',
  },
  lettuce: {
    name: 'Leaf lettuce',
    why: 'Fast-growing leaves make good use of mild weather and shorter days.',
  },
  okra: {
    name: 'Okra',
    why: 'Hot soil and long days are exactly what this resilient crop prefers.',
  },
  onions: {
    name: 'Onions',
    why: 'An early start gives seedlings time to build size before bulb formation.',
  },
  peas: {
    name: 'Garden peas',
    why: 'Cool soil and a light trellis support tender shoots and an early harvest.',
  },
  peppers: {
    name: 'Peppers',
    why: 'Consistent warmth helps transplants settle in and keep setting fruit.',
  },
  potatoes: {
    name: 'Potatoes',
    why: 'Mild soil gives seed potatoes time to establish before stronger heat arrives.',
  },
  radishes: {
    name: 'Radishes',
    why: 'These quick roots are a low-friction way to use a short cool-weather window.',
  },
  'southern-peas': {
    name: 'Southern peas',
    why: 'They tolerate heat well and keep growing when many cool-season crops slow down.',
  },
  spinach: {
    name: 'Spinach',
    why: 'Cool conditions support tender leaves and delay premature flowering.',
  },
  squash: {
    name: 'Summer squash',
    why: 'Warm soil supports fast growth and an early, generous harvest.',
  },
  'sweet-potatoes': {
    name: 'Sweet potatoes',
    why: 'Slips thrive once the soil is warm and have time to fill out before cool weather.',
  },
  'swiss-chard': {
    name: 'Swiss chard',
    why: 'This resilient leafy green tolerates more warmth than spinach or lettuce.',
  },
  tomatoes: {
    name: 'Tomatoes',
    why: 'Warm nights and steady sun help established plants flower and ripen fruit.',
  },
};

const ACTION_LABELS: Record<PlantingAction, string> = {
  'start-indoors': 'Start indoors',
  'direct-sow': 'Direct sow',
  transplant: 'Transplant',
  'plant-cloves': 'Plant cloves',
  'plant-slips': 'Plant slips',
  'tend-now': 'Sow or tend',
  'plan-ahead': 'Plan ahead',
};

// The monthly plans are intentionally broad starting points. A hardiness zone
// describes winter cold, not an exact planting date, so the UI always reminds
// growers to account for local frost, weather, shade, and microclimates.
const MONTHLY_PLANS: Record<ClimateBand, readonly (readonly CropPlan[])[]> = {
  'short-season': [
    [['onions', 'start-indoors'], ['broccoli', 'start-indoors'], ['herbs', 'start-indoors'], ['lettuce', 'start-indoors'], ['kale', 'start-indoors']],
    [['onions', 'start-indoors'], ['broccoli', 'start-indoors'], ['kale', 'start-indoors'], ['lettuce', 'start-indoors'], ['herbs', 'start-indoors']],
    [['peas', 'direct-sow'], ['spinach', 'direct-sow'], ['radishes', 'direct-sow'], ['broccoli', 'start-indoors'], ['lettuce', 'start-indoors']],
    [['carrots', 'direct-sow'], ['beets', 'direct-sow'], ['lettuce', 'direct-sow'], ['peas', 'direct-sow'], ['kale', 'direct-sow']],
    [['bush-beans', 'direct-sow'], ['cucumber', 'start-indoors'], ['squash', 'transplant'], ['basil', 'transplant'], ['tomatoes', 'transplant']],
    [['bush-beans', 'direct-sow'], ['cucumber', 'direct-sow'], ['swiss-chard', 'direct-sow'], ['squash', 'direct-sow'], ['basil', 'transplant']],
    [['bush-beans', 'direct-sow'], ['swiss-chard', 'direct-sow'], ['kale', 'start-indoors'], ['broccoli', 'start-indoors'], ['radishes', 'plan-ahead']],
    [['spinach', 'direct-sow'], ['radishes', 'direct-sow'], ['kale', 'direct-sow'], ['lettuce', 'direct-sow'], ['carrots', 'direct-sow']],
    [['garlic', 'plan-ahead'], ['spinach', 'direct-sow'], ['radishes', 'direct-sow'], ['kale', 'transplant'], ['peas', 'direct-sow']],
    [['garlic', 'plant-cloves'], ['kale', 'tend-now'], ['spinach', 'tend-now'], ['herbs', 'start-indoors'], ['lettuce', 'start-indoors']],
    [['garlic', 'plant-cloves'], ['herbs', 'start-indoors'], ['lettuce', 'start-indoors'], ['kale', 'tend-now'], ['onions', 'plan-ahead']],
    [['herbs', 'start-indoors'], ['onions', 'plan-ahead'], ['broccoli', 'plan-ahead'], ['lettuce', 'start-indoors'], ['kale', 'start-indoors']],
  ],
  temperate: [
    [['onions', 'start-indoors'], ['broccoli', 'start-indoors'], ['kale', 'start-indoors'], ['lettuce', 'start-indoors'], ['herbs', 'start-indoors']],
    [['peas', 'direct-sow'], ['lettuce', 'direct-sow'], ['radishes', 'direct-sow'], ['spinach', 'direct-sow'], ['broccoli', 'transplant']],
    [['carrots', 'direct-sow'], ['beets', 'direct-sow'], ['broccoli', 'transplant'], ['kale', 'direct-sow'], ['peas', 'direct-sow']],
    [['bush-beans', 'direct-sow'], ['cucumber', 'start-indoors'], ['squash', 'transplant'], ['basil', 'transplant'], ['tomatoes', 'transplant']],
    [['tomatoes', 'transplant'], ['peppers', 'transplant'], ['basil', 'transplant'], ['bush-beans', 'direct-sow'], ['cucumber', 'direct-sow']],
    [['bush-beans', 'direct-sow'], ['okra', 'direct-sow'], ['swiss-chard', 'direct-sow'], ['basil', 'tend-now'], ['cucumber', 'direct-sow']],
    [['swiss-chard', 'direct-sow'], ['bush-beans', 'direct-sow'], ['broccoli', 'start-indoors'], ['kale', 'start-indoors'], ['southern-peas', 'direct-sow']],
    [['kale', 'direct-sow'], ['carrots', 'direct-sow'], ['beets', 'direct-sow'], ['radishes', 'direct-sow'], ['broccoli', 'transplant']],
    [['lettuce', 'direct-sow'], ['radishes', 'direct-sow'], ['spinach', 'direct-sow'], ['kale', 'direct-sow'], ['carrots', 'direct-sow']],
    [['garlic', 'plant-cloves'], ['kale', 'direct-sow'], ['spinach', 'direct-sow'], ['onions', 'direct-sow'], ['lettuce', 'direct-sow']],
    [['garlic', 'plant-cloves'], ['spinach', 'tend-now'], ['kale', 'tend-now'], ['herbs', 'start-indoors'], ['lettuce', 'start-indoors']],
    [['herbs', 'start-indoors'], ['onions', 'start-indoors'], ['broccoli', 'start-indoors'], ['kale', 'start-indoors'], ['lettuce', 'start-indoors']],
  ],
  warm: [
    [['lettuce', 'direct-sow'], ['peas', 'direct-sow'], ['carrots', 'direct-sow'], ['spinach', 'direct-sow'], ['radishes', 'direct-sow']],
    [['broccoli', 'transplant'], ['potatoes', 'direct-sow'], ['beets', 'direct-sow'], ['carrots', 'direct-sow'], ['peas', 'direct-sow']],
    [['tomatoes', 'transplant'], ['bush-beans', 'direct-sow'], ['cucumber', 'direct-sow'], ['squash', 'transplant'], ['basil', 'transplant']],
    [['okra', 'direct-sow'], ['squash', 'direct-sow'], ['basil', 'transplant'], ['southern-peas', 'direct-sow'], ['sweet-potatoes', 'plant-slips']],
    [['okra', 'direct-sow'], ['southern-peas', 'direct-sow'], ['sweet-potatoes', 'plant-slips'], ['basil', 'transplant'], ['swiss-chard', 'direct-sow']],
    [['okra', 'direct-sow'], ['southern-peas', 'direct-sow'], ['swiss-chard', 'direct-sow'], ['basil', 'tend-now'], ['sweet-potatoes', 'tend-now']],
    [['okra', 'tend-now'], ['southern-peas', 'direct-sow'], ['broccoli', 'start-indoors'], ['kale', 'start-indoors'], ['tomatoes', 'plan-ahead']],
    [['broccoli', 'start-indoors'], ['kale', 'start-indoors'], ['carrots', 'plan-ahead'], ['bush-beans', 'direct-sow'], ['cucumber', 'direct-sow']],
    [['kale', 'transplant'], ['radishes', 'direct-sow'], ['broccoli', 'transplant'], ['lettuce', 'direct-sow'], ['spinach', 'plan-ahead']],
    [['spinach', 'direct-sow'], ['lettuce', 'direct-sow'], ['carrots', 'direct-sow'], ['garlic', 'plant-cloves'], ['onions', 'direct-sow']],
    [['garlic', 'plant-cloves'], ['onions', 'direct-sow'], ['peas', 'direct-sow'], ['spinach', 'direct-sow'], ['radishes', 'direct-sow']],
    [['lettuce', 'direct-sow'], ['spinach', 'direct-sow'], ['radishes', 'direct-sow'], ['carrots', 'direct-sow'], ['peas', 'direct-sow']],
  ],
  hot: [
    [['tomatoes', 'transplant'], ['peppers', 'transplant'], ['lettuce', 'direct-sow'], ['radishes', 'direct-sow'], ['carrots', 'direct-sow']],
    [['bush-beans', 'direct-sow'], ['cucumber', 'direct-sow'], ['basil', 'transplant'], ['tomatoes', 'transplant'], ['peppers', 'transplant']],
    [['sweet-potatoes', 'plant-slips'], ['okra', 'direct-sow'], ['eggplant', 'transplant'], ['southern-peas', 'direct-sow'], ['basil', 'transplant']],
    [['okra', 'direct-sow'], ['peppers', 'transplant'], ['southern-peas', 'direct-sow'], ['sweet-potatoes', 'plant-slips'], ['swiss-chard', 'direct-sow']],
    [['sweet-potatoes', 'plant-slips'], ['okra', 'direct-sow'], ['southern-peas', 'direct-sow'], ['swiss-chard', 'direct-sow'], ['basil', 'tend-now']],
    [['okra', 'tend-now'], ['sweet-potatoes', 'tend-now'], ['southern-peas', 'direct-sow'], ['swiss-chard', 'direct-sow'], ['eggplant', 'tend-now']],
    [['swiss-chard', 'direct-sow'], ['sweet-potatoes', 'tend-now'], ['okra', 'tend-now'], ['tomatoes', 'start-indoors'], ['peppers', 'start-indoors']],
    [['eggplant', 'transplant'], ['peppers', 'transplant'], ['basil', 'direct-sow'], ['bush-beans', 'direct-sow'], ['cucumber', 'direct-sow']],
    [['tomatoes', 'transplant'], ['cucumber', 'direct-sow'], ['bush-beans', 'direct-sow'], ['basil', 'transplant'], ['squash', 'direct-sow']],
    [['lettuce', 'direct-sow'], ['kale', 'direct-sow'], ['radishes', 'direct-sow'], ['broccoli', 'transplant'], ['carrots', 'direct-sow']],
    [['carrots', 'direct-sow'], ['peas', 'direct-sow'], ['spinach', 'direct-sow'], ['lettuce', 'direct-sow'], ['radishes', 'direct-sow']],
    [['lettuce', 'direct-sow'], ['tomatoes', 'transplant'], ['peppers', 'transplant'], ['spinach', 'direct-sow'], ['carrots', 'direct-sow']],
  ],
};

const SEASON_SUMMARIES: Record<ClimateBand, Record<SeasonId, string>> = {
  'short-season': {
    spring: 'The garden is waking up. Cool-weather crops can begin while tender plants stay protected.',
    summer: 'Long days make every week count. Quick crops and fall starts can share the garden.',
    fall: 'Cool-weather crops return as the first frost approaches.',
    winter: 'This quieter stretch is useful for protected growing and planning the next thaw.',
  },
  temperate: {
    spring: 'Warming soil opens a wide planting window, with tender crops following the last frost.',
    summer: 'Warm soil supports fast growth while fall crops get an early start.',
    fall: 'Cooling days favor roots, greens, and crops that tolerate a light frost.',
    winter: 'Protected starts and cold-hardy crops keep the next season moving.',
  },
  warm: {
    spring: 'The warm-season window is opening, and heat-loving crops can begin to take over.',
    summer: 'Heat-loving crops take the lead while fall vegetables begin in protected spots.',
    fall: 'Milder days bring leafy greens, roots, and brassicas back into the garden.',
    winter: 'Cool-season growing weather makes this a productive time for greens and roots.',
  },
  hot: {
    spring: 'Warmth arrives early, giving long-season crops plenty of time to settle in.',
    summer: 'Heat-tolerant crops carry the garden while tender fall starts stay protected.',
    fall: 'Gentler temperatures reopen the garden to beans, roots, and leafy crops.',
    winter: 'Mild days support an active garden of greens, roots, and tender transplants.',
  },
};

const SEASON_TITLES: Record<SeasonId, readonly [string, string, string]> = {
  spring: ['Early spring', 'Mid-spring', 'Late spring'],
  summer: ['Early summer', 'High summer', 'Late summer'],
  fall: ['Early fall', 'Mid-fall', 'Late fall'],
  winter: ['Early winter', 'Deep winter', 'Late winter'],
};

export function parseHardinessZone(value?: string | null): { number: number; label: string } | null {
  const match = value?.trim().toLowerCase().match(/^(\d{1,2})([ab])?$/);
  if (!match) return null;
  const number = Number(match[1]);
  if (number < 1 || number > 13) return null;
  return { number, label: `${number}${match[2] ?? ''}` };
}

function climateBandForZone(zone: number): ClimateBand {
  if (zone <= 5) return 'short-season';
  if (zone <= 7) return 'temperate';
  if (zone <= 9) return 'warm';
  return 'hot';
}

function seasonForMonth(month: number): { season: SeasonId; phase: number } {
  if (month === 11) return { season: 'winter', phase: 0 };
  if (month <= 1) return { season: 'winter', phase: month + 1 };
  if (month <= 4) return { season: 'spring', phase: month - 2 };
  if (month <= 7) return { season: 'summer', phase: month - 5 };
  return { season: 'fall', phase: month - 8 };
}

function monthName(date: Date, locale?: string | null): string {
  try {
    return new Intl.DateTimeFormat(locale || 'en-US', { month: 'long' }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date);
  }
}

/**
 * Resolve the grower's current season from the calendar date, flipping the
 * calendar for southern-hemisphere gardens. Unlike `buildSeasonalGuide` this
 * needs no hardiness zone, so surfaces that are useful before a zone is saved
 * (or without one at all) can still speak in seasons.
 */
export function resolveSeason(input: { lat?: number | null; date?: Date }): SeasonId {
  const date = input.date ?? new Date();
  const isSouthernHemisphere = typeof input.lat === 'number' && input.lat < 0;
  const seasonalMonth = isSouthernHemisphere ? (date.getMonth() + 6) % 12 : date.getMonth();
  return seasonForMonth(seasonalMonth).season;
}

export function buildSeasonalGuide(input: {
  homeZone?: string | null;
  lat?: number | null;
  locale?: string | null;
  date?: Date;
}): SeasonalGuideData | null {
  const parsedZone = parseHardinessZone(input.homeZone);
  if (!parsedZone) return null;

  const date = input.date ?? new Date();
  const calendarMonth = date.getMonth();
  const isSouthernHemisphere = typeof input.lat === 'number' && input.lat < 0;
  const seasonalMonth = isSouthernHemisphere ? (calendarMonth + 6) % 12 : calendarMonth;
  const { season, phase } = seasonForMonth(seasonalMonth);
  const climateBand = climateBandForZone(parsedZone.number);
  const suggestions = MONTHLY_PLANS[climateBand][seasonalMonth].slice(0, 3).map(([cropId, action]) => ({
    cropName: CROP_DEFINITIONS[cropId].name,
    action,
    actionLabel: ACTION_LABELS[action],
    why: CROP_DEFINITIONS[cropId].why,
  }));

  return {
    season,
    climateBand,
    zone: parsedZone.label,
    monthName: monthName(date, input.locale),
    title: `${SEASON_TITLES[season][phase]} in Zone ${parsedZone.label}`,
    summary: SEASON_SUMMARIES[climateBand][season],
    suggestions,
  };
}
