import { describe, expect, it } from 'vitest';
import { buildFirstSteps } from './firstSteps';
import type { GrowerCropItem } from '../../types/listing';

function crop(overrides: Partial<GrowerCropItem> = {}): GrowerCropItem {
  return {
    id: 'crop-1',
    userId: 'grower-1',
    canonicalId: null,
    cropName: 'Tomato',
    varietyId: null,
    status: 'growing',
    visibility: 'private',
    surplusEnabled: false,
    nickname: null,
    defaultUnit: null,
    notes: null,
    bedId: null,
    bedName: null,
    plantingDate: null,
    expectedHarvestDate: null,
    plantCount: null,
    spacingInches: null,
    pyramidTier: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

const empty = { homeZone: null, crops: [], bedCount: 0, reminderCount: 0 };

describe('buildFirstSteps', () => {
  it('opens every step for a grower with nothing on record', () => {
    const summary = buildFirstSteps(empty);

    expect(summary.steps.map((step) => step.id)).toEqual(['zone', 'plant', 'map', 'rhythm']);
    expect(summary.steps.every((step) => step.done)).toBe(false);
    expect(summary.completedCount).toBe(0);
    expect(summary.percentComplete).toBe(0);
    expect(summary.nextStep?.id).toBe('zone');
    expect(summary.allComplete).toBe(false);
  });

  it('completes steps from records rather than from a visited flag', () => {
    const summary = buildFirstSteps({
      homeZone: '8a',
      crops: [crop()],
      bedCount: 0,
      reminderCount: 0,
    });

    const byId = Object.fromEntries(summary.steps.map((step) => [step.id, step]));
    expect(byId.zone.done).toBe(true);
    expect(byId.plant.done).toBe(true);
    expect(byId.map.done).toBe(false);
    expect(byId.rhythm.done).toBe(false);
    expect(summary.completedCount).toBe(2);
    expect(summary.percentComplete).toBe(50);
    expect(summary.nextStep?.id).toBe('map');
  });

  it('ignores a blank growing zone', () => {
    const summary = buildFirstSteps({ ...empty, homeZone: '   ' });

    expect(summary.steps[0].done).toBe(false);
  });

  it('reports completion once all four steps are satisfied', () => {
    const summary = buildFirstSteps({
      homeZone: '9b',
      crops: [crop({ bedId: 'bed-1' })],
      bedCount: 1,
      reminderCount: 2,
    });

    expect(summary.allComplete).toBe(true);
    expect(summary.nextStep).toBeNull();
    expect(summary.percentComplete).toBe(100);
  });

  it('sends the grower to the add-plant form only while the garden is empty', () => {
    expect(buildFirstSteps(empty).steps[1].to).toBe('/garden/plants/new');
    expect(buildFirstSteps({ ...empty, crops: [crop()] }).steps[1].to).toBe('/garden/plants');
  });

  it('summarises what is already on record in the done notes', () => {
    const summary = buildFirstSteps({
      homeZone: '8a',
      crops: [crop({ id: 'a', bedId: 'bed-1' }), crop({ id: 'b' })],
      bedCount: 1,
      reminderCount: 1,
    });

    const byId = Object.fromEntries(summary.steps.map((step) => [step.id, step]));
    expect(byId.zone.doneNote).toContain('Zone 8a');
    expect(byId.plant.doneNote).toBe('2 plants are in your garden.');
    expect(byId.map.doneNote).toBe('1 space mapped, with 1 planted.');
    expect(byId.rhythm.doneNote).toBe('1 reminder is keeping watch.');
  });
});
