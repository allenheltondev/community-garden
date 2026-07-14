import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { OnboardingFlow } from './OnboardingFlow';
import * as useOnboardingModule from '../../hooks/useOnboarding';
import type { UserProfile } from '../../types/user';

vi.mock('../../hooks/useOnboarding');

vi.mock('../../utils/logging', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const baseUser: UserProfile = {
  id: 'test-user-id',
  email: 'test@example.com',
  displayName: 'Test User',
  userType: null,
  onboardingCompleted: false,
  subscription: { tier: 'free' },
  growerProfile: null,
  gathererProfile: null,
};

function LocationDisplay() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

describe('OnboardingFlow', () => {
  const mockUseOnboarding = vi.mocked(useOnboardingModule.useOnboarding);

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseOnboarding.mockReturnValue({
      submitGrowerProfile: vi.fn().mockResolvedValue(undefined),
      clearError: vi.fn(),
      isSubmitting: false,
      error: null,
    });
  });

  it('goes straight into the grower setup wizard — no grower/gatherer choice', () => {
    render(
      <MemoryRouter>
        <OnboardingFlow user={baseUser} refreshUser={vi.fn()} />
      </MemoryRouter>
    );

    // The wizard's first step is shown directly...
    expect(screen.getByText(/Where are you growing/i)).toBeInTheDocument();
    // ...and the old participation-mode picker is gone.
    expect(screen.queryByText(/How would you like to participate/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/I'm a Gatherer/i)).not.toBeInTheDocument();
  });

  it('does not render a dead Back button on the first step', () => {
    render(
      <MemoryRouter>
        <OnboardingFlow user={baseUser} refreshUser={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: /^Back$/i })).not.toBeInTheDocument();
  });

  it('starts in the wizard even for a legacy gatherer resuming onboarding', () => {
    const resumingGatherer: UserProfile = { ...baseUser, userType: 'gatherer' };

    render(
      <MemoryRouter>
        <OnboardingFlow user={resumingGatherer} refreshUser={vi.fn()} />
        <LocationDisplay />
      </MemoryRouter>
    );

    // Everyone now onboards as a grower, so a resuming gatherer gets the
    // grower wizard (and completing it will set userType to grower).
    expect(screen.getByText(/Where are you growing/i)).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });
});
