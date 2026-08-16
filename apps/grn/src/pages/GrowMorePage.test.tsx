import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { GrowMorePage } from './GrowMorePage';
import { getMe, listMyCrops } from '../services/api';
import type { GrowerCropItem } from '../types/listing';
import type { UserProfile } from '../types/user';

vi.mock('../services/api', () => ({
  getMe: vi.fn(),
  listMyCrops: vi.fn(),
}));

const mockGetMe = vi.mocked(getMe);
const mockListMyCrops = vi.mocked(listMyCrops);

function crop(cropName: string): GrowerCropItem {
  return {
    id: `crop-${cropName}`,
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
    pyramidTier: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
}

function LocationDisplay() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GrowMorePage />
        <LocationDisplay />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('GrowMorePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Mid-summer in the northern hemisphere, so the season-aware sections are
    // deterministic regardless of when the suite runs.
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));
    mockGetMe.mockResolvedValue({
      id: 'grower-1',
      email: 'ada@example.com',
      userType: 'grower',
      onboardingCompleted: true,
      growerProfile: { homeZone: '8a', lat: 30.2 },
    } as UserProfile);
    mockListMyCrops.mockResolvedValue([]);
  });

  it('frames the library as optional opportunities rather than a goal', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Grow more of your own' })
    ).toBeInTheDocument();
    expect(screen.getByText(/there is no target here/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Growing all of your own food is not the point of Good Roots/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('highlights practices that match the season and the garden', async () => {
    mockListMyCrops.mockResolvedValue([crop('Tomato')]);

    renderPage();

    const timely = await screen.findByRole('region', { name: /worth a look this season/i });
    const seedCard = within(timely).getByText('Save seed from a favorite plant').closest('li');
    expect(seedCard).not.toBeNull();
    expect(
      within(seedCard as HTMLElement).getByText('Timely in summer — you are growing Tomato')
    ).toBeInTheDocument();
  });

  it('reveals how a practice works on demand', async () => {
    renderPage();

    const toggles = await screen.findAllByRole('button', { name: 'How it works' });
    await userEvent.click(toggles[0]);

    expect(screen.getByText('What it opens up')).toBeInTheDocument();
    expect(screen.getByText('One small start')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();
  });

  it('links a practice to the part of the app that supports it', async () => {
    renderPage();

    const seedSaving = await screen.findByText('Save seed from a favorite plant');
    const card = seedSaving.closest('li');
    expect(card).not.toBeNull();
    await userEvent.click(within(card as HTMLElement).getByRole('button', { name: 'How it works' }));
    await userEvent.click(
      within(card as HTMLElement).getByRole('button', { name: 'Note it in your journal' })
    );

    expect(screen.getByTestId('location')).toHaveTextContent('/garden/journal');
  });
});
