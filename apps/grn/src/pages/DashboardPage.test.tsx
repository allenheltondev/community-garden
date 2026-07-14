import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';
import { getMe, listMyCrops, listReminders } from '../services/api';
import type { GrowerCropItem } from '../types/listing';
import type { UserProfile } from '../types/user';

vi.mock('../services/api', () => ({
  getMe: vi.fn(),
  listMyCrops: vi.fn(),
  listReminders: vi.fn(),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ signOut: vi.fn() }),
}));

const mockGetMe = vi.mocked(getMe);
const mockListMyCrops = vi.mocked(listMyCrops);
const mockListReminders = vi.mocked(listReminders);

const profile = {
  id: 'grower-1',
  email: 'ada@example.com',
  displayName: 'Ada Lovelace',
  userType: 'grower',
  onboardingCompleted: true,
  subscription: { tier: 'free' },
} as unknown as UserProfile;

function crop(overrides: Partial<GrowerCropItem>): GrowerCropItem {
  return {
    id: 'c1',
    userId: 'grower-1',
    canonicalId: null,
    cropName: 'Tomato',
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
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
        <LocationDisplay />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function LocationDisplay() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListReminders.mockResolvedValue({ items: [] });
  });

  it('greets the user and shows the empty-state CTA when there are no crops', async () => {
    mockGetMe.mockResolvedValue(profile);
    mockListMyCrops.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText(/Welcome back, Ada/i)).toBeInTheDocument();
    const cta = await screen.findByRole('button', { name: /add your first crop/i });

    await userEvent.click(cta);
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/crops/new');
    });
  });

  it('summarizes crops and lists upcoming harvests and reminders', async () => {
    mockGetMe.mockResolvedValue(profile);
    mockListMyCrops.mockResolvedValue([
      crop({ id: 'c1', cropName: 'Tomato', status: 'growing', expectedHarvestDate: '2999-01-01' }),
      crop({ id: 'c2', cropName: 'Basil', status: 'planning' }),
      crop({ id: 'c3', cropName: 'Kale', status: 'interested' }),
    ]);
    mockListReminders.mockResolvedValue({
      items: [
        {
          id: 'r1',
          title: 'Water the beds',
          reminderType: 'custom',
          cadenceDays: 1,
          startDate: '2026-07-14',
          timezone: 'UTC',
          status: 'active',
          nextRunAt: '2999-07-15T09:00:00Z',
          lastRunAt: null,
          createdAt: '2026-07-14T00:00:00Z',
        },
      ],
    } as Awaited<ReturnType<typeof listReminders>>);

    renderPage();

    // "Growing now" = 1, "Planning & interested" = 2.
    expect(await screen.findByText('Growing now')).toBeInTheDocument();
    expect(screen.getByText('Planning & interested')).toBeInTheDocument();
    expect(screen.getByText('Upcoming harvests')).toBeInTheDocument();
    expect(screen.getByText('Tomato')).toBeInTheDocument();
    expect(screen.getByText('Water the beds')).toBeInTheDocument();
  });

  it('surfaces an error state when the profile fails to load', async () => {
    mockGetMe.mockRejectedValue(new Error('boom'));
    mockListMyCrops.mockResolvedValue([]);

    renderPage();

    // The profile query retries twice with backoff before failing.
    expect(
      await screen.findByText(/failed to load your garden/i, undefined, { timeout: 5000 })
    ).toBeInTheDocument();
  });
});
