import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NeededNearbyStrip } from './NeededNearbyStrip';
import type { CatalogCrop } from '../../types/listing';
import type { ScarceCropEntry } from '../../hooks/useGrowerCropSignals';

const catalog: CatalogCrop[] = [
  {
    id: 'crop-1',
    slug: 'tomato',
    commonName: 'Tomato',
    scientificName: null,
    category: 'fruit',
    description: null,
  },
  {
    id: 'crop-2',
    slug: 'kale',
    commonName: 'Kale',
    scientificName: null,
    category: 'leafy',
    description: null,
  },
];

const topScarce: ScarceCropEntry[] = [
  { cropId: 'crop-1', scarcityScore: 0.92, requestCount: 8, listingCount: 2 },
  { cropId: 'crop-2', scarcityScore: 0.61, requestCount: 4, listingCount: 1 },
];

describe('NeededNearbyStrip', () => {
  it('renders nothing while loading so it does not flash', () => {
    const { container } = render(
      <NeededNearbyStrip
        topScarce={topScarce}
        catalog={catalog}
        isLoading
        onSelect={() => {}}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there are no scarce crops to show', () => {
    const { container } = render(
      <NeededNearbyStrip topScarce={[]} catalog={catalog} isLoading={false} onSelect={() => {}} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when scarce crops are not in the catalog', () => {
    const { container } = render(
      <NeededNearbyStrip
        topScarce={[{ cropId: 'missing', scarcityScore: 0.9, requestCount: 3, listingCount: 0 }]}
        catalog={catalog}
        isLoading={false}
        onSelect={() => {}}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders chips for each scarce crop with request counts', () => {
    render(
      <NeededNearbyStrip
        topScarce={topScarce}
        catalog={catalog}
        isLoading={false}
        onSelect={() => {}}
      />
    );

    const strip = screen.getByTestId('needed-nearby-strip');
    expect(strip).toHaveTextContent(/needed nearby/i);
    expect(screen.getByTestId('needed-nearby-chip-tomato')).toHaveTextContent('Tomato');
    expect(screen.getByTestId('needed-nearby-chip-tomato')).toHaveTextContent('8 requests');
    expect(screen.getByTestId('needed-nearby-chip-kale')).toHaveTextContent('4 requests');
  });

  it('calls onSelect with a CropPickerSelection when a chip is tapped', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <NeededNearbyStrip
        topScarce={topScarce}
        catalog={catalog}
        isLoading={false}
        onSelect={onSelect}
      />
    );

    await user.click(screen.getByTestId('needed-nearby-chip-tomato'));

    expect(onSelect).toHaveBeenCalledWith({
      catalogCropId: 'crop-1',
      cropName: 'Tomato',
      category: 'fruit',
    });
  });

  it('reflects the currently selected catalog crop on its chip', () => {
    render(
      <NeededNearbyStrip
        topScarce={topScarce}
        catalog={catalog}
        isLoading={false}
        onSelect={() => {}}
        selectedCatalogCropId="crop-2"
      />
    );

    expect(screen.getByTestId('needed-nearby-chip-kale')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('needed-nearby-chip-tomato')).toHaveAttribute('aria-pressed', 'false');
  });

  it('flags already-growing crops and pushes them after fresh opportunities', () => {
    render(
      <NeededNearbyStrip
        topScarce={topScarce}
        catalog={catalog}
        isLoading={false}
        onSelect={() => {}}
        growingCropIds={new Set(['crop-1'])}
      />
    );

    const tomatoChip = screen.getByTestId('needed-nearby-chip-tomato');
    expect(within(tomatoChip).getByTestId('already-growing-flag')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('needed-nearby-chip-kale')).queryByTestId('already-growing-flag')
    ).not.toBeInTheDocument();

    const chips = screen.getAllByRole('button');
    expect(chips[0]).toBe(screen.getByTestId('needed-nearby-chip-kale'));
    expect(chips[1]).toBe(tomatoChip);
  });
});
