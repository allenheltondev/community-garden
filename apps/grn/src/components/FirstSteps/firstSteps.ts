// The first hour in Good Roots is the hardest to guess your way through: the
// app is happiest once it knows where you grow, what you planted, and roughly
// where those plants live. This module turns that into four small, concrete
// steps derived from real records — never from a "did the user click it?" flag —
// so the checklist stays honest if a grower sets things up out of order, on
// another device, or long after signing up.

import type { GrowerCropItem } from '../../types/listing';

export type FirstStepId = 'zone' | 'plant' | 'map' | 'rhythm';

export interface FirstStep {
  id: FirstStepId;
  /** Short imperative title. */
  title: string;
  /** Why this helps — shown while the step is still open. */
  body: string;
  /** Confirmation copy shown once the step is satisfied. */
  doneNote: string;
  /** Label for the button that takes the grower to the step. */
  cta: string;
  /** Label used once the step is complete (revisiting is always allowed). */
  doneCta: string;
  to: string;
  done: boolean;
}

export interface FirstStepsInput {
  homeZone?: string | null;
  crops: GrowerCropItem[];
  bedCount: number;
  reminderCount: number;
}

export interface FirstStepsSummary {
  steps: FirstStep[];
  completedCount: number;
  totalCount: number;
  /** Percentage complete, rounded, for the progress meter. */
  percentComplete: number;
  /** The first step still open, or null when everything is done. */
  nextStep: FirstStep | null;
  allComplete: boolean;
}

/**
 * Build the getting-started checklist. Steps are ordered by what unlocks the
 * most for the grower, but any of them can be done first — nothing here gates
 * access to the rest of the app.
 */
export function buildFirstSteps({
  homeZone,
  crops,
  bedCount,
  reminderCount,
}: FirstStepsInput): FirstStepsSummary {
  const hasZone = Boolean(homeZone?.trim());
  const plantCount = crops.length;
  const placedCount = crops.filter((crop) => Boolean(crop.bedId)).length;

  const steps: FirstStep[] = [
    {
      id: 'zone',
      title: 'Set your growing zone',
      body: 'Your zone is what makes planting windows, seasonal ideas, and timing advice local to you. Set it in Settings, along with your address.',
      doneNote: hasZone
        ? `Zone ${homeZone?.trim()} — Today and the planner now speak in your season.`
        : 'Your zone is saved.',
      cta: 'Set your zone',
      doneCta: 'Review zone',
      to: '/settings#profile',
      done: hasZone,
    },
    {
      id: 'plant',
      title: 'Add something you are growing',
      body: 'One plant is enough to start. Today builds its suggestions from what is actually in your garden.',
      doneNote:
        plantCount === 1
          ? '1 plant is in your garden.'
          : `${plantCount} plants are in your garden.`,
      cta: 'Add a plant',
      doneCta: 'Open plants',
      to: plantCount === 0 ? '/garden/plants/new' : '/garden/plants',
      done: plantCount > 0,
    },
    {
      id: 'map',
      title: 'Sketch where things grow',
      body: 'Draw a bed, a pot, or a row. A rough map is enough to keep track of what is planted where.',
      doneNote:
        placedCount > 0
          ? `${bedCount} ${bedCount === 1 ? 'space' : 'spaces'} mapped, with ${placedCount} planted.`
          : `${bedCount} ${bedCount === 1 ? 'space' : 'spaces'} mapped. Assign plants to them whenever you like.`,
      cta: 'Open the map',
      doneCta: 'Open the map',
      to: '/garden',
      done: bedCount > 0,
    },
    {
      id: 'rhythm',
      title: 'Set one reminder',
      body: 'Watering, checking in, or looking for the first harvest — a single reminder keeps the garden on your radar.',
      doneNote:
        reminderCount === 1
          ? '1 reminder is keeping watch.'
          : `${reminderCount} reminders are keeping watch.`,
      cta: 'Add a reminder',
      doneCta: 'Open reminders',
      to: '/today/reminders',
      done: reminderCount > 0,
    },
  ];

  const completedCount = steps.filter((step) => step.done).length;

  return {
    steps,
    completedCount,
    totalCount: steps.length,
    percentComplete: Math.round((completedCount / steps.length) * 100),
    nextStep: steps.find((step) => !step.done) ?? null,
    allComplete: completedCount === steps.length,
  };
}
