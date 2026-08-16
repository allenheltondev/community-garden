import { describe, expect, it } from 'vitest';
import {
  GROW_MORE_PRACTICES,
  PRACTICE_THEMES,
  selectGrowMorePractices,
} from './growMorePractices';
import type { GrowerCropItem } from '../../types/listing';

function crop(cropName: string): GrowerCropItem {
  return {
    id: `crop-${cropName}`,
    userId: 'grower-1',
    canonicalId: null,
    cropName,
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
  };
}

describe('grow more practices', () => {
  it('gives every practice the copy the cards rely on', () => {
    for (const practice of GROW_MORE_PRACTICES) {
      expect(practice.summary.length).toBeGreaterThan(0);
      expect(practice.detail.length).toBeGreaterThan(0);
      expect(practice.opportunity.length).toBeGreaterThan(0);
      expect(practice.firstStep.length).toBeGreaterThan(0);
      expect(practice.effort.length).toBeGreaterThan(0);
      expect(practice.seasons.length).toBeGreaterThan(0);
      expect(PRACTICE_THEMES[practice.theme]).toBeDefined();
    }
  });

  it('uses unique practice ids', () => {
    const ids = GROW_MORE_PRACTICES.map((practice) => practice.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only surfaces practices that suit the current season', () => {
    const { timely } = selectGrowMorePractices({ season: 'winter' });

    expect(timely.length).toBeGreaterThan(0);
    for (const entry of timely) {
      expect(entry.practice.seasons).toContain('winter');
      expect(entry.reason).toContain('winter');
    }
  });

  it('prefers practices that touch crops already in the garden', () => {
    const { timely } = selectGrowMorePractices({
      season: 'summer',
      crops: [crop('Tomato'), crop('Bush beans')],
    });

    const saveSeed = timely.find((entry) => entry.practice.id === 'save-seed');
    expect(saveSeed).toBeDefined();
    expect(saveSeed?.reason).toContain('you are growing');
    expect(saveSeed?.reason).toContain('Tomato');
  });

  it('keeps every practice reachable, timely or not', () => {
    const selection = selectGrowMorePractices({ season: 'spring' });
    const shown = [
      ...selection.timely.map((entry) => entry.practice.id),
      ...selection.rest.map((practice) => practice.id),
    ];

    expect(new Set(shown).size).toBe(GROW_MORE_PRACTICES.length);
  });

  it('is deterministic for the same season and garden', () => {
    const first = selectGrowMorePractices({ season: 'fall', crops: [crop('Kale')] });
    const second = selectGrowMorePractices({ season: 'fall', crops: [crop('Kale')] });

    expect(first.timely.map((entry) => entry.practice.id)).toEqual(
      second.timely.map((entry) => entry.practice.id)
    );
  });

  it('respects the requested number of timely practices', () => {
    const { timely } = selectGrowMorePractices({ season: 'summer', limit: 2 });
    expect(timely).toHaveLength(2);
  });
});
