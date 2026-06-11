import { CropForm } from '../CropPlanner/CropForm';
import { Modal } from '../Modal';
import type { GardenBed, GrowerCropItem } from '../../types/listing';
import { formatArea } from './bedDefaults';
import { bedCapacitySummary } from './capacity';

interface AddCropModalProps {
  bed: GardenBed;
  /** Crops already in this bed, used to estimate remaining planting room. */
  cropsForBed?: GrowerCropItem[];
  open: boolean;
  onClose: () => void;
}

// One sentence of remaining-room context for the modal subtitle. Stays
// empty when nothing here has spacing data — guessing would mislead more
// than it helps.
function capacityHint(bed: GardenBed, cropsForBed: GrowerCropItem[]): string {
  const summary = bedCapacitySummary(bed, cropsForBed);
  if (summary.utilization === null) return '';
  const remaining = summary.usableSquareInches - summary.usedSquareInches;
  if (remaining <= 0) return ' This bed is already at capacity.';
  return ` About ${formatArea(remaining)} of room left.`;
}

/**
 * Wraps the shared CropForm in the designer's modal so users can attach
 * a new crop to the currently-selected bed without leaving the canvas.
 * The bed selector is hidden — the bed context is already obvious from
 * the inspector — and success closes the modal so the new crop chip
 * appears immediately on the bed.
 */
export function AddCropModal({ bed, cropsForBed = [], open, onClose }: AddCropModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Add a crop to ${bed.name}`}
      subtitle={`Tell us what's going in — we'll attach it to this bed.${capacityHint(
        bed,
        cropsForBed
      )}`}
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
