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
  onSelectTier?: (tier: PyramidTier) => void;
}) {
  return render(
    <GardenPyramid
      cropsByTier={{ ...EMPTY, ...args?.cropsByTier }}
      activeTier={args?.activeTier ?? 1}
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

  it('collapses crops beyond the ledge capacity into a +N chip', () => {
    const many = Array.from({ length: 9 }, (_, i) => crop(`c${i}`, `Crop ${i}`));
    renderPyramid({ cropsByTier: { 1: many } });
    // Foundation holds 6 silhouettes; the remaining 3 collapse.
    expect(screen.getByText('+3')).toBeInTheDocument();
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

  it('previews ghost suggestions on empty tiers', () => {
    renderPyramid();
    // Foundation is empty, so its curated suggestions stand as ghosts
    // (svg <title> tooltips carry the names).
    expect(screen.getByText('Potatoes', { selector: 'title' })).toBeInTheDocument();
    expect(screen.getByText('Sweet potatoes', { selector: 'title' })).toBeInTheDocument();
  });
});
