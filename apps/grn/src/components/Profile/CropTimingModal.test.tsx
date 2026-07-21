import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GrowerCropItem } from '../../types/listing';
import { CropTimingModal } from './CropTimingModal';

const crop = {
  id: 'crop-1',
  userId: 'grower-1',
  canonicalId: null,
  cropName: 'Tomato',
  varietyId: null,
  status: 'growing',
  visibility: 'private',
  surplusEnabled: false,
  nickname: 'Sun Gold',
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
} satisfies GrowerCropItem;

describe('CropTimingModal', () => {
  it('saves a quick estimate from the recorded planting date', async () => {
    const onSave = vi.fn();
    render(
      <CropTimingModal crop={crop} isSaving={false} onSave={onSave} onClose={vi.fn()} />
    );

    await userEvent.click(screen.getByRole('button', { name: '75 days' }));
    expect(screen.getByLabelText('Expected first harvest')).toHaveValue('2026-08-03');
    await userEvent.click(screen.getByRole('button', { name: 'Save timing' }));
    expect(onSave).toHaveBeenCalledWith({
      plantingDate: '2026-05-20',
      expectedHarvestDate: '2026-08-03',
    });
  });

  it('rejects a harvest estimate before the planting date', async () => {
    const onSave = vi.fn();
    render(
      <CropTimingModal crop={crop} isSaving={false} onSave={onSave} onClose={vi.fn()} />
    );

    await userEvent.type(screen.getByLabelText('Expected first harvest'), '2026-05-01');
    await userEvent.click(screen.getByRole('button', { name: 'Save timing' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/on or after the planting date/i);
    expect(onSave).not.toHaveBeenCalled();
  });
});
