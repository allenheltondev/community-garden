import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OnboardingGuard } from './OnboardingGuard';
import type { UserProfile } from '../../types/user';

vi.mock('./OnboardingFlow', () => ({
  OnboardingFlow: () => <div data-testid="onboarding-flow">Onboarding Flow</div>,
}));

const completedUser: UserProfile = {
  userId: 'test-user-id',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  tier: 'free',
  userType: 'grower',
  onboardingCompleted: true,
  growerProfile: {
    homeZone: '8a',
    address: '123 Main St, Springfield, IL',
    geoKey: '9q8yy9',
    lat: 37.7749,
    lng: -122.4194,
    shareRadiusMiles: 5.0,
    isOrganization: false,
    units: 'imperial',
    locale: 'en-US',
  },
  gathererProfile: null,
};

const incompleteUser: UserProfile = {
  ...completedUser,
  userType: null,
  onboardingCompleted: false,
  growerProfile: null,
};

describe('OnboardingGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders OnboardingFlow when onboarding is incomplete', () => {
    render(
      <OnboardingGuard user={incompleteUser} refreshUser={vi.fn()}>
        <div>Routed content</div>
      </OnboardingGuard>
    );

    expect(screen.getByTestId('onboarding-flow')).toBeInTheDocument();
    expect(screen.queryByText('Routed content')).not.toBeInTheDocument();
  });

  it('renders OnboardingFlow when user is null', () => {
    render(
      <OnboardingGuard user={null} refreshUser={vi.fn()}>
        <div>Routed content</div>
      </OnboardingGuard>
    );

    expect(screen.getByTestId('onboarding-flow')).toBeInTheDocument();
    expect(screen.queryByText('Routed content')).not.toBeInTheDocument();
  });

  it('renders children when onboarding is complete', () => {
    render(
      <OnboardingGuard user={completedUser} refreshUser={vi.fn()}>
        <div>Routed content</div>
      </OnboardingGuard>
    );

    expect(screen.getByText('Routed content')).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-flow')).not.toBeInTheDocument();
  });
});
