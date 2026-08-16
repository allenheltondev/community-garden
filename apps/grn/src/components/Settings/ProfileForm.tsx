import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, Input, Select } from '@olivias/ui';
import {
  listMyListings,
  updateListing,
  updateMe,
  type UpdateUserProfileRequest,
} from '../../services/api';
import type { GrowerProfile } from '../../types/user';
import { createLogger } from '../../utils/logging';
import {
  lookupHardinessZone,
  postcodeFromAddress,
  reverseGeocode,
} from '../../utils/geolocation';
import { findInheritedListings, toRefreshPayload } from './inheritedListings';
import { localeOptions } from './formattingLocales';
import {
  validateProfile,
  type ProfileFieldErrors,
  type ProfileFormValues,
} from './profileValidation';
import './ProfileForm.css';

const logger = createLogger('profile-form');

export interface ProfileFormProps {
  profile: GrowerProfile;
  /** Lives on the user rather than the grower profile, but is edited here. */
  displayName?: string | null;
  /** Reloads the signed-in user so the rest of the shell sees the new values. */
  refreshUser: () => Promise<void> | void;
}


function toProfileFormValues(
  profile: GrowerProfile,
  displayName?: string | null
): ProfileFormValues {
  return {
    displayName: displayName?.trim() ?? '',
    address: profile.address ?? '',
    homeZone: profile.homeZone ?? '',
    // Number() as well as the API-boundary normalisation: this value is the
    // one field the API reports as a string and rejects as one.
    shareRadiusMiles: Number(profile.shareRadiusMiles ?? 5),
    isOrganization: profile.isOrganization ?? false,
    organizationName: profile.organizationName ?? '',
    units: profile.units ?? 'imperial',
    locale: profile.locale || navigator.language || 'en-US',
  };
}

/**
 * Editing for the location and sharing details captured during setup. Address
 * and zone matter most: a grower who moves otherwise keeps planting windows
 * and neighbor distances calculated for where they used to live.
 */
export function ProfileForm({ profile, displayName, refreshUser }: ProfileFormProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [values, setValues] = useState<ProfileFormValues>(() =>
    toProfileFormValues(profile, displayName)
  );
  const [errors, setErrors] = useState<ProfileFieldErrors>({});
  const [isLocating, setIsLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [zoneSuggestion, setZoneSuggestion] = useState<{ zone: string; postcode: string } | null>(
    null
  );
  const [addressMoved, setAddressMoved] = useState(false);
  const [listingsNote, setListingsNote] = useState<string | null>(null);

  const saved = useMemo(
    () => toProfileFormValues(profile, displayName),
    [displayName, profile]
  );

  // Only needed once the grower is actually editing or has just moved, so
  // visiting Settings does not pull the listing list for everyone.
  const listingsQuery = useQuery({
    queryKey: ['myListings'],
    queryFn: () => listMyListings(50, 0),
    enabled: isEditing || addressMoved,
    staleTime: 30 * 1000,
  });

  const inheritedListings = useMemo(
    () => findInheritedListings(listingsQuery.data?.items ?? []),
    [listingsQuery.data?.items]
  );

  const setField = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSavedAt(null);
  };

  const mutation = useMutation({
    mutationFn: async (next: ProfileFormValues) => {
      // The whole profile goes every time: the API's upsert replaces the row,
      // so anything omitted here would be blanked out.
      const payload: UpdateUserProfileRequest = {
        // Only sent when set: the API keeps the stored name when the field is
        // absent, and blanking it should not wipe the grower's name.
        ...(next.displayName.trim() ? { displayName: next.displayName.trim() } : {}),
        growerProfile: {
          address: next.address.trim(),
          homeZone: next.homeZone.trim(),
          shareRadiusMiles: next.shareRadiusMiles,
          isOrganization: next.isOrganization,
          organizationName: next.isOrganization
            ? next.organizationName.trim() || undefined
            : undefined,
          units: next.units,
          locale: next.locale,
        },
      };
      await updateMe(payload);
    },
    onSuccess: async (_result, next) => {
      const moved = next.address.trim() !== saved.address.trim();
      logger.info('Grower profile updated', { addressChanged: moved });
      // The address drives geoKey, lat, and lng server-side, so anything
      // reading the profile has to be refetched rather than patched locally.
      await queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      await refreshUser();
      setSavedAt(new Date().toLocaleTimeString());
      setAddressMoved(moved);
      setListingsNote(null);
      setIsEditing(false);
    },
    onError: (error) => {
      logger.error('Failed to update grower profile', error as Error);
    },
  });

  const refreshListingsMutation = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(
        inheritedListings.map((listing) => updateListing(listing.id, toRefreshPayload(listing)))
      );
      return {
        updated: results.filter((result) => result.status === 'fulfilled').length,
        failed: results.filter((result) => result.status === 'rejected').length,
      };
    },
    onSuccess: async ({ updated, failed }) => {
      logger.info('Refreshed listing pickup addresses after a move', { updated, failed });
      await queryClient.invalidateQueries({ queryKey: ['myListings'] });
      setListingsNote(
        failed === 0
          ? `${updated} ${updated === 1 ? 'listing now points' : 'listings now point'} at your new address.`
          : `${updated} updated, ${failed} could not be updated. Open Share to fix the rest.`
      );
      if (failed === 0) setAddressMoved(false);
    },
    onError: (error) => {
      logger.error('Failed to refresh listing pickup addresses', error as Error);
      setListingsNote('Those listings could not be updated. Open Share to change them directly.');
    },
  });

  /**
   * A typed address cannot be turned into a zone without geocoding, but most US
   * addresses carry their zipcode — enough for the same lookup setup uses. The
   * result is offered, never applied: a grower may keep a zone that reflects
   * their microclimate better than the map does.
   */
  const checkZoneForTypedAddress = async () => {
    const postcode = postcodeFromAddress(values.address);
    if (!postcode || postcode === postcodeFromAddress(saved.address)) {
      setZoneSuggestion(null);
      return;
    }

    const zone = await lookupHardinessZone(postcode);
    if (!zone || zone.toLowerCase() === values.homeZone.trim().toLowerCase()) {
      setZoneSuggestion(null);
      return;
    }

    setZoneSuggestion({ zone, postcode });
  };

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
    setZoneSuggestion(null);
    setSavedAt(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setValues(saved);
    setErrors({});
    setLocationNote(null);
    setZoneSuggestion(null);
    setIsEditing(false);
    mutation.reset();
  };

  const addressChanged = values.address.trim() !== saved.address.trim();

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
          <dt>Display name</dt>
          <dd>{saved.displayName || 'Not provided'}</dd>
          <dt>Address</dt>
          <dd>{saved.address || 'Not provided'}</dd>
          <dt>Growing zone</dt>
          <dd>{saved.homeZone || 'Not provided'}</dd>
          <dt>Share radius</dt>
          <dd>{saved.shareRadiusMiles} mi</dd>
          <dt>Units</dt>
          <dd>{saved.units === 'metric' ? 'Metric' : 'Imperial'}</dd>
          <dt>Date formatting</dt>
          <dd>{saved.locale}</dd>
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

        {addressMoved && inheritedListings.length > 0 ? (
          <div className="grn-profile-form__listings" role="alert">
            <p>
              {inheritedListings.length === 1
                ? '1 listing still sends neighbors to your old address'
                : `${inheritedListings.length} listings still send neighbors to your old address`}
              . They were created without their own pickup address, so they kept the one saved when
              you posted them.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => refreshListingsMutation.mutate()}
              loading={refreshListingsMutation.isPending}
              disabled={refreshListingsMutation.isPending}
            >
              {inheritedListings.length === 1
                ? 'Move it to my new address'
                : `Move ${inheritedListings.length} listings to my new address`}
            </Button>
          </div>
        ) : null}

        {listingsNote ? (
          <p className="grn-profile-form__saved" role="status">
            {listingsNote}
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
        label="Display name"
        type="text"
        value={values.displayName}
        onChange={(event) => setField('displayName', event.target.value)}
        placeholder="How neighbors see you"
        error={errors.displayName}
        disabled={mutation.isPending}
      />

      <Input
        label="Address"
        type="text"
        value={values.address}
        onChange={(event) => setField('address', event.target.value)}
        onBlur={() => void checkZoneForTypedAddress()}
        placeholder="123 Main St, Springfield, IL"
        error={errors.address}
        disabled={isLocating || mutation.isPending}
        required
      />

      {addressChanged ? (
        <div className="grn-profile-form__preview" role="status">
          <h3>What changes when you save</h3>
          <ul>
            <li>
              Neighbors within {values.shareRadiusMiles} miles of the new address see your
              listings — a different set of people from before.
            </li>
            <li>
              {values.homeZone.trim() === saved.homeZone.trim()
                ? `Planting windows and seasonal ideas stay on zone ${saved.homeZone.trim() || 'your saved zone'}.`
                : `Planting windows and seasonal ideas move to zone ${values.homeZone.trim()}.`}
            </li>
            {inheritedListings.length > 0 ? (
              <li>
                {inheritedListings.length === 1
                  ? '1 listing uses this address for pickup and keeps the old one'
                  : `${inheritedListings.length} listings use this address for pickup and keep the old one`}{' '}
                until you move them — you can do that right after saving.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

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
        onChange={(event) => {
          setField('homeZone', event.target.value);
          setZoneSuggestion(null);
        }}
        placeholder="e.g., 8a, 9b, 10"
        error={errors.homeZone}
        disabled={mutation.isPending}
        required
      />

      {zoneSuggestion ? (
        <div className="grn-profile-form__suggestion" role="status">
          <span>
            The hardiness map puts {zoneSuggestion.postcode} in zone {zoneSuggestion.zone}. Yours is
            set to {values.homeZone.trim() || 'nothing yet'}.
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setField('homeZone', zoneSuggestion.zone);
              setZoneSuggestion(null);
            }}
          >
            Use zone {zoneSuggestion.zone}
          </Button>
        </div>
      ) : null}

      {addressChanged && !zoneSuggestion && values.homeZone.trim() === saved.homeZone.trim() ? (
        <p className="grn-profile-form__warning" role="status">
          Your zone is unchanged. If this move crossed into a different climate, update it too —
          planting windows and seasonal ideas are worked out from it.
        </p>
      ) : null}

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

      <Select
        label="Date formatting"
        value={values.locale}
        onChange={(value) => setField('locale', value)}
        options={localeOptions(saved.locale)}
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
