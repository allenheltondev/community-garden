import { describe, expect, it } from 'vitest';
import type { GrowerCropItem } from '../../types/listing';
import { buildHarvestTimeline, harvestDateLabel } from './harvestTimelineData';

function crop(overrides: Partial<GrowerCropItem>): GrowerCropItem {
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
    plantingDate: '2026-05-20',
    expectedHarvestDate: null,
    plantCount: null,
    spacingInches: null,
    pyramidTier: null,
    createdAt: '2026-05-20',
    updatedAt: '2026-05-20',
    ...overrides,
  };
}

describe('buildHarvestTimeline', () => {
  const now = new Date('2026-07-21T18:00:00Z');

  it('sorts growing crops into useful harvest horizons', () => {
    const timeline = buildHarvestTimeline(
      [
        crop({ id: 'later', cropName: 'Pumpkin', expectedHarvestDate: '2026-09-15' }),
        crop({ id: 'today', cropName: 'Tomato', expectedHarvestDate: '2026-07-21' }),
        crop({ id: 'week', cropName: 'Beans', expectedHarvestDate: '2026-07-25' }),
        crop({ id: 'month', cropName: 'Pepper', expectedHarvestDate: '2026-08-10' }),
        crop({ id: 'overdue', cropName: 'Cucumber', expectedHarvestDate: '2026-07-18' }),
      ],
      now
    );

    expect(timeline.groups.ready.map((item) => item.crop.id)).toEqual(['overdue', 'today']);
    expect(timeline.groups.week.map((item) => item.crop.id)).toEqual(['week']);
    expect(timeline.groups.month.map((item) => item.crop.id)).toEqual(['month']);
    expect(timeline.groups.later.map((item) => item.crop.id)).toEqual(['later']);
    expect(timeline.scheduledCount).toBe(5);
  });

  it('keeps missing timing separate and ignores crops that are not growing', () => {
    const timeline = buildHarvestTimeline(
      [
        crop({ id: 'missing', nickname: 'Sun Gold' }),
        crop({ id: 'invalid', cropName: 'Basil', expectedHarvestDate: 'soon' }),
        crop({ id: 'planning', status: 'planning', expectedHarvestDate: '2026-08-01' }),
      ],
      now
    );

    expect(timeline.scheduledCount).toBe(0);
    expect(timeline.missingTiming.map((item) => item.id)).toEqual(['invalid', 'missing']);
  });

  it('describes due and future estimates without claiming exact readiness', () => {
    const timeline = buildHarvestTimeline(
      [
        crop({ id: 'due', expectedHarvestDate: '2026-07-21' }),
        crop({ id: 'future', expectedHarvestDate: '2026-07-22' }),
      ],
      now
    );

    expect(harvestDateLabel(timeline.groups.ready[0], 'en-US')).toBe('Estimated today · Jul 21');
    expect(harvestDateLabel(timeline.groups.week[0], 'en-US')).toBe('Tomorrow · Jul 22');
  });
});
