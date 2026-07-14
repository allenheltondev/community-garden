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

  it('goes straight into the grower setup wizard — grower-only', () => {
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

  it('starts in the grower wizard for a user resuming onboarding', () => {
    const resuming: UserProfile = { ...baseUser, userType: 'grower' };

    render(
      <MemoryRouter>
        <OnboardingFlow user={resuming} refreshUser={vi.fn()} />
        <LocationDisplay />
      </MemoryRouter>
    );

    expect(screen.getByText(/Where are you growing/i)).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });
});
