// "Grow more of your own" is a library of practices that make a garden feed
// its household further: composting, seed saving, succession sowing, keeping a
// harvest, and so on.
//
// Deliberate posture: this is a shelf of opportunities, not a program. There is
// no score, no completion tracking, and no target percentage of a household's
// food — self-sufficiency is a direction some growers enjoy heading, not the
// point of the product. Everything here is optional, and the copy says so.

import type { GrowerCropItem } from '../../types/listing';
import type { SeasonId } from '../Seasonality/seasonality';

export type PracticeTheme = 'soil' | 'seed' | 'water' | 'season' | 'keep' | 'wild';

export interface GrowMorePractice {
  id: string;
  title: string;
  theme: PracticeTheme;
  /** One-line description of the practice. */
  summary: string;
  /** How it actually works, in a couple of plain sentences. */
  detail: string;
  /** What it opens up for the grower — an opportunity, never a target. */
  opportunity: string;
  /** The smallest useful way to begin. */
  firstStep: string;
  /** Rough commitment, so nothing looks bigger than it is. */
  effort: string;
  /** Seasons where the practice is timely. */
  seasons: readonly SeasonId[];
  /** Crops already in the garden that make this practice especially handy. */
  cropMatch?: RegExp;
  link?: { label: string; to: string };
}

export const PRACTICE_THEMES: Record<PracticeTheme, { label: string; accent: string }> = {
  soil: { label: 'Soil', accent: '#7a533c' },
  seed: { label: 'Seed', accent: '#426b3f' },
  water: { label: 'Water', accent: '#3f6b6b' },
  season: { label: 'Season', accent: '#a8681f' },
  keep: { label: 'Keeping', accent: '#a3527e' },
  wild: { label: 'Wildlife', accent: '#6f8f5f' },
};

export const GROW_MORE_PRACTICES: readonly GrowMorePractice[] = [
  {
    id: 'compost',
    title: 'Compost what the garden gives back',
    theme: 'soil',
    summary: 'Turn kitchen scraps and spent plants into next season’s soil.',
    detail:
      'Alternate wet green material (scraps, fresh trimmings) with dry brown material (leaves, straw, cardboard), keep it about as damp as a wrung-out sponge, and turn it when you think of it. A pile started now is usable in three to six months.',
    opportunity:
      'Fewer bags of soil to buy, somewhere for garden waste to go, and beds that hold water better each year.',
    firstStep: 'Pick a corner and start a pile — a bin is optional, a heap works.',
    effort: 'An afternoon to start, minutes a week after',
    seasons: ['spring', 'summer', 'fall', 'winter'],
  },
  {
    id: 'eat-what-you-grow',
    title: 'Grow a little more of what you already eat',
    theme: 'seed',
    summary: 'Aim the garden at your actual grocery list rather than at variety for its own sake.',
    detail:
      'Look at what your household buys most weeks and see which of those you could grow a share of. The garden pyramid in your plan sorts crops from staples up to treats, which makes the gaps easy to spot.',
    opportunity:
      'The same effort covers more of your meals, and the harvest arrives as food you were going to eat anyway.',
    firstStep: 'Open your plan and add one crop from a layer you have not touched yet.',
    effort: '10 minutes of planning',
    seasons: ['spring', 'summer', 'fall', 'winter'],
    link: { label: 'Open your plan', to: '/garden/plan' },
  },
  {
    id: 'succession',
    title: 'Sow a little, often',
    theme: 'seed',
    summary: 'Stagger small sowings instead of planting a whole bed at once.',
    detail:
      'Fast crops like lettuce, radishes, bush beans, spinach, and cilantro finish within weeks. Sowing a short row every two or three weeks spreads the harvest across the season instead of dropping it all in one glut.',
    opportunity: 'Steady picking for months, and less produce than you can eat all arriving at once.',
    firstStep: 'Sow half a row now and set a reminder to sow the rest in two weeks.',
    effort: '15 minutes per sowing',
    seasons: ['spring', 'summer', 'fall'],
    cropMatch: /lettuce|radish|spinach|bean|carrot|cilantro|arugula|salad|kale|chard/i,
    link: { label: 'Set a sowing reminder', to: '/today/reminders' },
  },
  {
    id: 'save-seed',
    title: 'Save seed from a favorite plant',
    theme: 'seed',
    summary: 'Keep seed from the plants that did best in your garden.',
    detail:
      'Open-pollinated and heirloom varieties come back true from saved seed; hybrids (labelled F1) will not. Beans, peas, lettuce, tomatoes, and peppers are the friendliest to start with — let the fruit or pod mature fully, dry the seed thoroughly, and store it somewhere cool and dark.',
    opportunity:
      'Free seed next year, from the plants that already proved they like your soil and your weather.',
    firstStep: 'Mark one healthy plant now and leave it to mature instead of harvesting it.',
    effort: 'A few minutes at harvest, an hour to clean and dry',
    seasons: ['summer', 'fall'],
    cropMatch: /tomato|bean|pea|pepper|lettuce|basil|dill|cilantro|squash|okra/i,
    link: { label: 'Note it in your journal', to: '/garden/journal' },
  },
  {
    id: 'feed-the-soil',
    title: 'Cover the soil between crops',
    theme: 'soil',
    summary: 'Mulch or a cover crop keeps empty beds working instead of resting bare.',
    detail:
      'A few inches of straw, leaves, or wood chips protects soil life through cold and heat. In beds you will not use for a couple of months, a cover crop like crimson clover, field peas, or cereal rye holds the soil together and feeds it when cut down before it sets seed.',
    opportunity: 'Better soil each season, fewer weeds, and less watering the following year.',
    firstStep: 'Mulch one bed you have just cleared.',
    effort: 'An hour per bed',
    seasons: ['fall', 'winter', 'spring'],
  },
  {
    id: 'water-wise',
    title: 'Water deeply, less often',
    theme: 'water',
    summary: 'Fewer, longer waterings build deeper roots than a daily sprinkle.',
    detail:
      'Water at the base of plants in the morning until the soil is damp several inches down, then wait until the top inch dries before watering again. Mulch on top slows evaporation, and drip lines or soaker hoses put water where roots are instead of on leaves.',
    opportunity: 'Plants that cope with a hot week, lower water bills, and less leaf disease.',
    firstStep: 'Check moisture with a finger before the next watering instead of watering on schedule.',
    effort: 'Free — it is a change of habit',
    seasons: ['spring', 'summer'],
  },
  {
    id: 'season-extension',
    title: 'Stretch the season at both ends',
    theme: 'season',
    summary: 'Simple cover buys weeks of growing on either side of frost.',
    detail:
      'Row cover, a cold frame, a low tunnel, or even a sheet on frost nights protects hardy greens and roots well past the first freeze, and lets tender crops go out earlier in spring. Cold-hardy crops like kale, spinach, and carrots often sweeten after frost.',
    opportunity: 'Fresh food from the garden in months it would otherwise be empty.',
    firstStep: 'Keep one old sheet or piece of row cover by the door for the first frost warning.',
    effort: 'An hour to set up',
    seasons: ['fall', 'winter', 'spring'],
  },
  {
    id: 'keep-the-harvest',
    title: 'Keep more of what comes in',
    theme: 'keep',
    summary: 'Freezing, drying, curing, and fermenting stretch a harvest past its week.',
    detail:
      'Most vegetables freeze well after a short blanching; herbs dry in a paper bag; onions, garlic, and winter squash cure and then store for months in a cool, dry spot; cucumbers and cabbage ferment with little more than salt. Start with whatever you have most of.',
    opportunity: 'A summer harvest that turns up on the table in January.',
    firstStep: 'Freeze one batch of whatever you are picking most of this week.',
    effort: 'An evening',
    seasons: ['summer', 'fall'],
    link: { label: 'More than you can keep? Share it', to: '/share' },
  },
  {
    id: 'propagate',
    title: 'Make new plants from the ones you have',
    theme: 'seed',
    summary: 'Cuttings, divisions, and offsets multiply plants without buying any.',
    detail:
      'Basil, mint, rosemary, and tomatoes root from cuttings in water or damp soil. Clumping herbs, rhubarb, and strawberries can be divided or grown on from runners. Potatoes and garlic replant straight from the healthiest of your own harvest.',
    opportunity: 'More plants for free, and backups of the ones that thrive for you.',
    firstStep: 'Put a basil or mint cutting in a glass of water on the windowsill.',
    effort: '10 minutes',
    seasons: ['spring', 'summer'],
    cropMatch: /basil|mint|rosemary|thyme|sage|oregano|strawberr|potato|garlic/i,
  },
  {
    id: 'perennials',
    title: 'Plant something that comes back',
    theme: 'season',
    summary: 'Perennial food is planted once and harvested for years.',
    detail:
      'Asparagus, rhubarb, berry canes, fruit trees, and hardy herbs take a season or two to establish and then produce with far less work than annual beds. A corner or an edge that is awkward to till is often the perfect place for them.',
    opportunity: 'Harvests that arrive every year whether or not you had time to plant in spring.',
    firstStep: 'Pick one edge of the garden and plant a berry bush or a perennial herb there.',
    effort: 'A morning to plant, little after',
    seasons: ['spring', 'fall'],
    link: { label: 'Add it to your garden', to: '/garden/plants/new' },
  },
  {
    id: 'invite-help',
    title: 'Invite pollinators and pest allies in',
    theme: 'wild',
    summary: 'Flowers and shelter bring in the insects that do the work for you.',
    detail:
      'A patch of flowering plants — dill, cilantro left to bolt, borage, zinnias, marigolds, alyssum — feeds bees and the predatory insects that keep aphids and caterpillars in check. Leaving a little leaf litter and a shallow water dish gives them somewhere to live.',
    opportunity: 'Better fruit set on squash, cucumbers, and beans, and fewer pests to handle yourself.',
    firstStep: 'Let one cilantro or dill plant flower instead of pulling it.',
    effort: 'One packet of seed',
    seasons: ['spring', 'summer'],
    cropMatch: /squash|zucchini|cucumber|melon|bean|pepper|tomato|dill|cilantro/i,
  },
] as const;

export interface TimelyPractice {
  practice: GrowMorePractice;
  /** Plain-language reason this one surfaced now. */
  reason: string;
}

export interface GrowMoreSelection {
  season: SeasonId;
  /** A few practices that suit the current season and garden. */
  timely: TimelyPractice[];
  /** Everything else, in library order. */
  rest: GrowMorePractice[];
}

const SEASON_LABELS: Record<SeasonId, string> = {
  spring: 'spring',
  summer: 'summer',
  fall: 'fall',
  winter: 'winter',
};

function matchedCropNames(practice: GrowMorePractice, crops: readonly GrowerCropItem[]): string[] {
  if (!practice.cropMatch) return [];
  const names = new Set<string>();
  for (const crop of crops) {
    if (practice.cropMatch.test(crop.cropName)) {
      names.add(crop.cropName.trim());
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

function reasonFor(season: SeasonId, matches: readonly string[]): string {
  const seasonReason = `Timely in ${SEASON_LABELS[season]}`;
  if (matches.length === 0) return seasonReason;
  if (matches.length === 1) return `${seasonReason} — you are growing ${matches[0]}`;
  return `${seasonReason} — you are growing ${matches[0]} and ${matches[1]}`;
}

/**
 * Pick a small set of practices that fit the current season, preferring ones
 * that touch crops already in the garden. Everything not surfaced stays
 * available in `rest` — nothing is hidden, only ordered.
 */
export function selectGrowMorePractices({
  season,
  crops = [],
  limit = 3,
}: {
  season: SeasonId;
  crops?: readonly GrowerCropItem[];
  limit?: number;
}): GrowMoreSelection {
  const scored = GROW_MORE_PRACTICES.map((practice, index) => {
    const matches = matchedCropNames(practice, crops);
    return { practice, index, matches, inSeason: practice.seasons.includes(season) };
  });

  const timely = scored
    .filter((entry) => entry.inSeason)
    // Crop matches first, then library order, so the result is deterministic.
    .sort((left, right) => right.matches.length - left.matches.length || left.index - right.index)
    .slice(0, limit)
    .map((entry) => ({
      practice: entry.practice,
      reason: reasonFor(season, entry.matches),
    }));

  const timelyIds = new Set(timely.map((entry) => entry.practice.id));

  return {
    season,
    timely,
    rest: GROW_MORE_PRACTICES.filter((practice) => !timelyIds.has(practice.id)),
  };
}
