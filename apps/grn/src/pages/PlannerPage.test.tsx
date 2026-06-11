import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PlannerPage } from './PlannerPage';
import { getMe, listMyCrops } from '../services/api';
import type { GrowerCropItem } from '../types/listing';
import type { UserProfile } from '../types/user';

vi.mock('../services/api', () => ({
  getMe: vi.fn(),
  listMyCrops: vi.fn(),
}));

const mockGetMe = vi.mocked(getMe);
const mockListMyCrops = vi.mocked(listMyCrops);

const growerProfile = {
  id: 'grower-1',
  userType: 'grower',
} as unknown as UserProfile;

function crop(id: string, cropName: string, pyramidTier?: number | null): GrowerCropItem {
  return {
    id,
    userId: 'grower-1',
    canonicalId: null,
    cropName,
    varietyId: null,
    status: 'growing',
    visibility: 'private',
    surplusEnabled: false,
    nickname: null,
    defaultUnit: null,
    notes: null,
    bedId: null,
    bedName: null,
    plantingDate: null,
    expectedHarvestDate: null,
    plantCount: null,
    spacingInches: null,
    pyramidTier: pyramidTier ?? null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PlannerPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PlannerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMe.mockResolvedValue(growerProfile);
    mockListMyCrops.mockResolvedValue([]);

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('renders the five pyramid layers', async () => {
    renderPage();
    expect(await screen.findByTestId('pyramid-band-foundation')).toBeInTheDocument();
    expect(screen.getByTestId('pyramid-band-workhorse')).toBeInTheDocument();
    expect(screen.getByTestId('pyramid-band-fresh')).toBeInTheDocument();
    expect(screen.getByTestId('pyramid-band-flavor')).toBeInTheDocument();
    expect(screen.getByTestId('pyramid-band-joy')).toBeInTheDocument();
  });

  it('counts the grower crops that fall into each layer', async () => {
    mockListMyCrops.mockResolvedValue([
      crop('c1', 'Potato'),
      crop('c2', 'Tomato'),
      crop('c3', 'Cucumber'),
    ]);
    renderPage();

    // Foundation has 1 (potato), Workhorse has 2 (tomato, cucumber).
    await waitFor(() =>
      expect(screen.getByTestId('pyramid-count-foundation')).toHaveTextContent('1')
    );
    expect(screen.getByTestId('pyramid-count-workhorse')).toHaveTextContent('2');
    // The Fresh layer has nothing, so it shows the "+" add affordance.
    expect(screen.getByTestId('pyramid-count-fresh')).toHaveTextContent('+');

    expect(screen.getByText(/of 5 layers started/i)).toHaveTextContent(
      '2 of 5 layers started'
    );
  });

  it('sorts a crop by its catalog pyramidTier even when the name says otherwise', async () => {
    // "Tomato" classifies to Workhorse by name, but the catalog tier (Joy) wins.
    mockListMyCrops.mockResolvedValue([crop('c1', 'Tomato', 5)]);
    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId('pyramid-count-joy')).toHaveTextContent('1')
    );
    expect(screen.getByTestId('pyramid-count-workhorse')).toHaveTextContent('+');
  });

  it('shows a plan score gauge', async () => {
    mockListMyCrops.mockResolvedValue([crop('c1', 'Potato'), crop('c2', 'Tomato')]);
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('img', { name: /plan score \d+ out of 100/i })).toBeInTheDocument()
    );
  });

  it('shows the selected layer detail and switches when another band is clicked', async () => {
    mockListMyCrops.mockResolvedValue([crop('c1', 'Basil')]);
    const user = userEvent.setup();
    renderPage();

    // Default focus is the Foundation layer.
    const detail = await screen.findByRole('heading', { name: 'Foundation' });
    expect(detail).toBeInTheDocument();

    await user.click(screen.getByTestId('pyramid-band-flavor'));

    expect(await screen.findByRole('heading', { name: 'Flavor' })).toBeInTheDocument();
    // The grower's basil should appear in the Flavor layer's crop list.
    // (Scoped to span chips — the pyramid silhouette also carries an svg
    // <title>Basil</title> tooltip.)
    expect(screen.getByText('Basil', { selector: 'span' })).toBeInTheDocument();
  });

  it('surfaces crops it cannot place in a "Not yet placed" section', async () => {
    mockListMyCrops.mockResolvedValue([crop('c1', 'Dragonfruit cactus')]);
    renderPage();

    expect(await screen.findByText(/Not yet placed/i)).toBeInTheDocument();
    expect(screen.getByText('Dragonfruit cactus')).toBeInTheDocument();
  });

  it('redirects non-growers home', async () => {
    mockGetMe.mockResolvedValue({ id: 'g1', userType: 'gatherer' } as unknown as UserProfile);
    renderPage();
    await waitFor(() => {
      expect(screen.queryByTestId('pyramid-band-foundation')).not.toBeInTheDocument();
    });
  });
});
