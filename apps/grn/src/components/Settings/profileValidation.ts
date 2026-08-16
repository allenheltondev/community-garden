import type { GrowerProfile } from '../../types/user';

export interface ProfileFormValues {
  address: string;
  homeZone: string;
  shareRadiusMiles: number;
  isOrganization: boolean;
  organizationName: string;
  units: GrowerProfile['units'];
}

export type ProfileFieldErrors = Partial<Record<keyof ProfileFormValues, string>>;

/**
 * The API validates the whole grower profile and its upsert replaces the row,
 * so these rules mirror the backend's: sending a partial profile would either
 * be rejected or quietly blank out fields the grower never touched.
 */
export function validateProfile(values: ProfileFormValues): ProfileFieldErrors {
  const errors: ProfileFieldErrors = {};

  if (!values.address.trim()) {
    errors.address = 'Address is required';
  } else if (values.address.trim().length < 6) {
    errors.address = 'Enter a complete address';
  }

  if (!values.homeZone.trim()) {
    errors.homeZone = 'Growing zone is required';
  } else if (!/^[0-9]{1,2}[a-z]?$/i.test(values.homeZone.trim())) {
    errors.homeZone = 'Enter a valid zone (e.g., 8a, 9b, 10)';
  }

  if (!(values.shareRadiusMiles > 0)) {
    errors.shareRadiusMiles = 'Share radius must be greater than 0';
  } else if (values.shareRadiusMiles > 100) {
    errors.shareRadiusMiles = 'Share radius must be 100 or less';
  }

  if (values.isOrganization && !values.organizationName.trim()) {
    errors.organizationName = 'Organization name is required';
  }

  return errors;
}
