/**
 * User tier levels in the platform
 */
export type UserTier = 'neighbor' | 'supporter' | 'caretaker';

/**
 * User profile information returned from the API
 * Matches the backend UserProfile model
 */
export interface UserProfile {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  tier: UserTier;
}
