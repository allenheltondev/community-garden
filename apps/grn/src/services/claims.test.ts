import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiFetch from './api';
import { listClaims } from './claims';

vi.mock('./api', () => ({ default: vi.fn() }));

const mockApiFetch = vi.mocked(apiFetch);

describe('listClaims', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends supported filters and normalizes paginated claim fields', async () => {
    mockApiFetch.mockResolvedValue({
      items: [
        {
          id: 'claim-1',
          listing_id: 'listing-1',
          request_id: null,
          claimer_id: 'grower-2',
          listing_owner_id: 'grower-1',
          quantity_claimed: '2',
          status: 'pending',
          notes: null,
          claimed_at: '2026-07-14T09:00:00Z',
          confirmed_at: null,
          completed_at: null,
          cancelled_at: null,
        },
      ],
      limit: 50,
      offset: 0,
      has_more: true,
      next_offset: 50,
    });

    const result = await listClaims({ listingId: 'listing-1', status: 'pending', limit: 50 });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/claims?limit=50&offset=0&listingId=listing-1&status=pending'
    );
    expect(result).toMatchObject({ hasMore: true, nextOffset: 50 });
    expect(result.items[0]).toMatchObject({
      id: 'claim-1',
      listingId: 'listing-1',
      listingOwnerId: 'grower-1',
      quantityClaimed: '2',
    });
  });
});
