import { CropForm } from '../CropPlanner/CropForm';
import { Modal } from '../Modal';
import type { GardenBed } from '../../types/listing';

interface AddCropModalProps {
  bed: GardenBed;
  open: boolean;
  onClose: () => void;
}

/**
 * Wraps the shared CropForm in the designer's modal so users can attach
 * a new crop to the currently-selected bed without leaving the canvas.
 * The bed selector is hidden — the bed context is already obvious from
 * the inspector — and success closes the modal so the new crop chip
 * appears immediately on the bed.
 */
export function AddCropModal({ bed, open, onClose }: AddCropModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Add a crop to ${bed.name}`}
      subtitle="Tell us what's going in — we'll attach it to this bed."
    >
      <CropForm
        lockedBed={bed}
        onCancel={onClose}
        onSuccess={onClose}
        submitLabel="Add to this bed"
      />
    </Modal>
  );
}
