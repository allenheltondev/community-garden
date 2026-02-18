import { fetchAuthSession } from 'aws-amplify/auth';
import { v4 as uuidv4 } from 'uuid';
import { getApiEndpoint } from '../config/amplify';
import type { UserProfile, UserType, GrowerProfile, GathererProfile } from '../types/user';

/**
 * API Client for the Community Food Coordination Platform
 *
 * Features:
 * - Automatic JWT token injection
 * - Correlation ID tracking
 * - 401 error handling
 * - Type-safe API methods
 */

/**
 * API Error class for better error handling
 */
export class ApiError extends Error {
  statusCode?: number;
  correlationId?: string;

  constructor(
    message: string,
    statusCode?: number,
    correlationId?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.correlationId = correlationId;
  }
}

interface FetchOptions extends RequestInit {
  timeout?: number;
}

/**
 * Enhanced fetch wrapper with auth, correlation ID, and error handling
 */
async function apiFetch<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { timeout = 10000, ...fetchOptions } = options;
  const correlationId = uuidv4();
  const baseURL = getApiEndpoint();

  // Build headers
  const headers = new Headers(fetchOptions.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('X-Correlation-Id', correlationId);

  // Add JWT token
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.accessToken?.toString();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  } catch (error) {
    console.error('Failed to get auth session:', error);
    // Continue without token - let the API return 401 if needed
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${baseURL}${endpoint}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle 401 errors
    if (response.status === 401) {
      console.error('Unauthorized request - redirecting to sign in');
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      throw new ApiError('Unauthorized', 401, correlationId);
    }

    // Handle other error responses
    if (!response.ok) {
      let message = response.statusText;
      try {
        const errorData = await response.json();
        message = errorData.message || message;
      } catch {
        // If response body isn't JSON, use statusText
      }

      throw new ApiError(
        message,
        response.status,
        correlationId
      );
    }

    // Parse JSON response
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new ApiError('Request timeout', undefined, correlationId);
      }
      throw new ApiError(error.message, undefined, correlationId);
    }

    throw new ApiError('An unexpected error occurred', undefined, correlationId);
  }
}

/**
 * Get the current user's profile
 *
 * @returns Promise<UserProfile> The authenticated user's profile
 * @throws ApiError if the request fails
 */
export async function getMe(): Promise<UserProfile> {
  try {
    return await apiFetch<UserProfile>('/me');
  } catch (error) {
    if (error instanceof ApiError) {
      throw new ApiError(
        `Failed to fetch user profile: ${error.message}`,
        error.statusCode,
        error.correlationId
      );
    }
    throw new ApiError('An unexpected error occurred while fetching user profile');
  }
}

/**
 * Request payload for updating user profile
 */
export interface UpdateUserProfileRequest {
  displayName?: string;
  userType?: UserType;
  growerProfile?: Omit<GrowerProfile, 'geoKey' | 'createdAt' | 'updatedAt'>;
  gathererProfile?: Omit<GathererProfile, 'geoKey' | 'createdAt' | 'updatedAt'>;
}

/**
 * Update the current user's profile
 *
 * @param data - Profile update data including userType and role-specific profile
 * @returns Promise<UserProfile> The updated user profile
 * @throws ApiError if the request fails
 */
export async function updateMe(data: UpdateUserProfileRequest): Promise<UserProfile> {
  try {
    return await apiFetch<UserProfile>('/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw new ApiError(
        `Failed to update user profile: ${error.message}`,
        error.statusCode,
        error.correlationId
      );
    }
    throw new ApiError('An unexpected error occurred while updating user profile');
  }
}

/**
 * Export the fetch wrapper for direct use if needed
 */
export default apiFetch;
