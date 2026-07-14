import { useState, useCallback } from 'react';
import { updateMe, ApiError, type UpdateUserProfileRequest } from '../services/api';
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
  address: string;
  shareRadiusMiles: number;
  isOrganization: boolean;
  organizationName?: string;
  units: 'metric' | 'imperial';
  locale: string;
}

/**
 * Custom hook for managing user onboarding flow
 */
export function useOnboarding(onSuccess?: () => void) {
  const [state, setState] = useState<OnboardingState>({
    isSubmitting: false,
    error: null,
  });

  const submitGrowerProfile = useCallback(
    async (profileData: GrowerProfileInput): Promise<void> => {
      try {
        setState({ isSubmitting: true, error: null });

        logger.info('Submitting grower profile', {
          homeZone: profileData.homeZone,
          hasAddress: !!profileData.address,
          shareRadiusMiles: profileData.shareRadiusMiles,
          isOrganization: profileData.isOrganization,
        });

        const payload: UpdateUserProfileRequest = {
          userType: 'grower',
          growerProfile: profileData,
        };

        await updateMe(payload);

        setState({ isSubmitting: false, error: null });

        logger.info('Grower profile submitted successfully');

        onSuccess?.();
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

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    submitGrowerProfile,
    clearError,
  };
}

export default useOnboarding;
