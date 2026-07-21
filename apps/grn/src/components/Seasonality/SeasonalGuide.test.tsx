import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { GrowerCropItem } from '../../types/listing';
import type { GrowerProfile } from '../../types/user';
import { SeasonalGuide } from './SeasonalGuide';

const growerProfile: GrowerProfile = {
  homeZone: '8b',
  address: 'McKinney, Texas',
  geoKey: 'geo-8b',
  lat: 33.2,
  lng: -96.6,
  shareRadiusMiles: 5,
  isOrganization: false,
  units: 'imperial',
  locale: 'en-US',
};

const okra: GrowerCropItem = {
  id: 'crop-okra',
  userId: 'grower-1',
  canonicalId: 'catalog-okra',
  cropName: 'Okra',
  varietyId: null,
  status: 'growing',
  visibility: 'local',
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
  createdAt: '2026-05-01',
  updatedAt: '2026-07-01',
};

function LocationDisplay() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}{location.hash}</output>;
}

function renderGuide(profile: GrowerProfile | null = growerProfile, crops = [okra]) {
  return render(
    <MemoryRouter>
      <SeasonalGuide
        growerProfile={profile}
        crops={crops}
        now={new Date(2026, 6, 15)}
      />
      <LocationDisplay />
    </MemoryRouter>
  );
}

describe('SeasonalGuide', () => {
  it('shows local seasonality and opens crops already in the garden', async () => {
    const user = userEvent.setup();
    renderGuide();

    expect(screen.getByRole('heading', { name: 'High summer in Zone 8b' })).toBeInTheDocument();
    expect(screen.getByText('In your garden')).toBeInTheDocument();
    expect(screen.getByText(/frost dates, current weather, shade/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open Okra' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/garden/plants?crop=crop-okra');
  });

  it('carries a new suggestion into the add-crop flow', async () => {
    const user = userEvent.setup();
    renderGuide(growerProfile, []);

    await user.click(screen.getByRole('button', { name: 'Plan Broccoli' }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/garden/plants/new?suggestion=Broccoli&source=seasonal-guide'
    );
  });

  it('offers a clear recovery path when the growing zone is unavailable', async () => {
    const user = userEvent.setup();
    renderGuide(null, []);

    expect(screen.getByRole('heading', { name: 'Make Today local to your garden' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review growing zone' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/settings#profile');
  });
});
