import { fetchAuthSession } from 'aws-amplify/auth';
import { v4 as uuidv4 } from 'uuid';
import { getApiEndpoint } from '../config/amplify';
import type { UserProfile, UserType, GrowerProfile, GathererProfile } from '../types/user';
import type {
  CatalogCrop,
  CatalogVariety,
  GrowerCropItem,
  Listing,
  ListMyListingsResponse,
  UpsertListingRequest,
} from '../types/listing';

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

  const headers = new Headers(fetchOptions.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('X-Correlation-Id', correlationId);

  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.accessToken?.toString();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  } catch (error) {
    console.error('Failed to get auth session:', error);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${baseURL}${endpoint}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 401) {
      console.error('Unauthorized request - redirecting to sign in');
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      throw new ApiError('Unauthorized', 401, correlationId);
    }

    if (!response.ok) {
      let message = response.statusText;
      try {
        const errorData = await response.json();
        message = errorData.message || errorData.error || message;
      } catch {
        // noop
      }

      throw new ApiError(
        message,
        response.status,
        correlationId
      );
    }

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

export interface UpdateUserProfileRequest {
  displayName?: string;
  userType?: UserType;
  growerProfile?: {
    homeZone: string;
    address: string;
    shareRadiusMiles: number;
    units: GrowerProfile['units'];
    locale: string;
  };
  gathererProfile?: {
    address: string;
    searchRadiusMiles: number;
    organizationAffiliation?: string;
    units: GathererProfile['units'];
    locale: string;
  };
}

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

interface RawCatalogCrop {
  id: string;
  slug: string;
  common_name: string;
  scientific_name: string | null;
  category: string | null;
  description: string | null;
}

interface RawCatalogVariety {
  id: string;
  crop_id: string;
  slug: string;
  name: string;
  description: string | null;
}

interface RawGrowerCropItem {
  id: string;
  user_id: string;
  crop_id: string;
  variety_id: string | null;
  status: string;
  visibility: string;
  surplus_enabled: boolean;
  nickname: string | null;
  default_unit: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface RawListingItem {
  id: string;
  user_id: string;
  grower_crop_id: string | null;
  crop_id: string;
  variety_id: string | null;
  title: string | null;
  unit: string | null;
  quantity_total: string | null;
  quantity_remaining: string | null;
  available_start: string | null;
  available_end: string | null;
  status: string;
  pickup_location_text: string | null;
  pickup_address: string | null;
  pickup_disclosure_policy: string;
  pickup_notes: string | null;
  contact_pref: string;
  geo_key: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

interface RawListingWriteResponse {
  id: string;
  userId: string;
  cropId: string;
  varietyId: string | null;
  title: string;
  quantityTotal: string;
  quantityRemaining: string;
  unit: string;
  availableStart: string;
  availableEnd: string;
  status: string;
  pickupLocationText: string | null;
  pickupAddress: string | null;
  pickupDisclosurePolicy: string;
  pickupNotes: string | null;
  contactPref: string;
  geoKey: string;
  lat: number;
  lng: number;
  createdAt: string;
}

interface RawListMyListingsResponse {
  items: RawListingItem[];
  limit: number;
  offset: number;
  has_more: boolean;
  next_offset: number | null;
}

function mapCatalogCrop(raw: RawCatalogCrop): CatalogCrop {
  return {
    id: raw.id,
    slug: raw.slug,
    commonName: raw.common_name,
    scientificName: raw.scientific_name,
    category: raw.category,
    description: raw.description,
  };
}

function mapCatalogVariety(raw: RawCatalogVariety): CatalogVariety {
  return {
    id: raw.id,
    cropId: raw.crop_id,
    slug: raw.slug,
    name: raw.name,
    description: raw.description,
  };
}

function mapGrowerCropItem(raw: RawGrowerCropItem): GrowerCropItem {
  return {
    id: raw.id,
    userId: raw.user_id,
    cropId: raw.crop_id,
    varietyId: raw.variety_id,
    status: raw.status,
    visibility: raw.visibility,
    surplusEnabled: raw.surplus_enabled,
    nickname: raw.nickname,
    defaultUnit: raw.default_unit,
    notes: raw.notes,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

function mapListingItem(raw: RawListingItem): Listing {
  return {
    id: raw.id,
    userId: raw.user_id,
    growerCropId: raw.grower_crop_id,
    cropId: raw.crop_id,
    varietyId: raw.variety_id,
    title: raw.title ?? '',
    unit: raw.unit ?? '',
    quantityTotal: raw.quantity_total ?? '0',
    quantityRemaining: raw.quantity_remaining ?? '0',
    availableStart: raw.available_start ?? '',
    availableEnd: raw.available_end ?? '',
    status: raw.status,
    pickupLocationText: raw.pickup_location_text,
    pickupAddress: raw.pickup_address,
    pickupDisclosurePolicy: raw.pickup_disclosure_policy,
    pickupNotes: raw.pickup_notes,
    contactPref: raw.contact_pref,
    geoKey: raw.geo_key,
    lat: raw.lat ?? 0,
    lng: raw.lng ?? 0,
    createdAt: raw.created_at,
  };
}

function mapWriteResponse(raw: RawListingWriteResponse): Listing {
  return {
    id: raw.id,
    userId: raw.userId,
    growerCropId: null,
    cropId: raw.cropId,
    varietyId: raw.varietyId,
    title: raw.title,
    unit: raw.unit,
    quantityTotal: raw.quantityTotal,
    quantityRemaining: raw.quantityRemaining,
    availableStart: raw.availableStart,
    availableEnd: raw.availableEnd,
    status: raw.status,
    pickupLocationText: raw.pickupLocationText,
    pickupAddress: raw.pickupAddress,
    pickupDisclosurePolicy: raw.pickupDisclosurePolicy,
    pickupNotes: raw.pickupNotes,
    contactPref: raw.contactPref,
    geoKey: raw.geoKey,
    lat: raw.lat,
    lng: raw.lng,
    createdAt: raw.createdAt,
  };
}

export async function listCatalogCrops(): Promise<CatalogCrop[]> {
  const response = await apiFetch<RawCatalogCrop[]>('/catalog/crops');
  return response.map(mapCatalogCrop);
}

export async function listCatalogVarieties(cropId: string): Promise<CatalogVariety[]> {
  const response = await apiFetch<RawCatalogVariety[]>(`/catalog/crops/${cropId}/varieties`);
  return response.map(mapCatalogVariety);
}

export async function listMyCrops(): Promise<GrowerCropItem[]> {
  const response = await apiFetch<RawGrowerCropItem[]>('/crops');
  return response.map(mapGrowerCropItem);
}

export async function listMyListings(
  limit = 20,
  offset = 0,
  status?: 'active' | 'expired' | 'completed'
): Promise<ListMyListingsResponse> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  if (status) {
    params.set('status', status);
  }

  const response = await apiFetch<RawListMyListingsResponse>(`/my/listings?${params.toString()}`);
  return {
    items: response.items.map(mapListingItem),
    limit: response.limit,
    offset: response.offset,
    hasMore: response.has_more,
    nextOffset: response.next_offset,
  };
}

export async function getMyListing(listingId: string): Promise<Listing> {
  const response = await apiFetch<RawListingItem>(`/my/listings/${listingId}`);
  return mapListingItem(response);
}

export async function createListing(data: UpsertListingRequest): Promise<Listing> {
  const response = await apiFetch<RawListingWriteResponse>('/listings', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  return mapWriteResponse(response);
}

export async function updateListing(listingId: string, data: UpsertListingRequest): Promise<Listing> {
  const response = await apiFetch<RawListingWriteResponse>(`/listings/${listingId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

  return mapWriteResponse(response);
}

export default apiFetch;
