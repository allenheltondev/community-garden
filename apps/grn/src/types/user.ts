/**
 * User tier levels in the platform
 */
export type UserTier = 'free' | 'supporter' | 'pro';

/**
 * User type indicating participation mode
 */
export type UserType = 'grower' | 'gatherer';

/**
 * Grower-specific profile information
 */
export interface GrowerProfile {
  homeZone: string;
  address: string;
  geoKey: string;
  lat?: number;
  lng?: number;
  shareRadiusMiles: number;
  isOrganization: boolean;
  organizationName?: string;
  units: 'metric' | 'imperial';
  locale: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Gatherer-specific profile information
 */
export interface GathererProfile {
  address: string;
  geoKey: string;
  lat: number;
  lng: number;
  searchRadiusMiles: number;
  organizationAffiliation?: string;
  units: 'metric' | 'imperial';
  locale: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Subscription metadata nested under the user profile.
 * Mirrors `SubscriptionMetadata` on the backend.
 */
export interface SubscriptionMetadata {
  tier: UserTier;
  subscriptionStatus?: string | null;
  proExpiresAt?: string | null;
}

/**
 * User profile returned from `GET /me`.
 *
 * The shape mirrors the GRN backend's `MeProfileResponse` after the
 * foundation profile consolidation: identity (name, email) lives in
 * Cognito and is exposed as a single `displayName`, and tier moved
 * under `subscription`. The frontend should not reach for old
 * `firstName`/`lastName`/top-level `tier` fields — they no longer
 * exist on the wire.
 */
export interface UserProfile {
  id: string;
  email?: string | null;
  displayName?: string | null;
  isVerified?: boolean;
  userType: UserType | null;
  onboardingCompleted: boolean;
  createdAt?: string;
  subscription: SubscriptionMetadata;
  growerProfile?: GrowerProfile | null;
  gathererProfile?: GathererProfile | null;
}
