import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { GrowerListingPanel } from './GrowerListingPanel';
import type { Listing } from '../../types/listing';
import {
  createListing,
  getMyListing,
  listCatalogCrops,
  listCatalogVarieties,
  listMyCrops,
  listMyListings,
  updateListing,
} from '../../services/api';
import { listClaims, updateClaimStatus } from '../../services/claims';

vi.mock('../../services/api', () => ({
  createListing: vi.fn(),
  getMyListing: vi.fn(),
  listCatalogCrops: vi.fn(),
  listCatalogVarieties: vi.fn(),
  listMyCrops: vi.fn(),
  listMyListings: vi.fn(),
  updateListing: vi.fn(),
}));

vi.mock('../../services/claims', () => ({
  listClaims: vi.fn(),
  updateClaimStatus: vi.fn(),
}));

const mockListCatalogCrops = vi.mocked(listCatalogCrops);
const mockListCatalogVarieties = vi.mocked(listCatalogVarieties);
const mockListMyCrops = vi.mocked(listMyCrops);
const mockListMyListings = vi.mocked(listMyListings);
const mockGetMyListing = vi.mocked(getMyListing);
const mockCreateListing = vi.mocked(createListing);
const mockUpdateListing = vi.mocked(updateListing);
const mockUpdateClaimStatus = vi.mocked(updateClaimStatus);
const mockListClaims = vi.mocked(listClaims);

function setOnlineStatus(isOnline: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: isOnline,
  });
}

function makeListing(overrides: Partial<Listing>): Listing {
  return {
    id: 'listing-1',
    userId: 'user-1',
    growerCropId: null,
    cropId: 'crop-1',
    varietyId: null,
    title: 'Tomatoes Basket',
    unit: 'lb',
    quantityTotal: '10',
    quantityRemaining: '6',
    availableStart: '2026-02-20T10:00:00.000Z',
    availableEnd: '2026-02-20T18:00:00.000Z',
    status: 'active',
    pickupLocationText: 'Front porch',
    pickupAddress: null,
    pickupDisclosurePolicy: 'after_confirmed',
    pickupNotes: null,
    contactPref: 'app_message',
    geoKey: 'dr5ru',
    lat: 30.2672,
    lng: -97.7431,
    createdAt: '2026-02-20T08:00:00.000Z',
    ...overrides,
  };
}

function renderPanel(initialEntry = '/') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <GrowerListingPanel viewerUserId="user-1" defaultLat={30.2672} defaultLng={-97.7431} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('GrowerListingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    setOnlineStatus(true);

    mockListCatalogCrops.mockResolvedValue([
      {
        id: 'crop-1',
        slug: 'tomato',
        commonName: 'Tomato',
        scientificName: null,
        category: 'fruit',
        description: null,
      },
    ]);
    mockListCatalogVarieties.mockResolvedValue([]);
    mockListMyCrops.mockResolvedValue([]);
    mockCreateListing.mockResolvedValue(makeListing({ id: 'new-listing' }));
    mockUpdateListing.mockResolvedValue(makeListing({ id: 'updated-listing' }));
    mockListClaims.mockResolvedValue({
      items: [],
      limit: 50,
      offset: 0,
      hasMore: false,
      nextOffset: null,
    });
    mockUpdateClaimStatus.mockResolvedValue({
      id: 'claim-1',
      listingId: 'listing-1',
      requestId: null,
      claimerId: 'grower-2',
      listingOwnerId: 'user-1',
      quantityClaimed: '1',
      status: 'confirmed',
      notes: null,
      claimedAt: '2026-02-20T11:00:00.000Z',
      confirmedAt: '2026-02-20T11:02:00.000Z',
      completedAt: null,
      cancelledAt: null,
    });
  });

  it('renders food offers, applies human status filters, and opens pickup details', async () => {
    const user = userEvent.setup();

    const activeListing = makeListing({ id: 'listing-1', title: 'Tomatoes Basket', status: 'active' });
    const expiredListing = makeListing({
      id: 'listing-2',
      title: 'Late Kale',
      status: 'expired',
      quantityRemaining: '0',
      unit: 'bunch',
      pickupLocationText: 'Driveway table',
    });

    mockListMyListings.mockResolvedValue({
      items: [activeListing, expiredListing],
      limit: 50,
      offset: 0,
      hasMore: false,
      nextOffset: null,
    });

    mockGetMyListing.mockImplementation(async (listingId: string) => {
      return listingId === 'listing-2' ? expiredListing : activeListing;
    });

    renderPanel();

    expect(await screen.findByText('Tomatoes Basket')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Current' })).toBeInTheDocument();
    expect(screen.queryByText('Late Kale')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ended' }));

    expect(await screen.findByText('Late Kale')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /pickup details/i }));

    expect(await screen.findByText(/food to share details/i)).toBeInTheDocument();
    expect(screen.getByText(/driveway table/i)).toBeInTheDocument();
  });

  it('shows an empty hub and keeps sharing one action away', async () => {
    const user = userEvent.setup();

    mockListMyListings.mockResolvedValue({
      items: [],
      limit: 50,
      offset: 0,
      hasMore: false,
      nextOffset: null,
    });
    mockGetMyListing.mockResolvedValue(makeListing({ id: 'listing-1' }));

    renderPanel();

    expect(await screen.findByText(/no food offers match this view/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^share food$/i }));
    expect(await screen.findByRole('heading', { name: /^share food$/i })).toBeInTheDocument();
  });

  it('shows error state when listing queries fail', async () => {
    mockListMyListings.mockRejectedValue(new Error('Listings request failed'));

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/listings request failed/i)).toBeInTheDocument();
    });
  });

  it('pre-seeds edit form from selected listing while detail query is loading', async () => {
    const user = userEvent.setup();
    const activeListing = makeListing({
      id: 'listing-1',
      title: 'Tomatoes Basket',
      status: 'active',
      quantityTotal: '12',
      quantityRemaining: '8',
    });

    mockListMyListings.mockResolvedValue({
      items: [activeListing],
      limit: 50,
      offset: 0,
      hasMore: false,
      nextOffset: null,
    });

    let resolveDetail: ((value: Listing) => void) | undefined;
    const pendingDetail = new Promise<Listing>((resolve) => {
      resolveDetail = resolve;
    });
    mockGetMyListing.mockReturnValue(pendingDetail);

    renderPanel();

    expect(await screen.findByText('Tomatoes Basket')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit offer' }));

    expect(await screen.findByRole('heading', { name: /edit food offer/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/share title/i)).toHaveValue('Tomatoes Basket');

    resolveDetail?.(activeListing);
  });

  it('shows grower claim transitions and confirms pending claims', async () => {
    const user = userEvent.setup();

    mockListMyListings.mockResolvedValue({
      items: [makeListing({ id: 'listing-1', title: 'Tomatoes Basket', status: 'active' })],
      limit: 50,
      offset: 0,
      hasMore: false,
      nextOffset: null,
    });
    mockGetMyListing.mockResolvedValue(makeListing({ id: 'listing-1', title: 'Tomatoes Basket' }));

    window.localStorage.setItem(
      'claim-session-v1:user-1',
      JSON.stringify([
        {
          id: 'claim-1',
          listingId: 'listing-1',
          requestId: null,
          claimerId: 'grower-2',
          listingOwnerId: 'user-1',
          quantityClaimed: '1',
          status: 'pending',
          notes: null,
          claimedAt: '2026-02-20T11:00:00.000Z',
          confirmedAt: null,
          completedAt: null,
          cancelledAt: null,
        },
      ])
    );

    renderPanel();

    expect(await screen.findByText('Tomatoes Basket')).toBeInTheDocument();
    window.dispatchEvent(new Event('online'));
    await user.click(screen.getByRole('button', { name: /pickup details/i }));

    const claimSectionHeading = await screen.findByRole('heading', { name: /pickup coordination/i });
    const claimSection = claimSectionHeading.closest('.rounded-base');
    expect(claimSection).not.toBeNull();
    expect(within(claimSection as HTMLElement).getByRole('button', { name: /confirm pickup/i })).toBeInTheDocument();
    expect(within(claimSection as HTMLElement).queryByRole('button', { name: /mark picked up/i })).not.toBeInTheDocument();
  });

  it('opens and highlights the exact listing claim from a Today deep link', async () => {
    const listing = makeListing({ id: 'listing-1', title: 'Tomatoes Basket' });
    mockListMyListings.mockResolvedValue({
      items: [listing],
      limit: 50,
      offset: 0,
      hasMore: false,
      nextOffset: null,
    });
    mockGetMyListing.mockResolvedValue(listing);
    mockListClaims.mockResolvedValue({
      items: [
        {
          id: 'claim-server',
          listingId: 'listing-1',
          requestId: null,
          claimerId: 'grower-2',
          listingOwnerId: 'user-1',
          quantityClaimed: '1',
          status: 'pending',
          notes: null,
          claimedAt: '2026-07-14T09:00:00Z',
          confirmedAt: null,
          completedAt: null,
          cancelledAt: null,
        },
      ],
      limit: 50,
      offset: 0,
      hasMore: false,
      nextOffset: null,
    });

    renderPanel('/share/listings?listing=listing-1&claim=claim-server');

    expect(await screen.findByRole('heading', { name: 'Food to share & pickups' })).toBeInTheDocument();
    await screen.findByText(/waiting for confirmation/i);
    expect(document.querySelector('[aria-current="true"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /confirm pickup/i })).toBeInTheDocument();
  });

  it('prefills an editable share draft from a saved harvest deep link', async () => {
    const user = userEvent.setup();
    mockListMyCrops.mockResolvedValue([
      {
        id: 'grower-crop-1',
        userId: 'user-1',
        canonicalId: 'crop-1',
        cropName: 'Tomato',
        varietyId: null,
        status: 'growing',
        visibility: 'private',
        surplusEnabled: true,
        nickname: 'Patio tomatoes',
        defaultUnit: 'lb',
        notes: null,
        bedId: null,
        bedName: null,
        plantingDate: null,
        expectedHarvestDate: null,
        plantCount: null,
        spacingInches: null,
        pyramidTier: null,
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-01T00:00:00Z',
      },
    ]);
    mockListMyListings.mockResolvedValue({
      items: [],
      limit: 50,
      offset: 0,
      hasMore: false,
      nextOffset: null,
    });

    renderPanel('/share/listings?crop=grower-crop-1&harvest=h1&quantity=3.5&unit=lb');

    expect(await screen.findByLabelText(/share title/i)).toHaveValue('Patio tomatoes');
    expect(screen.getByLabelText(/quantity/i)).toHaveValue(3.5);
    expect(screen.getByLabelText(/unit/i)).toHaveValue('lb');
    expect(screen.getByText(/prefilled from your saved harvest/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/quantity/i));
    await user.type(screen.getByLabelText(/quantity/i), '4');
    expect(screen.getByLabelText(/quantity/i)).toHaveValue(4);
  });

  it('requires confirmation and reuses the idempotency key when a share is retried', async () => {
    const user = userEvent.setup();
    mockListMyCrops.mockResolvedValue([
      {
        id: 'grower-crop-1',
        userId: 'user-1',
        canonicalId: 'crop-1',
        cropName: 'Tomato',
        varietyId: null,
        status: 'growing',
        visibility: 'private',
        surplusEnabled: true,
        nickname: null,
        defaultUnit: 'lb',
        notes: null,
        bedId: null,
        bedName: null,
        plantingDate: null,
        expectedHarvestDate: null,
        plantCount: null,
        spacingInches: null,
        pyramidTier: null,
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-01T00:00:00Z',
      },
    ]);
    mockListMyListings.mockResolvedValue({
      items: [], limit: 50, offset: 0, hasMore: false, nextOffset: null,
    });
    mockCreateListing
      .mockRejectedValueOnce(new Error('Connection interrupted'))
      .mockResolvedValueOnce(makeListing({ id: 'new-listing' }));

    renderPanel('/share/listings?crop=grower-crop-1&quantity=2&unit=lb');

    await screen.findByLabelText(/share title/i);
    await user.click(screen.getByRole('button', { name: /review share/i }));
    expect(mockCreateListing).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /confirm and share/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/connection interrupted/i);
    await user.click(screen.getByRole('button', { name: /confirm and share/i }));

    await waitFor(() => expect(mockCreateListing).toHaveBeenCalledTimes(2));
    expect(mockCreateListing.mock.calls[0][1]).toBe(mockCreateListing.mock.calls[1][1]);
    expect(mockCreateListing.mock.calls[0][1]).toMatch(/^share-/);
    expect(await screen.findByText(/now available to nearby neighbors/i)).toBeInTheDocument();
  });

  it('shows completed pickups only in the grower private impact summary', async () => {
    mockListMyListings.mockResolvedValue({
      items: [makeListing({ id: 'listing-1' })],
      limit: 50,
      offset: 0,
      hasMore: false,
      nextOffset: null,
    });
    mockListClaims.mockResolvedValue({
      items: [
        {
          id: 'claim-1',
          listingId: 'listing-1',
          requestId: null,
          claimerId: 'neighbor-1',
          listingOwnerId: 'user-1',
          quantityClaimed: '2',
          status: 'completed',
          notes: null,
          claimedAt: '2026-07-14T09:00:00Z',
          confirmedAt: '2026-07-14T10:00:00Z',
          completedAt: '2026-07-14T11:00:00Z',
          cancelledAt: null,
        },
      ],
      limit: 50,
      offset: 0,
      hasMore: false,
      nextOffset: null,
    });

    renderPanel();

    expect(await screen.findByText(/1 neighbor pickup completed/i)).toBeInTheDocument();
  });
});
