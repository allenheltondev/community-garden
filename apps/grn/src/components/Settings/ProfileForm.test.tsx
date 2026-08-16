import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileForm } from './ProfileForm';
import { validateProfile } from './profileValidation';
import { listMyListings, updateListing, updateMe } from '../../services/api';
import { lookupHardinessZone } from '../../utils/geolocation';
import type { Listing } from '../../types/listing';
import type { GrowerProfile } from '../../types/user';

vi.mock('../../services/api', () => ({
  listMyListings: vi.fn(),
  updateListing: vi.fn(),
  updateMe: vi.fn(),
}));

vi.mock('../../utils/geolocation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/geolocation')>()),
  lookupHardinessZone: vi.fn(),
  reverseGeocode: vi.fn(),
}));

const mockUpdateMe = vi.mocked(updateMe);
const mockListMyListings = vi.mocked(listMyListings);
const mockUpdateListing = vi.mocked(updateListing);
const mockLookupZone = vi.mocked(lookupHardinessZone);

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: 'listing-1',
    userId: 'grower-1',
    growerCropId: null,
    cropId: 'crop-1',
    varietyId: null,
    title: 'Cherry tomatoes',
    unit: 'lb',
    quantityTotal: '10',
    quantityRemaining: '10',
    availableStart: '2026-08-01',
    availableEnd: '2026-08-14',
    status: 'active',
    pickupLocationText: null,
    pickupAddress: null,
    pickupDisclosurePolicy: 'after_confirmed',
    pickupNotes: null,
    contactPref: 'app_message',
    geoKey: '9v6kn7',
    lat: 30.2,
    lng: -97.7,
    createdAt: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

function listingsResponse(items: Listing[]) {
  return { items, limit: 50, offset: 0, hasMore: false, nextOffset: null };
}

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
    displayName: 'Ada Lovelace',
    address: '123 Main St, Springfield, IL',
    homeZone: '8a',
    shareRadiusMiles: 5,
    isOrganization: false,
    organizationName: '',
    units: 'imperial' as const,
    locale: 'en-US',
  };

  it('accepts a complete profile', () => {
    expect(validateProfile(valid)).toEqual({});
  });

  it('mirrors the backend rules the API would reject on', () => {
    expect(validateProfile({ ...valid, displayName: 'a'.repeat(81) }).displayName).toBeDefined();
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
    mockListMyListings.mockResolvedValue(listingsResponse([]));
    mockUpdateListing.mockResolvedValue(listing());
    mockLookupZone.mockResolvedValue(null);
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

  it('warns while editing that listings share the profile address', async () => {
    mockListMyListings.mockResolvedValue(listingsResponse([listing(), listing({ id: 'listing-2' })]));
    renderForm();
    await openEditor();

    const address = screen.getByLabelText(/Address/i);
    await userEvent.clear(address);
    await userEvent.type(address, '900 Cedar Ave, Austin, TX');

    expect(
      await screen.findByText(/2 listings use this address for pickup and keep the old one/i)
    ).toBeInTheDocument();
  });

  it('offers to move stranded listings after the address changes, and re-resolves them', async () => {
    mockListMyListings.mockResolvedValue(listingsResponse([listing()]));
    renderForm();
    await openEditor();

    const address = screen.getByLabelText(/Address/i);
    await userEvent.clear(address);
    await userEvent.type(address, '900 Cedar Ave, Austin, TX');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await userEvent.click(
      await screen.findByRole('button', { name: 'Move it to my new address' })
    );

    await waitFor(() => {
      expect(mockUpdateListing).toHaveBeenCalledWith(
        'listing-1',
        expect.not.objectContaining({ pickupAddress: expect.anything() })
      );
    });
    expect(await screen.findByText(/1 listing now points at your new address/i)).toBeInTheDocument();
  });

  it('says nothing about listings when none inherited the address', async () => {
    mockListMyListings.mockResolvedValue(
      listingsResponse([listing({ pickupAddress: '55 Other St, Austin, TX' })])
    );
    renderForm();
    await openEditor();

    const address = screen.getByLabelText(/Address/i);
    await userEvent.clear(address);
    await userEvent.type(address, '900 Cedar Ave, Austin, TX');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockUpdateMe).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /my new address/i })).not.toBeInTheDocument();
  });

  it('offers the zone for a typed zipcode instead of overwriting the grower', async () => {
    mockLookupZone.mockResolvedValue('9b');
    renderForm();
    await openEditor();

    const address = screen.getByLabelText(/Address/i);
    await userEvent.clear(address);
    await userEvent.type(address, '900 Cedar Ave, Austin, TX 78701');
    await userEvent.tab();

    expect(await screen.findByText(/puts 78701 in zone 9b/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Growing zone/i)).toHaveValue('8a');

    await userEvent.click(screen.getByRole('button', { name: 'Use zone 9b' }));
    expect(screen.getByLabelText(/Growing zone/i)).toHaveValue('9b');
  });

  it('nudges when the address moved but the zone did not', async () => {
    renderForm();
    await openEditor();

    const address = screen.getByLabelText(/Address/i);
    await userEvent.clear(address);
    await userEvent.type(address, '12 Rue de la Paix, Paris');
    await userEvent.tab();

    expect(await screen.findByText(/Your zone is unchanged/i)).toBeInTheDocument();
  });

  it('sends a renamed grower along with the profile', async () => {
    renderForm({}, vi.fn());
    await openEditor();

    const name = screen.getByLabelText(/Display name/i);
    await userEvent.clear(name);
    await userEvent.type(name, 'Ada of the Allotment');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockUpdateMe).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Ada of the Allotment' })
      );
    });
  });

  it('omits a blanked name so the API keeps the stored one', async () => {
    renderForm();
    await openEditor();

    await userEvent.clear(screen.getByLabelText(/Display name/i));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockUpdateMe).toHaveBeenCalled());
    expect(mockUpdateMe.mock.calls[0][0]).not.toHaveProperty('displayName');
  });

  it('lets the grower change how dates are formatted', async () => {
    renderForm();
    await openEditor();

    await userEvent.selectOptions(screen.getByLabelText(/Date formatting/i), 'en-GB');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockUpdateMe).toHaveBeenCalledWith(
        expect.objectContaining({
          growerProfile: expect.objectContaining({ locale: 'en-GB' }),
        })
      );
    });
  });

  it('spells out what a move changes before it is saved', async () => {
    mockListMyListings.mockResolvedValue(listingsResponse([listing()]));
    renderForm();
    await openEditor();

    expect(screen.queryByText('What changes when you save')).not.toBeInTheDocument();

    const address = screen.getByLabelText(/Address/i);
    await userEvent.clear(address);
    await userEvent.type(address, '900 Cedar Ave, Austin, TX');

    const preview = await screen.findByText('What changes when you save');
    const list = preview.parentElement as HTMLElement;
    expect(list).toHaveTextContent(/Neighbors within 5 miles of the new address/i);
    expect(list).toHaveTextContent(/stay on zone 8a/i);
    expect(list).toHaveTextContent(/1 listing uses this address for pickup/i);
  });

  it('says the season moves too once the zone changes with the address', async () => {
    renderForm();
    await openEditor();

    const address = screen.getByLabelText(/Address/i);
    await userEvent.clear(address);
    await userEvent.type(address, '900 Cedar Ave, Austin, TX');
    const zone = screen.getByLabelText(/Growing zone/i);
    await userEvent.clear(zone);
    await userEvent.type(zone, '9b');

    expect(
      await screen.findByText(/Planting windows and seasonal ideas move to zone 9b/i)
    ).toBeInTheDocument();
  });
});
