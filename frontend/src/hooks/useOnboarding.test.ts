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

  describe('submitUserType', () => {
    it('should submit user type successfully', async () => {
      const updatedUser = { ...mockUserProfile, userType: 'grower' as const };
      vi.mocked(api.updateMe).mockResolvedValue(updatedUser);

      const { result } = renderHook(() => useOnboarding());

      let returnedUser: UserProfile | undefined;
      await act(async () => {
        returnedUser = await result.current.submitUserType('grower');
      });

      expect(api.updateMe).toHaveBeenCalledWith({ userType: 'grower' });
      expect(returnedUser).toEqual(updatedUser);
      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should call onSuccess callback', async () => {
      const updatedUser = { ...mockUserProfile, userType: 'gatherer' as const };
      vi.mocked(api.updateMe).mockResolvedValue(updatedUser);

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useOnboarding(onSuccess));

      await act(async () => {
        await result.current.submitUserType('gatherer');
      });

      expect(onSuccess).toHaveBeenCalledWith(updatedUser);
    });

    it('should handle API errors', async () => {
      const apiError = new api.ApiError('Validation failed', 400);
      vi.mocked(api.updateMe).mockRejectedValue(apiError);

      const { result } = renderHook(() => useOnboarding());

      await act(async () => {
        try {
          await result.current.submitUserType('grower');
        } catch (error) {
          expect(error).toBe(apiError);
        }
      });

      expect(result.current.error).toBe(apiError);
    });
  });

  describe('submitGrowerProfile', () => {
    it('should submit grower profile successfully', async () => {
      const profileInput = {
        homeZone: '8a',
        lat: 37.7749,
        lng: -122.4194,
        shareRadiusKm: 5.0,
        units: 'imperial' as const,
        locale: 'en-US',
      };

      const updatedUser: UserProfile = {
        ...mockUserProfile,
        userType: 'grower',
        onboardingCompleted: true,
        growerProfile: { ...profileInput, geoKey: '9q8yy9' },
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

    it('should handle validation errors', async () => {
      const profileInput = {
        homeZone: '8a',
        lat: 37.7749,
        lng: -122.4194,
        shareRadiusKm: -5.0,
        units: 'imperial' as const,
        locale: 'en-US',
      };

      const apiError = new api.ApiError('Invalid radius', 400);
      vi.mocked(api.updateMe).mockRejectedValue(apiError);

      const { result } = renderHook(() => useOnboarding());

      await act(async () => {
        try {
          await result.current.submitGrowerProfile(profileInput);
        } catch (error) {
          expect(error).toBe(apiError);
        }
      });

      expect(result.current.error).toBe(apiError);
    });
  });

  describe('submitGathererProfile', () => {
    it('should submit gatherer profile successfully', async () => {
      const profileInput = {
        lat: 37.7749,
        lng: -122.4194,
        searchRadiusKm: 10.0,
        organizationAffiliation: 'SF Food Bank',
        units: 'metric' as const,
        locale: 'en-US',
      };

      const updatedUser: UserProfile = {
        ...mockUserProfile,
        userType: 'gatherer',
        onboardingCompleted: true,
        gathererProfile: { ...profileInput, geoKey: '9q8yy9' },
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

    it('should submit without organization', async () => {
      const profileInput = {
        lat: 37.7749,
        lng: -122.4194,
        searchRadiusKm: 10.0,
        units: 'metric' as const,
        locale: 'en-US',
      };

      const updatedUser: UserProfile = {
        ...mockUserProfile,
        userType: 'gatherer',
        onboardingCompleted: true,
        gathererProfile: { ...profileInput, geoKey: '9q8yy9' },
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

  describe('clearError', () => {
    it('should clear error state', async () => {
      const apiError = new api.ApiError('Test error', 400);
      vi.mocked(api.updateMe).mockRejectedValue(apiError);

      const { result } = renderHook(() => useOnboarding());

      await act(async () => {
        try {
          await result.current.submitUserType('grower');
        } catch {
          // Expected
        }
      });

      expect(result.current.error).toBe(apiError);

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBe(null);
    });
  });
});
