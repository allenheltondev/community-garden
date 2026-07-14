import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { AuthenticatedRoot } from './AuthenticatedRoot';

vi.mock('../hooks/useUser', () => ({
  useUser: () => ({
    user: {
      id: 'grower-1',
      email: 'ada@example.com',
      displayName: 'Ada Lovelace',
      userType: 'grower',
      onboardingCompleted: true,
      subscription: { tier: 'free' },
    },
    isLoading: false,
    refreshUser: vi.fn(),
  }),
}));

vi.mock('./AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../components/Onboarding/OnboardingGuard', () => ({
  OnboardingGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../pages/DashboardPage', () => ({ DashboardPage: () => <h1>Today page</h1> }));
vi.mock('../pages/CropsPage', () => ({ CropsPage: () => <h1>Plants page</h1> }));
vi.mock('../pages/NewCropPage', () => ({ NewCropPage: () => <h1>New plant page</h1> }));
vi.mock('../pages/PlannerPage', () => ({ PlannerPage: () => <h1>Plan page</h1> }));
vi.mock('../pages/RecommendationsPage', () => ({
  RecommendationsPage: () => <h1>Recommendations page</h1>,
}));
vi.mock('../pages/GardenDesignerPage', () => ({
  GardenDesignerPage: () => <h1>Garden map page</h1>,
}));
vi.mock('../pages/GardenWorkspacePage', async () => {
  const { Outlet } = await import('react-router-dom');
  return { GardenWorkspacePage: () => <><span>Garden workspace</span><Outlet /></> };
});
vi.mock('../pages/ConnectPage', () => ({ ConnectPage: () => <h1>Share page</h1> }));
vi.mock('../pages/ListingsPage', () => ({ ListingsPage: () => <h1>Listings page</h1> }));
vi.mock('../pages/RequestsPage', () => ({ RequestsPage: () => <h1>Find food page</h1> }));
vi.mock('../pages/RemindersPage', () => ({ RemindersPage: () => <h1>Reminders page</h1> }));
vi.mock('../pages/SettingsPage', () => ({ SettingsPage: () => <h1>Settings page</h1> }));

function LocationDisplay() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>;
}

function BackButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>Back</button>;
}

function renderRoot(initialEntries: string[], initialIndex = initialEntries.length - 1) {
  return render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
      <AuthenticatedRoot />
      <LocationDisplay />
      <BackButton />
    </MemoryRouter>
  );
}

describe('AuthenticatedRoot routes', () => {
  it.each([
    ['/today/reminders', 'Reminders page'],
    ['/garden', 'Garden map page'],
    ['/garden/plants', 'Plants page'],
    ['/garden/plants/new', 'New plant page'],
    ['/garden/plan', 'Plan page'],
    ['/garden/plan/recommendations', 'Recommendations page'],
    ['/share', 'Share page'],
    ['/share/listings', 'Listings page'],
    ['/share/find', 'Find food page'],
    ['/settings', 'Settings page'],
  ])('supports a direct visit to %s', async (pathname, heading) => {
    renderRoot([pathname]);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('moves a legacy deep link to its canonical page without losing state', async () => {
    renderRoot(['/planner?season=fall#workhorses']);

    expect(await screen.findByRole('heading', { name: 'Plan page' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/garden/plan?season=fall#workhorses'
    );
  });

  it('keeps every garden view inside the shared workspace shell', async () => {
    renderRoot(['/garden/plan']);

    expect(await screen.findByText('Garden workspace')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Plan page' })).toBeInTheDocument();
  });

  it('replaces a legacy history entry so Back returns to the previous page', async () => {
    renderRoot(['/', '/requests']);

    expect(await screen.findByRole('heading', { name: 'Find food page' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Today page' })).toBeInTheDocument();
    });
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });
});
