import { useState, useCallback } from 'react';
import { updateMe, ApiError, type UpdateUserProfileRequest } from '../services/api';
import type { UserProfile, UserType } from '../types/user';
import { logger } from '../utils/logging';

/**
 * Onboarding state interface
 */
export interface OnboardingState {
  isSubmitting: boolean;
  error: Error | null;
}

/**
 * Grower profile input data (without server-computed fields)
 */
export interface GrowerProfileInput {
  homeZone: string;
  lat: number;
  lng: number;
  shareRadiusKm: number;
  units: 'metric' | 'imperial';
  locale: string;
}

/**
 * Gatherer profile input data (without server-computed fields)
 */
export interface GathererProfileInput {
  lat: number;
  lng: number;
  searchRadiusKm: number;
  organizationAffiliation?: string;
  units: 'metric' | 'imperial';
  locale: string;
}

/**
 * Custom hook for managing user onboarding flow
 *
 * Features:
 * - Submit user type selection
 * - Submit grower profile data
 * - Submit gatherer profile data
 * - Handle API errors and validation messages
 * - Update local user state on success
 *
 * All methods call PUT /me with appropriate payload structure.
 *
 * @param onSuccess - Callback invoked with updated user profile after successful submission
 * @returns Onboarding state and submission methods
 */
export function useOnboarding(onSuccess?: (user: UserProfile) => void) {
  const [state, setState] = useState<OnboardingState>({
    isSubmitting: false,
    error: null,
  });

  /**
   * Submit user type selection
   *
   * @param userType - The selected user type ('grower' or 'gatherer')
   * @returns Promise<UserProfile> The updated user profile
   */
  const submitUserType = useCallback(
    async (userType: UserType): Promise<UserProfile> => {
      try {
        setState({ isSubmitting: true, error: null });

        logger.info('Submitting user type selection', { userType });

        const updatedUser = await updateMe({ userType });

        setState({ isSubmitting: false, error: null });

        logger.info('User type submitted successfully', {
          userId: updatedUser.userId,
          userType: updatedUser.userType,
        });

        if (onSuccess) {
          onSuccess(updatedUser);
        }

        return updatedUser;
      } catch (error) {
        const err = error as ApiError;
        logger.error('Failed to submit user type', err, {
          userType,
          statusCode: err.statusCode,
          correlationId: err.correlationId,
        });

        setState({ isSubmitting: false, error: err });
        throw err;
      }
    },
    [onSuccess]
  );

  /**
   * Submit grower profile data
   *
   * @param profileData - Grower profile information
   * @returns Promise<UserProfile> The updated user profile with grower profile
   */
  const submitGrowerProfile = useCallback(
    async (profileData: GrowerProfileInput): Promise<UserProfile> => {
      try {
        setState({ isSubmitting: true, error: null });

        logger.info('Submitting grower profile', {
          homeZone: profileData.homeZone,
          shareRadiusKm: profileData.shareRadiusKm,
        });

        const payload: UpdateUserProfileRequest = {
          userType: 'grower',
          growerProfile: profileData,
        };

        const updatedUser = await updateMe(payload);

        setState({ isSubmitting: false, error: null });

        logger.info('Grower profile submitted successfully', {
          userId: updatedUser.userId,
          onboardingCompleted: updatedUser.onboardingCompleted,
        });

        if (onSuccess) {
          onSuccess(updatedUser);
        }

        return updatedUser;
      } catch (error) {
        const err = error as ApiError;
        logger.error('Failed to submit grower profile', err, {
          statusCode: err.statusCode,
          correlationId: err.correlationId,
        });

        setState({ isSubmitting: false, error: err });
        throw err;
      }
    },
    [onSuccess]
  );

  /**
   * Submit gatherer profile data
   *
   * @param profileData - Gatherer profile information
   * @returns Promise<UserProfile> The updated user profile with gatherer profile
   */
  const submitGathererProfile = useCallback(
    async (profileData: GathererProfileInput): Promise<UserProfile> => {
      try {
        setState({ isSubmitting: true, error: null });

        logger.info('Submitting gatherer profile', {
          searchRadiusKm: profileData.searchRadiusKm,
          hasOrganization: !!profileData.organizationAffiliation,
        });

        const payload: UpdateUserProfileRequest = {
          userType: 'gatherer',
          gathererProfile: profileData,
        };

        const updatedUser = await updateMe(payload);

        setState({ isSubmitting: false, error: null });

        logger.info('Gatherer profile submitted successfully', {
          userId: updatedUser.userId,
          onboardingCompleted: updatedUser.onboardingCompleted,
        });

        if (onSuccess) {
          onSuccess(updatedUser);
        }

        return updatedUser;
      } catch (error) {
        const err = error as ApiError;
        logger.error('Failed to submit gatherer profile', err, {
          statusCode: err.statusCode,
          correlationId: err.correlationId,
        });

        setState({ isSubmitting: false, error: err });
        throw err;
      }
    },
    [onSuccess]
  );

  /**
   * Clear any errors
   */
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    submitUserType,
    submitGrowerProfile,
    submitGathererProfile,
    clearError,
  };
}

export default useOnboarding;
