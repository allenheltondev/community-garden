import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { GrowerCropItem } from '../../types/listing';
import { HarvestTimeline } from './HarvestTimeline';

function crop(overrides: Partial<GrowerCropItem>): GrowerCropItem {
  return {
    id: 'crop-1',
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
    plantingDate: '2026-05-20',
    expectedHarvestDate: null,
    plantCount: null,
    spacingInches: null,
    pyramidTier: null,
    createdAt: '2026-05-20',
    updatedAt: '2026-05-20',
    ...overrides,
  };
}

function LocationDisplay() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderTimeline(crops: GrowerCropItem[]) {
  return render(
    <MemoryRouter>
      <HarvestTimeline crops={crops} now={new Date('2026-07-21T12:00:00Z')} />
      <LocationDisplay />
    </MemoryRouter>
  );
}

describe('HarvestTimeline', () => {
  it('opens the harvest log for a crop ready to check', async () => {
    renderTimeline([
      crop({ id: 'tomato', nickname: 'Sun Gold', expectedHarvestDate: '2026-07-21' }),
    ]);

    expect(screen.getByRole('heading', { name: 'Coming harvests' })).toBeInTheDocument();
    expect(screen.getByText('Estimated today · Jul 21')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log Sun Gold harvest' }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/garden/plants?crop=tomato&action=harvest'
    );
  });

  it('sends a growing crop without an estimate to the timing editor', async () => {
    renderTimeline([crop({ id: 'basil', cropName: 'Basil' })]);

    expect(screen.getByText(/give your growing plants a harvest estimate/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add timing' }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/garden/plants?crop=basil&action=timing'
    );
  });

  it('stays out of the way when no crops are actively growing', () => {
    renderTimeline([crop({ status: 'planning', expectedHarvestDate: '2026-08-01' })]);
    expect(screen.queryByRole('heading', { name: 'Coming harvests' })).not.toBeInTheDocument();
  });
});
