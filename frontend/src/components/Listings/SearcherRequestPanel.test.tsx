import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearcherRequestPanel } from './SearcherRequestPanel';
import { createRequest, discoverListings, listCatalogCrops, updateRequest } from '../../services/api';
import { createClaim, updateClaimStatus } from '../../services/claims';

vi.mock('../../services/api', () => ({
  createRequest: vi.fn(),
  discoverListings: vi.fn(),
  listCatalogCrops: vi.fn(),
  updateRequest: vi.fn(),
}));

vi.mock('../../services/claims', () => ({
  createClaim: vi.fn(),
  updateClaimStatus: vi.fn(),
}));

const mockCreateRequest = vi.mocked(createRequest);
const mockDiscoverListings = vi.mocked(discoverListings);
const mockListCatalogCrops = vi.mocked(listCatalogCrops);
const mockUpdateRequest = vi.mocked(updateRequest);
const mockCreateClaim = vi.mocked(createClaim);
const mockUpdateClaimStatus = vi.mocked(updateClaimStatus);

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SearcherRequestPanel
        viewerUserId="gatherer-1"
        gathererGeoKey="9v6kn"
        defaultLat={30.2672}
        defaultLng={-97.7431}
        defaultRadiusMiles={10}
      />
    </QueryClientProvider>
  );
}

describe('SearcherRequestPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();

    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });

    mockListCatalogCrops.mockResolvedValue([
      {
        id: 'crop-1',
        slug: 'tomato',
        commonName: 'Tomato',
        scientificName: null,
        category: 'fruit',
        description: null,
      },
      {
        id: 'crop-2',
        slug: 'kale',
        commonName: 'Kale',
        scientificName: null,
        category: 'leafy',
        description: null,
      },
    ]);

    mockDiscoverListings.mockResolvedValue({
      items: [
        {
          id: 'listing-1',
          userId: 'grower-1',
          growerCropId: null,
          cropId: 'crop-1',
          varietyId: null,
          title: 'Tomatoes Basket',
          unit: 'lb',
          quantityTotal: '10',
          quantityRemaining: '8',
          availableStart: '2026-02-20T10:00:00.000Z',
          availableEnd: '2026-02-21T10:00:00.000Z',
          status: 'active',
          pickupLocationText: 'Front porch',
          pickupAddress: null,
          pickupDisclosurePolicy: 'after_confirmed',
          pickupNotes: null,
          contactPref: 'app_message',
          geoKey: '9v6kn',
          lat: 30.2672,
          lng: -97.7431,
          createdAt: '2026-02-20T10:00:00.000Z',
        },
      ],
      limit: 30,
      offset: 0,
      hasMore: false,
      nextOffset: null,
    });

    mockCreateRequest.mockResolvedValue({
      id: 'request-1',
      userId: 'gatherer-1',
      cropId: 'crop-1',
      varietyId: null,
      unit: 'lb',
      quantity: '2',
      neededBy: '2026-02-21T18:00:00.000Z',
      notes: 'Need for family meal prep',
      geoKey: '9v6kn',
      lat: 30.2672,
      lng: -97.7431,
      status: 'open',
      createdAt: '2026-02-20T10:15:00.000Z',
    });

    mockUpdateRequest.mockResolvedValue({
      id: 'request-1',
      userId: 'gatherer-1',
      cropId: 'crop-1',
      varietyId: null,
      unit: 'lb',
      quantity: '5',
      neededBy: '2026-02-21T18:00:00.000Z',
      notes: 'Updated quantity',
      geoKey: '9v6kn',
      lat: 30.2672,
      lng: -97.7431,
      status: 'open',
      createdAt: '2026-02-20T10:15:00.000Z',
    });

    mockCreateClaim.mockResolvedValue({
      id: 'claim-1',
      listingId: 'listing-1',
      requestId: null,
      claimerId: 'gatherer-1',
      listingOwnerId: 'grower-1',
      quantityClaimed: '1',
      status: 'pending',
      notes: null,
      claimedAt: '2026-02-20T11:00:00.000Z',
      confirmedAt: null,
      completedAt: null,
      cancelledAt: null,
    });

    mockUpdateClaimStatus.mockResolvedValue({
      id: 'claim-1',
      listingId: 'listing-1',
      requestId: null,
      claimerId: 'gatherer-1',
      listingOwnerId: 'grower-1',
      quantityClaimed: '1',
      status: 'cancelled',
      notes: null,
      claimedAt: '2026-02-20T11:00:00.000Z',
      confirmedAt: null,
      completedAt: null,
      cancelledAt: '2026-02-20T11:05:00.000Z',
    });
  });

  it('lets a searcher discover a listing and submit a request in one session', async () => {
    const user = userEvent.setup();

    renderPanel();

    expect(await screen.findByText('Tomatoes Basket')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /request this item/i }));
    await user.clear(screen.getByLabelText(/quantity/i));
    await user.type(screen.getByLabelText(/quantity/i), '2');
    await user.type(screen.getByLabelText(/notes/i), 'Need for family meal prep');

    await user.click(screen.getByRole('button', { name: /create request/i }));

    await waitFor(() => {
      expect(mockCreateRequest).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText(/request submitted/i)).toBeInTheDocument();
    expect(await screen.findByText(/requests this session/i)).toBeInTheDocument();
  });

  it('shows an empty state when no listings are discovered', async () => {
    mockDiscoverListings.mockResolvedValueOnce({
      items: [],
      limit: 30,
      offset: 0,
      hasMore: false,
      nextOffset: null,
    });

    renderPanel();

    expect(await screen.findByText(/no listings found in this area yet/i)).toBeInTheDocument();
  });

  it('shows an error state when discovery fails', async () => {
    mockDiscoverListings.mockRejectedValueOnce(new Error('Discovery failed'));

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/discovery failed/i)).toBeInTheDocument();
    });
  });

  it('supports editing a request created in the current session', async () => {
    const user = userEvent.setup();

    renderPanel();

    expect(await screen.findByText('Tomatoes Basket')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /request this item/i }));
    await user.click(screen.getByRole('button', { name: /create request/i }));

    expect(await screen.findByRole('button', { name: /edit request/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /edit request/i }));
    await user.clear(screen.getByLabelText(/quantity/i));
    await user.type(screen.getByLabelText(/quantity/i), '5');

    await user.click(screen.getByRole('button', { name: /update request/i }));

    await waitFor(() => {
      expect(mockUpdateRequest).toHaveBeenCalledTimes(1);
    });

    expect(mockUpdateRequest).toHaveBeenCalledWith(
      'request-1',
      expect.objectContaining({ quantity: 5 })
    );
  });

  it('creates a claim and allows valid transitions from pending', async () => {
    const user = userEvent.setup();

    renderPanel();

    expect(await screen.findByText('Tomatoes Basket')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /claim this listing/i }));

    await waitFor(() => {
      expect(mockCreateClaim).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText(/claim submitted/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    await waitFor(() => {
      expect(mockUpdateClaimStatus).toHaveBeenCalledWith('claim-1', { status: 'cancelled' });
    });
  });

  it('restores previous claim state when transition fails', async () => {
    const user = userEvent.setup();
    mockUpdateClaimStatus.mockRejectedValueOnce(new Error('Transition failed'));

    renderPanel();

    expect(await screen.findByText('Tomatoes Basket')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /claim this listing/i }));

    await waitFor(() => {
      expect(mockCreateClaim).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText(/status: pending/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(await screen.findByText(/transition failed/i)).toBeInTheDocument();
    expect(screen.getByText(/status: pending/i)).toBeInTheDocument();
  });
});
