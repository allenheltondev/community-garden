import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GardenBed } from '../../types/listing';
import { DesignerWorkflowGuide } from './DesignerWorkflowGuide';

const selectedBed: GardenBed = {
  id: 'bed-1',
  userId: 'grower-1',
  name: 'Kitchen greens',
  description: null,
  sunExposure: 'full_sun',
  soilType: null,
  lengthInches: 96,
  widthInches: 48,
  locationNotes: null,
  sortOrder: 0,
  bedType: 'raised',
  shape: 'rect',
  positionX: 24,
  positionY: 24,
  rotationDeg: 0,
  points: null,
  color: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('DesignerWorkflowGuide', () => {
  it('offers a clear first action when nothing is selected', async () => {
    const user = userEvent.setup();
    const onAddBed = vi.fn();

    render(
      <DesignerWorkflowGuide
        mode="idle"
        onAddBed={onAddBed}
        onCancelMode={vi.fn()}
      />
    );

    expect(screen.getByText('Start arranging')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add a raised bed' }));
    expect(onAddBed).toHaveBeenCalledOnce();
  });

  it('explains and exits an active drawing mode', async () => {
    const user = userEvent.setup();
    const onCancelMode = vi.fn();

    render(
      <DesignerWorkflowGuide
        mode="drawing-polygon"
        onAddBed={vi.fn()}
        onCancelMode={onCancelMode}
      />
    );

    expect(screen.getByText(/double-tap the last point/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel drawing' }));
    expect(onCancelMode).toHaveBeenCalledOnce();
  });

  it('keeps the selected bed and its next step in view', () => {
    render(
      <DesignerWorkflowGuide
        mode="idle"
        selectedBed={selectedBed}
        onAddBed={vi.fn()}
        onCancelMode={vi.fn()}
      />
    );

    expect(screen.getByText('Kitchen greens')).toBeInTheDocument();
    expect(screen.getByText(/use the details panel/i)).toBeInTheDocument();
  });
});
