import { describe, expect, it } from 'vitest';
import type { GrowerCropItem } from '../types/listing';
import { buildTodayActions } from './todayActions';

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

describe('buildTodayActions', () => {
  it('uses deterministic priority and caps the queue at three', () => {
    const actions = buildTodayActions({
      userId: 'grower-1',
      now: new Date('2026-07-14T12:00:00Z'),
      cropsLoaded: true,
      crops: [
        crop({ id: 'harvest', expectedHarvestDate: '2026-07-14' }),
        crop({ id: 'plan', cropName: 'Kale', status: 'planning' }),
      ],
      reminders: [
        {
          id: 'reminder',
          title: 'Water',
          reminderType: 'watering',
          cadenceDays: 1,
          startDate: '2026-07-01',
          timezone: 'UTC',
          status: 'active',
          nextRunAt: '2026-07-14T09:00:00Z',
          lastRunAt: null,
          createdAt: '2026-07-01T00:00:00Z',
        },
      ],
      claims: [
        {
          id: 'claim',
          listingId: 'listing',
          requestId: null,
          claimerId: 'neighbor',
          listingOwnerId: 'grower-1',
          quantityClaimed: '1',
          status: 'pending',
          notes: null,
          claimedAt: '2026-07-14T08:00:00Z',
          confirmedAt: null,
          completedAt: null,
          cancelledAt: null,
        },
      ],
      signals: [],
    });

    expect(actions.map((action) => action.kind)).toEqual(['claim', 'reminder', 'harvest']);
    expect(actions).toHaveLength(3);
    expect(actions[0].to).toBe('/share/listings?listing=listing&claim=claim');
  });

  it('links a confirmed claim to the exact pickup record', () => {
    const [action] = buildTodayActions({
      userId: 'grower-1',
      now: new Date('2026-07-14T12:00:00Z'),
      crops: [],
      cropsLoaded: true,
      reminders: [],
      signals: [],
      claims: [
        {
          id: 'claim-1',
          listingId: 'listing-1',
          requestId: null,
          claimerId: 'grower-1',
          listingOwnerId: 'neighbor-1',
          quantityClaimed: '1',
          status: 'confirmed',
          notes: null,
          claimedAt: '2026-07-14T08:00:00Z',
          confirmedAt: '2026-07-14T09:00:00Z',
          completedAt: null,
          cancelledAt: null,
        },
      ],
    });

    expect(action.kind).toBe('pickup');
    expect(action.to).toBe('/share/find?claim=claim-1');
  });

  it('offers an optional share action for a surplus-enabled crop', () => {
    const [action] = buildTodayActions({
      userId: 'grower-1',
      now: new Date('2026-07-14T12:00:00Z'),
      crops: [
        crop({
          id: 'crop-share',
          cropName: 'Zucchini',
          status: 'growing',
          surplusEnabled: true,
        }),
      ],
      cropsLoaded: true,
      reminders: [],
      claims: [],
      signals: [],
    });

    expect(action).toMatchObject({
      kind: 'share',
      cta: 'Share food',
      to: '/share/listings?crop=crop-share',
    });
    expect(action.body).toMatch(/you choose the amount and timing/i);
  });

  it('returns one clear start action for an empty, loaded garden', () => {
    const actions = buildTodayActions({
      crops: [],
      cropsLoaded: true,
      reminders: [],
      claims: [],
      signals: [],
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: 'start', to: '/garden/plants/new' });
  });

  it('keeps the start action available when an empty garden has other activity', () => {
    const actions = buildTodayActions({
      crops: [],
      cropsLoaded: true,
      reminders: [],
      claims: [],
      signals: [
        {
          cropId: 'crop-scarce',
          cropName: 'Okra',
          requestCount: 5,
          listingCount: 1,
          scarcityScore: 0.9,
        },
      ],
    });

    expect(actions.map((action) => action.kind)).toEqual(['start', 'local']);
  });

  it('does not push the start action ahead of a waiting neighbor', () => {
    const actions = buildTodayActions({
      userId: 'grower-1',
      crops: [],
      cropsLoaded: true,
      reminders: [],
      claims: [
        {
          id: 'claim-1',
          listingId: 'listing-1',
          requestId: null,
          claimerId: 'grower-1',
          listingOwnerId: 'neighbor',
          quantityClaimed: '1',
          status: 'confirmed',
          notes: null,
          claimedAt: '2026-07-01T00:00:00Z',
          confirmedAt: '2026-07-02T00:00:00Z',
          completedAt: null,
          cancelledAt: null,
        },
      ],
      signals: [],
    });

    expect(actions.map((action) => action.kind)).toEqual(['pickup', 'start']);
  });
});
