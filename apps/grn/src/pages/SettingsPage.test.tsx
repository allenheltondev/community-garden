import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { UserProfile } from '../types/user';
import { SettingsPage } from './SettingsPage';

vi.mock('../components/Settings/ApiKeysPanel', () => ({
  ApiKeysPanel: () => <div>API key management</div>,
}));

const user: UserProfile = {
  id: 'grower-1',
  email: 'ada@example.com',
  displayName: 'Ada Lovelace',
  userType: 'grower',
  onboardingCompleted: true,
  subscription: { tier: 'supporter', subscriptionStatus: 'active' },
  growerProfile: {
    homeZone: '8a',
    address: 'Redacted',
    geoKey: 'geo',
    shareRadiusMiles: 5,
    isOrganization: false,
    units: 'imperial',
    locale: 'en-US',
  },
};

describe('SettingsPage', () => {
  it('provides addressable profile, membership, settings, and API key surfaces', () => {
    const { container } = render(<SettingsPage user={user} />);

    expect(container.querySelector('#profile')).toHaveTextContent('Ada Lovelace');
    expect(container.querySelector('#membership')).toHaveTextContent('Supporter');
    expect(container.querySelector('#api-keys')).toHaveTextContent('API key management');
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });
});
