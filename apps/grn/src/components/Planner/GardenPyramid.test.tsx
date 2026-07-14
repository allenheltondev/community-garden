import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PyramidTier } from '../CropPlanner/gardenPyramid';
import { GardenPyramid, type PyramidCropVisual } from './GardenPyramid';

function crop(id: string, label: string): PyramidCropVisual {
  return { id, label, iconKey: 'tomato', accent: '#c1452f' };
}

const EMPTY: Record<PyramidTier, PyramidCropVisual[]> = {
  1: [],
  2: [],
  3: [],
  4: [],
  5: [],
};

function renderPyramid(args?: {
  cropsByTier?: Partial<Record<PyramidTier, PyramidCropVisual[]>>;
  activeTier?: PyramidTier;
  nextTier?: PyramidTier | null;
  onSelectTier?: (tier: PyramidTier) => void;
}) {
  return render(
    <GardenPyramid
      cropsByTier={{ ...EMPTY, ...args?.cropsByTier }}
      activeTier={args?.activeTier ?? 1}
      nextTier={args?.nextTier}
      onSelectTier={args?.onSelectTier ?? (() => {})}
    />
  );
}

describe('GardenPyramid (isometric)', () => {
  it('renders all five terraces as labelled buttons', () => {
    renderPyramid({ cropsByTier: { 1: [crop('a', 'Potato')] } });
    expect(screen.getByTestId('pyramid-band-foundation')).toBeInTheDocument();
    expect(screen.getByTestId('pyramid-band-workhorse')).toBeInTheDocument();
    expect(screen.getByTestId('pyramid-band-fresh')).toBeInTheDocument();
    expect(screen.getByTestId('pyramid-band-flavor')).toBeInTheDocument();
    expect(screen.getByTestId('pyramid-band-joy')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /layer 1, foundation: 1 crop planned/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /layer 5, joy: nothing here yet/i })
    ).toBeInTheDocument();
  });

  it('shows the crop count on covered tiers and + on empty ones', () => {
    renderPyramid({
      cropsByTier: { 2: [crop('a', 'Tomato'), crop('b', 'Pepper')] },
    });
    expect(screen.getByTestId('pyramid-count-workhorse')).toHaveTextContent('2');
    expect(screen.getByTestId('pyramid-count-fresh')).toHaveTextContent('+');
  });

  it('shows a few silhouettes on the shoulders with a +N chip when resting', () => {
    const many = Array.from({ length: 9 }, (_, i) => crop(`c${i}`, `Crop ${i}`));
    // Foundation is NOT the active tier, so it rests: 4 on the
    // shoulders, the remaining 5 collapse.
    renderPyramid({ cropsByTier: { 1: many }, activeTier: 3 });
    expect(screen.getByText('+5')).toBeInTheDocument();
    expect(screen.getAllByText(/^Crop \d$/, { selector: 'title' })).toHaveLength(4);
  });

  it('showcases the full planting of the active tier', () => {
    const many = Array.from({ length: 9 }, (_, i) => crop(`c${i}`, `Crop ${i}`));
    renderPyramid({ cropsByTier: { 1: many }, activeTier: 1 });
    // All nine stand across the band; no overflow chip.
    expect(screen.getAllByText(/^Crop \d$/, { selector: 'title' })).toHaveLength(9);
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });

  it('selects a tier on click', async () => {
    const onSelectTier = vi.fn();
    renderPyramid({ onSelectTier });
    await userEvent.click(screen.getByTestId('pyramid-band-flavor'));
    expect(onSelectTier).toHaveBeenCalledWith(4);
  });

  it('selects a tier with the keyboard', async () => {
    const onSelectTier = vi.fn();
    renderPyramid({ onSelectTier });
    const joy = screen.getByTestId('pyramid-band-joy');
    (joy as unknown as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelectTier).toHaveBeenCalledWith(5);
  });

  it('marks the active tier as pressed', () => {
    renderPyramid({ activeTier: 3 });
    expect(screen.getByTestId('pyramid-band-fresh')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('pyramid-band-joy')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('labels each band with its concrete descriptor for context', () => {
    renderPyramid();
    // The evocative name is paired with a plain-language descriptor so the
    // pyramid reads without needing the side panel.
    expect(screen.getByText('Staples & storage crops')).toBeInTheDocument();
    expect(screen.getByText('Everyday vegetables')).toBeInTheDocument();
    expect(screen.getByText('Kitchen herbs')).toBeInTheDocument();
  });

  it('gently highlights the recommended next tier', () => {
    const { container } = renderPyramid({ activeTier: 1, nextTier: 3 });
    const halos = container.querySelectorAll('.grn-iso-pyramid__next-halo');
    // Exactly one halo, on the recommended (not the active) band.
    expect(halos).toHaveLength(1);
  });

  it('does not highlight a next tier that is already active', () => {
    const { container } = renderPyramid({ activeTier: 2, nextTier: 2 });
    expect(container.querySelectorAll('.grn-iso-pyramid__next-halo')).toHaveLength(0);
  });

  it('previews ghost suggestions on empty tiers', () => {
    renderPyramid();
    // Foundation is empty, so its curated suggestions stand as ghosts
    // (svg <title> tooltips carry the names).
    expect(screen.getByText('Potatoes', { selector: 'title' })).toBeInTheDocument();
    expect(screen.getByText('Sweet potatoes', { selector: 'title' })).toBeInTheDocument();
  });
});
