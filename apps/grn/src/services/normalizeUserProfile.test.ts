import { describe, expect, it } from 'vitest';
import { normalizeUserProfile } from './api';
import type { UserProfile } from '../types/user';

const base = {
  id: 'grower-1',
  email: 'ada@example.com',
  userType: 'grower',
  onboardingCompleted: true,
  subscription: { tier: 'free' },
} as UserProfile;

describe('normalizeUserProfile', () => {
  it('turns the string share radius from GET /me into the number PUT /me wants', () => {
    const normalized = normalizeUserProfile({
      ...base,
      growerProfile: {
        homeZone: '8a',
        address: '123 Main St',
        geoKey: '9v6kn7',
        shareRadiusMiles: '20.0' as unknown as number,
        isOrganization: false,
        units: 'imperial',
        locale: 'en-US',
      },
    });

    expect(normalized.growerProfile?.shareRadiusMiles).toBe(20);
  });

  it('leaves a profile without grower details alone', () => {
    expect(normalizeUserProfile({ ...base, growerProfile: null })).toEqual({
      ...base,
      growerProfile: null,
    });
  });

  it('keeps every other profile field untouched', () => {
    const profile = {
      ...base,
      displayName: 'Ada Lovelace',
      growerProfile: {
        homeZone: '8a',
        address: '123 Main St',
        geoKey: '9v6kn7',
        shareRadiusMiles: 5,
        isOrganization: true,
        organizationName: 'North Austin Community Garden',
        units: 'metric' as const,
        locale: 'en-GB',
      },
    };

    expect(normalizeUserProfile(profile)).toEqual(profile);
  });
});
