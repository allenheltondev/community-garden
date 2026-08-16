import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileForm } from './ProfileForm';
import { validateProfile } from './profileValidation';
import { updateMe } from '../../services/api';
import type { GrowerProfile } from '../../types/user';

vi.mock('../../services/api', () => ({
  updateMe: vi.fn(),
}));

const mockUpdateMe = vi.mocked(updateMe);

const profile: GrowerProfile = {
  homeZone: '8a',
  address: '123 Main St, Springfield, IL',
  geoKey: '9v6kn7',
  lat: 30.2,
  lng: -97.7,
  shareRadiusMiles: 5,
  isOrganization: false,
  units: 'imperial',
  locale: 'en-US',
};

function renderForm(overrides: Partial<GrowerProfile> = {}, refreshUser = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ProfileForm profile={{ ...profile, ...overrides }} refreshUser={refreshUser} />
    </QueryClientProvider>
  );
  return { ...result, refreshUser };
}

async function openEditor() {
  await userEvent.click(screen.getByRole('button', { name: 'Edit location and sharing' }));
}

describe('validateProfile', () => {
  const valid = {
    address: '123 Main St, Springfield, IL',
    homeZone: '8a',
    shareRadiusMiles: 5,
    isOrganization: false,
    organizationName: '',
    units: 'imperial' as const,
  };

  it('accepts a complete profile', () => {
    expect(validateProfile(valid)).toEqual({});
  });

  it('mirrors the backend rules the API would reject on', () => {
    expect(validateProfile({ ...valid, address: '   ' }).address).toBeDefined();
    expect(validateProfile({ ...valid, homeZone: '' }).homeZone).toBeDefined();
    expect(validateProfile({ ...valid, homeZone: 'zone eight' }).homeZone).toBeDefined();
    expect(validateProfile({ ...valid, shareRadiusMiles: 0 }).shareRadiusMiles).toBeDefined();
    expect(validateProfile({ ...valid, shareRadiusMiles: 200 }).shareRadiusMiles).toBeDefined();
    expect(
      validateProfile({ ...valid, isOrganization: true, organizationName: ' ' }).organizationName
    ).toBeDefined();
  });
});

describe('ProfileForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateMe.mockResolvedValue(undefined);
  });

  it('shows the saved location before anything is edited', () => {
    renderForm();

    expect(screen.getByText('123 Main St, Springfield, IL')).toBeInTheDocument();
    expect(screen.getByText('8a')).toBeInTheDocument();
    expect(screen.getByText('5 mi')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Address/i)).not.toBeInTheDocument();
  });

  it('sends the complete profile when only the address changed', async () => {
    const { refreshUser } = renderForm();
    await openEditor();

    const address = screen.getByLabelText(/Address/i);
    await userEvent.clear(address);
    await userEvent.type(address, '900 Cedar Ave, Austin, TX');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockUpdateMe).toHaveBeenCalledWith({
        growerProfile: {
          address: '900 Cedar Ave, Austin, TX',
          homeZone: '8a',
          shareRadiusMiles: 5,
          isOrganization: false,
          organizationName: undefined,
          units: 'imperial',
          locale: 'en-US',
        },
      });
    });
    expect(refreshUser).toHaveBeenCalled();
  });

  it('keeps organization details through an address change', async () => {
    renderForm({ isOrganization: true, organizationName: 'North Austin Community Garden' });
    await openEditor();

    const address = screen.getByLabelText(/Address/i);
    await userEvent.clear(address);
    await userEvent.type(address, '900 Cedar Ave, Austin, TX');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockUpdateMe).toHaveBeenCalledWith(
        expect.objectContaining({
          growerProfile: expect.objectContaining({
            isOrganization: true,
            organizationName: 'North Austin Community Garden',
          }),
        })
      );
    });
  });

  it('refuses to submit a profile the API would reject', async () => {
    renderForm();
    await openEditor();

    await userEvent.clear(screen.getByLabelText(/Growing zone/i));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Growing zone is required')).toBeInTheDocument();
    expect(mockUpdateMe).not.toHaveBeenCalled();
  });

  it('surfaces a failed save and keeps the entered values', async () => {
    mockUpdateMe.mockRejectedValue(new Error('nope'));
    renderForm();
    await openEditor();

    const address = screen.getByLabelText(/Address/i);
    await userEvent.clear(address);
    await userEvent.type(address, '900 Cedar Ave, Austin, TX');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be saved/i);
    expect(screen.getByLabelText(/Address/i)).toHaveValue('900 Cedar Ave, Austin, TX');
  });

  it('discards edits on cancel', async () => {
    renderForm();
    await openEditor();

    const address = screen.getByLabelText(/Address/i);
    await userEvent.clear(address);
    await userEvent.type(address, 'somewhere else entirely');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('123 Main St, Springfield, IL')).toBeInTheDocument();
    expect(mockUpdateMe).not.toHaveBeenCalled();
  });

  it('requires an organization name once the grower marks themselves as one', async () => {
    renderForm();
    await openEditor();

    await userEvent.click(screen.getByLabelText(/growing as an organization/i));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Organization name is required')).toBeInTheDocument();
    expect(mockUpdateMe).not.toHaveBeenCalled();
  });
});
