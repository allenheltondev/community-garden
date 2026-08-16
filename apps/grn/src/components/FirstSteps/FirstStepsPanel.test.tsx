import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { FirstStepsPanel } from './FirstStepsPanel';
import type { GrowerCropItem } from '../../types/listing';

function crop(overrides: Partial<GrowerCropItem> = {}): GrowerCropItem {
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

function LocationDisplay() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.hash}</output>;
}

function renderPanel(props: Partial<Parameters<typeof FirstStepsPanel>[0]> = {}) {
  return render(
    <MemoryRouter>
      <FirstStepsPanel
        userId="grower-1"
        homeZone="8a"
        crops={[]}
        bedCount={0}
        reminderCount={0}
        ready
        {...props}
      />
      <LocationDisplay />
    </MemoryRouter>
  );
}

describe('FirstStepsPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows the remaining setup steps with progress', () => {
    renderPanel();

    expect(screen.getByRole('heading', { name: 'Getting started' })).toBeInTheDocument();
    expect(screen.getByText('1 of 4 done')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Setup progress' })).toHaveAttribute(
      'aria-valuenow',
      '25'
    );

    const steps = within(screen.getByRole('list', { name: 'Setup steps' })).getAllByRole('listitem');
    expect(steps).toHaveLength(4);
    expect(within(steps[0]).getByText(/done/)).toBeInTheDocument();
    expect(within(steps[1]).getByRole('button', { name: 'Add a plant' })).toBeInTheDocument();
  });

  it('navigates to the step the grower picks', async () => {
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Add a plant' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/garden/plants/new');
  });

  it('stays out of the way until the underlying records have loaded', () => {
    renderPanel({ ready: false });

    expect(screen.queryByRole('heading', { name: 'Getting started' })).not.toBeInTheDocument();
  });

  it('disappears once every step is satisfied', () => {
    renderPanel({ crops: [crop()], bedCount: 1, reminderCount: 1 });

    expect(screen.queryByRole('heading', { name: 'Getting started' })).not.toBeInTheDocument();
  });

  it('can be hidden and stays hidden on the next visit', async () => {
    const { unmount } = renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Hide this' }));
    expect(screen.queryByRole('heading', { name: 'Getting started' })).not.toBeInTheDocument();

    unmount();
    renderPanel();
    expect(screen.queryByRole('heading', { name: 'Getting started' })).not.toBeInTheDocument();
  });

  it('keeps one grower\'s hidden checklist off another account on the same browser', async () => {
    const { unmount } = renderPanel({ userId: 'grower-1' });

    await userEvent.click(screen.getByRole('button', { name: 'Hide this' }));
    unmount();

    renderPanel({ userId: 'grower-2' });
    expect(screen.getByRole('heading', { name: 'Getting started' })).toBeInTheDocument();
  });

  it('re-reads the preference when the signed-in grower changes', async () => {
    const { rerender } = renderPanel({ userId: 'grower-1' });

    await userEvent.click(screen.getByRole('button', { name: 'Hide this' }));
    expect(screen.queryByRole('heading', { name: 'Getting started' })).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <FirstStepsPanel userId="grower-2" homeZone="8a" crops={[]} bedCount={0} reminderCount={0} ready />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Getting started' })).toBeInTheDocument();
  });

  it('says plainly that sharing stays optional', () => {
    renderPanel();

    expect(screen.getByText(/Sharing extra food with neighbors stays optional/i)).toBeInTheDocument();
  });
});
