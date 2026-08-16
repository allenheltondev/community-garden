import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Input, Select } from '@olivias/ui';
import { updateMe, type UpdateUserProfileRequest } from '../../services/api';
import type { GrowerProfile } from '../../types/user';
import { createLogger } from '../../utils/logging';
import { lookupHardinessZone, reverseGeocode } from '../../utils/geolocation';
import {
  validateProfile,
  type ProfileFieldErrors,
  type ProfileFormValues,
} from './profileValidation';
import './ProfileForm.css';

const logger = createLogger('profile-form');

export interface ProfileFormProps {
  profile: GrowerProfile;
  /** Reloads the signed-in user so the rest of the shell sees the new values. */
  refreshUser: () => Promise<void> | void;
}


function toProfileFormValues(profile: GrowerProfile): ProfileFormValues {
  return {
    address: profile.address ?? '',
    homeZone: profile.homeZone ?? '',
    shareRadiusMiles: profile.shareRadiusMiles ?? 5,
    isOrganization: profile.isOrganization ?? false,
    organizationName: profile.organizationName ?? '',
    units: profile.units ?? 'imperial',
  };
}

/**
 * Editing for the location and sharing details captured during setup. Address
 * and zone matter most: a grower who moves otherwise keeps planting windows
 * and neighbor distances calculated for where they used to live.
 */
export function ProfileForm({ profile, refreshUser }: ProfileFormProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [values, setValues] = useState<ProfileFormValues>(() => toProfileFormValues(profile));
  const [errors, setErrors] = useState<ProfileFieldErrors>({});
  const [isLocating, setIsLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const saved = useMemo(() => toProfileFormValues(profile), [profile]);

  const setField = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSavedAt(null);
  };

  const mutation = useMutation({
    mutationFn: async (next: ProfileFormValues) => {
      // The whole profile goes every time; `locale` is carried through
      // untouched because the form does not expose it.
      const payload: UpdateUserProfileRequest = {
        growerProfile: {
          address: next.address.trim(),
          homeZone: next.homeZone.trim(),
          shareRadiusMiles: next.shareRadiusMiles,
          isOrganization: next.isOrganization,
          organizationName: next.isOrganization
            ? next.organizationName.trim() || undefined
            : undefined,
          units: next.units,
          locale: profile.locale || navigator.language || 'en-US',
        },
      };
      await updateMe(payload);
    },
    onSuccess: async () => {
      logger.info('Grower profile updated');
      // The address drives geoKey, lat, and lng server-side, so anything
      // reading the profile has to be refetched rather than patched locally.
      await queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      await refreshUser();
      setSavedAt(new Date().toLocaleTimeString());
      setIsEditing(false);
    },
    onError: (error) => {
      logger.error('Failed to update grower profile', error as Error);
    },
  });

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationNote('Location services are not available on this device.');
      return;
    }

    setIsLocating(true);
    setLocationNote(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const resolved = await reverseGeocode(latitude, longitude);

        if (!resolved) {
          setLocationNote('Could not determine your address. Enter it manually.');
          setIsLocating(false);
          return;
        }

        setField('address', resolved.address);

        if (resolved.postcode) {
          const zone = await lookupHardinessZone(resolved.postcode);
          if (zone) {
            setField('homeZone', zone);
            setLocationNote(`Address filled in, and your zone updated to ${zone}. Check both before saving.`);
            setIsLocating(false);
            return;
          }
        }

        setLocationNote('Address filled in. Update your growing zone if the move changed it.');
        setIsLocating(false);
      },
      (error) => {
        logger.warn('Geolocation request failed', { code: error.code });
        setLocationNote('Could not access your location. Enter your address manually.');
        setIsLocating(false);
      }
    );
  };

  const startEditing = () => {
    setValues(saved);
    setErrors({});
    setLocationNote(null);
    setSavedAt(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setValues(saved);
    setErrors({});
    setLocationNote(null);
    setIsEditing(false);
    mutation.reset();
  };

  const submit = () => {
    const nextErrors = validateProfile(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    mutation.mutate(values);
  };

  if (!isEditing) {
    return (
      <div className="grn-profile-summary">
        <dl className="grn-settings-details">
          <dt>Address</dt>
          <dd>{saved.address || 'Not provided'}</dd>
          <dt>Growing zone</dt>
          <dd>{saved.homeZone || 'Not provided'}</dd>
          <dt>Share radius</dt>
          <dd>{saved.shareRadiusMiles} mi</dd>
          <dt>Units</dt>
          <dd>{saved.units === 'metric' ? 'Metric' : 'Imperial'}</dd>
          {saved.isOrganization ? (
            <>
              <dt>Organization</dt>
              <dd>{saved.organizationName || 'Not provided'}</dd>
            </>
          ) : null}
        </dl>

        {savedAt ? (
          <p className="grn-profile-form__saved" role="status">
            Saved at {savedAt}.
          </p>
        ) : null}

        <Button variant="secondary" size="sm" onClick={startEditing}>
          Edit location and sharing
        </Button>
      </div>
    );
  }

  return (
    <form
      className="grn-profile-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      // Our own validation mirrors what the API enforces and reports every
      // problem at once; native popups would pre-empt it one field at a time.
      noValidate
      aria-label="Edit location and sharing"
    >
      <p className="grn-profile-form__intro">
        Moving? Update your address and growing zone together — planting windows, seasonal ideas,
        and how far your listings reach are all worked out from them.
      </p>

      <Input
        label="Address"
        type="text"
        value={values.address}
        onChange={(event) => setField('address', event.target.value)}
        placeholder="123 Main St, Springfield, IL"
        error={errors.address}
        disabled={isLocating || mutation.isPending}
        required
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={useCurrentLocation}
        loading={isLocating}
        disabled={isLocating || mutation.isPending}
      >
        {isLocating ? 'Finding your address…' : 'Use my current location'}
      </Button>

      {locationNote ? (
        <p className="grn-profile-form__note" role="status">
          {locationNote}
        </p>
      ) : null}

      <Input
        label="Growing zone"
        type="text"
        value={values.homeZone}
        onChange={(event) => setField('homeZone', event.target.value)}
        placeholder="e.g., 8a, 9b, 10"
        error={errors.homeZone}
        disabled={mutation.isPending}
        required
      />

      <Input
        label="Share radius (miles)"
        type="number"
        min={1}
        max={100}
        value={String(values.shareRadiusMiles)}
        onChange={(event) => setField('shareRadiusMiles', Number(event.target.value))}
        error={errors.shareRadiusMiles}
        disabled={mutation.isPending}
        required
      />

      <Select
        label="Units"
        value={values.units}
        onChange={(value) => setField('units', value as GrowerProfile['units'])}
        options={[
          { value: 'imperial', label: 'Imperial' },
          { value: 'metric', label: 'Metric' },
        ]}
        disabled={mutation.isPending}
        required
      />

      <Checkbox
        label="We are growing as an organization"
        description="Community gardens, schools, churches, food pantries, and other groups sharing together."
        checked={values.isOrganization}
        onChange={(event) => setField('isOrganization', event.target.checked)}
        disabled={mutation.isPending}
      />

      {values.isOrganization ? (
        <Input
          label="Organization name"
          type="text"
          value={values.organizationName}
          onChange={(event) => setField('organizationName', event.target.value)}
          placeholder="North Austin Community Garden"
          error={errors.organizationName}
          disabled={mutation.isPending}
          required
        />
      ) : null}

      {mutation.isError ? (
        <p className="grn-profile-form__error" role="alert">
          Your profile could not be saved. Check the details and try again.
        </p>
      ) : null}

      <div className="grn-profile-form__actions">
        <Button type="submit" variant="primary" size="md" loading={mutation.isPending} disabled={mutation.isPending}>
          Save changes
        </Button>
        <Button type="button" variant="ghost" size="md" onClick={cancelEditing} disabled={mutation.isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default ProfileForm;
