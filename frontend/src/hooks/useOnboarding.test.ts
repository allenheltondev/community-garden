import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useOnboarding } from './useOnboarding';
import * as api from '../services/api';
import type { UserProfile } from '../types/user';

vi.mock('../services/api');

vi.mock('../utils/logging', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('useOnboarding', () => {
  const mockUserProfile: UserProfile = {
    userId: 'test-user-id',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    tier: 'neighbor',
    userType: null,
    onboardingCompleted: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('submitGrowerProfile', () => {
    it('submits grower profile with address', async () => {
      const profileInput = {
        homeZone: '8a',
        address: '123 Main St, Springfield, IL',
        shareRadiusKm: 5.0,
        units: 'imperial' as const,
        locale: 'en-US',
      };

      const updatedUser: UserProfile = {
        ...mockUserProfile,
        userType: 'grower',
        onboardingCompleted: true,
        growerProfile: {
          ...profileInput,
          geoKey: '9q8yy9',
          lat: 37.77,
          lng: -122.42,
        },
      };

      vi.mocked(api.updateMe).mockResolvedValue(updatedUser);

      const { result } = renderHook(() => useOnboarding());

      await act(async () => {
        await result.current.submitGrowerProfile(profileInput);
      });

      expect(api.updateMe).toHaveBeenCalledWith({
        userType: 'grower',
        growerProfile: profileInput,
      });
    });
  });

  describe('submitGathererProfile', () => {
    it('submits gatherer profile with address', async () => {
      const profileInput = {
        address: '456 Oak Ave, Springfield, IL',
        searchRadiusKm: 10.0,
        organizationAffiliation: 'SF Food Bank',
        units: 'metric' as const,
        locale: 'en-US',
      };

      const updatedUser: UserProfile = {
        ...mockUserProfile,
        userType: 'gatherer',
        onboardingCompleted: true,
        gathererProfile: {
          ...profileInput,
          geoKey: '9q8yy9',
          lat: 37.77,
          lng: -122.42,
        },
      };

      vi.mocked(api.updateMe).mockResolvedValue(updatedUser);

      const { result } = renderHook(() => useOnboarding());

      await act(async () => {
        await result.current.submitGathererProfile(profileInput);
      });

      expect(api.updateMe).toHaveBeenCalledWith({
        userType: 'gatherer',
        gathererProfile: profileInput,
      });
    });
  });
});
