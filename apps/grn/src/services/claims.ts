import apiFetch from './api';
import type { Claim, CreateClaimPayload, TransitionClaimPayload } from '../types/claim';

export interface ListClaimsQuery {
  listingId?: string;
  requestId?: string;
  status?: Claim['status'];
  limit?: number;
  offset?: number;
}

export interface ListClaimsResponse {
  items: Claim[];
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
}

interface RawClaimResponse {
  id: string;
  listingId?: string;
  listing_id?: string;
  requestId?: string | null;
  request_id?: string | null;
  claimerId?: string;
  claimer_id?: string;
  listingOwnerId?: string;
  listing_owner_id?: string;
  quantityClaimed?: string;
  quantity_claimed?: string;
  status: Claim['status'];
  notes?: string | null;
  claimedAt?: string;
  claimed_at?: string;
  confirmedAt?: string | null;
  confirmed_at?: string | null;
  completedAt?: string | null;
  completed_at?: string | null;
  cancelledAt?: string | null;
  cancelled_at?: string | null;
}

function mapClaim(raw: RawClaimResponse): Claim {
  return {
    id: raw.id,
    listingId: raw.listingId ?? raw.listing_id ?? '',
    requestId: raw.requestId ?? raw.request_id ?? null,
    claimerId: raw.claimerId ?? raw.claimer_id ?? '',
    listingOwnerId: raw.listingOwnerId ?? raw.listing_owner_id ?? '',
    quantityClaimed: raw.quantityClaimed ?? raw.quantity_claimed ?? '0',
    status: raw.status,
    notes: raw.notes ?? null,
    claimedAt: raw.claimedAt ?? raw.claimed_at ?? '',
    confirmedAt: raw.confirmedAt ?? raw.confirmed_at ?? null,
    completedAt: raw.completedAt ?? raw.completed_at ?? null,
    cancelledAt: raw.cancelledAt ?? raw.cancelled_at ?? null,
  };
}

interface RawListClaimsResponse {
  items: RawClaimResponse[];
  limit: number;
  offset: number;
  hasMore?: boolean;
  has_more?: boolean;
  nextOffset?: number | null;
  next_offset?: number | null;
}

export async function listClaims({
  listingId,
  requestId,
  status,
  limit = 20,
  offset = 0,
}: ListClaimsQuery = {}): Promise<ListClaimsResponse> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (listingId) params.set('listingId', listingId);
  if (requestId) params.set('requestId', requestId);
  if (status) params.set('status', status);

  const response = await apiFetch<RawListClaimsResponse>(`/claims?${params.toString()}`);
  return {
    items: response.items.map(mapClaim),
    limit: response.limit,
    offset: response.offset,
    hasMore: response.hasMore ?? response.has_more ?? false,
    nextOffset: response.nextOffset ?? response.next_offset ?? null,
  };
}

export async function createClaim(payload: CreateClaimPayload): Promise<Claim> {
  const response = await apiFetch<RawClaimResponse>('/claims', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return mapClaim(response);
}

export async function updateClaimStatus(
  claimId: string,
  payload: TransitionClaimPayload
): Promise<Claim> {
  const response = await apiFetch<RawClaimResponse>(`/claims/${claimId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  return mapClaim(response);
}
