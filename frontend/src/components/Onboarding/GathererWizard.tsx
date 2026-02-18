import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card } from '../ui/Card';
import type { GathererProfileInput } from '../../hooks/useOnboarding';
import { logger } from '../../utils/logging';

export interface GathererWizardProps {
  onComplete: (data: GathererProfileInput) => Promise<void>;
  onBack?: () => void;
}

type WizardStep = 'location' | 'preferences';

interface FormData {
  lat: number | null;
  lng: number | null;
  searchRadiusKm: number;
  organizationAffiliation: string;
  units: 'metric' | 'imperial';
  locale: string;
}

interface ValidationErrors {
  location?: string;
  searchRadiusKm?: string;
}

/**
 * GathererWizard Component
 *
 * Multi-step wizard for collecting gatherer profile information.
 * Steps:
 * 1. Location - Collect lat/lng with geolocation support
 * 2. Preferences - Collect search radius, organization, units, and locale
 *
 * Features:
 * - Real-time validation
 * - Progress indicators
 * - Geolocation support with fallback
 * - Mobile-first design
 */
export function GathererWizard({ onComplete, onBack }: GathererWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('location');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    lat: null,
    lng: null,
    searchRadiusKm: 10,
    organizationAffiliation: '',
    units: 'imperial',
    locale: navigator.language || 'en-US',
  });
  const [errors, setErrors] = useState<ValidationErrors>({});
  const hasRequestedLocation = useRef(false);

  const requestGeolocation = useCallback(() => {
    if (!navigator.geolocation) {
      logger.warn('Geolocation not supported by browser');
      return;
    }

    setIsLoadingLocation(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setFormData((prev) => ({
          ...prev,
          lat: latitude,
          lng: longitude,
        }));
        setIsLoadingLocation(false);
        logger.info('Geolocation obtained', { latitude, longitude });
        setErrors((prev) => ({ ...prev, location: undefined }));
      },
      (error) => {
        logger.warn('Geolocation request failed', {
          code: error.code,
          message: error.message,
        });
        setIsLoadingLocation(false);
      }
    );
  }, []);

  // Auto-detect user's location on mount
  useEffect(() => {
    if (!hasRequestedLocation.current && formData.lat === null && formData.lng === null) {
      hasRequestedLocation.current = true;
      // Use setTimeout to defer the call outside the effect
      setTimeout(() => {
        requestGeolocation();
      }, 0);
    }
  }, [formData.lat, formData.lng, requestGeolocation]);

  const validateLocation = (): boolean => {
    const newErrors: ValidationErrors = {};

    if (formData.lat === null || formData.lng === null) {
      newErrors.location = 'Location is required';
    } else if (formData.lat < -90 || formData.lat > 90) {
      newErrors.location = 'Latitude must be between -90 and 90';
    } else if (formData.lng < -180 || formData.lng > 180) {
      newErrors.location = 'Longitude must be between -180 and 180';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validatePreferences = (): boolean => {
    const newErrors: ValidationErrors = {};

    if (formData.searchRadiusKm <= 0) {
      newErrors.searchRadiusKm = 'Search radius must be greater than 0';
    } else if (formData.searchRadiusKm > 100) {
      newErrors.searchRadiusKm = 'Search radius must be 100 or less';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (currentStep === 'location') {
      if (validateLocation()) {
        setCurrentStep('preferences');
      }
    }
  };

  const handleBack = () => {
    if (currentStep === 'preferences') {
      setCurrentStep('location');
    } else if (onBack) {
      onBack();
    }
  };

  const handleSubmit = async () => {
    if (!validatePreferences()) {
      return;
    }

    if (formData.lat === null || formData.lng === null) {
      setErrors({ location: 'Location is required' });
      setCurrentStep('location');
      return;
    }

    setIsSubmitting(true);

    try {
      const profileData: GathererProfileInput = {
        lat: formData.lat,
        lng: formData.lng,
        searchRadiusKm: formData.searchRadiusKm,
        organizationAffiliation: formData.organizationAffiliation.trim() || undefined,
        units: formData.units,
        locale: formData.locale,
      };

      await onComplete(profileData);
    } catch (error) {
      logger.error('Failed to submit gatherer profile', error as Error);
      setIsSubmitting(false);
    }
  };

  const steps: WizardStep[] = ['location', 'preferences'];
  const currentStepIndex = steps.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-neutral-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md" padding="8">
        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-neutral-600 mb-2">
            <span>Step {currentStepIndex + 1} of {steps.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-neutral-200 rounded-full h-2">
            <div
              className="bg-primary-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        {/* Step Content */}
        {currentStep === 'location' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-semibold text-neutral-900 mb-2">
                Where are you located?
              </h2>
              <p className="text-neutral-600">
                We'll use your location to show you available food nearby.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  label="Latitude"
                  type="text"
                  value={formData.lat?.toString() || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      lat: value ? parseFloat(value) : null,
                    }));
                  }}
                  placeholder="37.7749"
                  required
                  disabled={isLoadingLocation}
                />
                <Input
                  label="Longitude"
                  type="text"
                  value={formData.lng?.toString() || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      lng: value ? parseFloat(value) : null,
                    }));
                  }}
                  placeholder="-122.4194"
                  required
                  disabled={isLoadingLocation}
                />
              </div>

              {errors.location && (
                <p className="text-sm text-error flex items-center gap-1" role="alert">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {errors.location}
                </p>
              )}

              <Button
                variant="outline"
                fullWidth
                onClick={requestGeolocation}
                loading={isLoadingLocation}
                disabled={isLoadingLocation}
              >
                {isLoadingLocation ? 'Getting location...' : 'Use my current location'}
              </Button>
            </div>
          </div>
        )}

        {currentStep === 'preferences' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-semibold text-neutral-900 mb-2">
                Set your preferences
              </h2>
              <p className="text-neutral-600">
                Customize your search settings.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-neutral-700 mb-2 block">
                  Search Radius
                  <span className="text-error ml-1" aria-label="required">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="50"
                    step="1"
                    value={formData.searchRadiusKm}
                    onChange={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        searchRadiusKm: parseInt(e.target.value, 10),
                      }));
                      if (errors.searchRadiusKm) {
                        setErrors((prev) => ({ ...prev, searchRadiusKm: undefined }));
                      }
                    }}
                    className="flex-1"
                    aria-label="Search radius in kilometers"
                  />
                  <span className="text-neutral-700 font-medium min-w-[4rem] text-right">
                    {formData.searchRadiusKm} km
                  </span>
                </div>
                {errors.searchRadiusKm && (
                  <p className="text-sm text-error mt-1" role="alert">
                    {errors.searchRadiusKm}
                  </p>
                )}
                <p className="text-sm text-neutral-500 mt-1">
                  How far you're willing to travel for food
                </p>
              </div>

              <Input
                label="Organization (Optional)"
                type="text"
                value={formData.organizationAffiliation}
                onChange={(e) => {
                  setFormData((prev) => ({
                    ...prev,
                    organizationAffiliation: e.target.value,
                  }));
                }}
                placeholder="e.g., SF Food Bank, Community Garden"
              />
              <p className="text-sm text-neutral-600 mt-1">
                If you're gathering on behalf of an organization
              </p>

              <div>
                <label className="text-sm font-medium text-neutral-700 mb-2 block">
                  Units
                  <span className="text-error ml-1" aria-label="required">*</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, units: 'metric' }))}
                    className={`flex-1 px-4 py-2 rounded-base border-2 transition-all ${
                      formData.units === 'metric'
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400'
                    }`}
                    aria-pressed={formData.units === 'metric'}
                  >
                    Metric
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, units: 'imperial' }))}
                    className={`flex-1 px-4 py-2 rounded-base border-2 transition-all ${
                      formData.units === 'imperial'
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400'
                    }`}
                    aria-pressed={formData.units === 'imperial'}
                  >
                    Imperial
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex gap-3 mt-8">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={isSubmitting}
            className="flex-1"
          >
            Back
          </Button>

          {currentStep !== 'preferences' ? (
            <Button
              variant="primary"
              onClick={handleNext}
              className="flex-1"
            >
              Next
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={isSubmitting}
              disabled={isSubmitting}
              className="flex-1"
            >
              Complete Setup
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
