import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listCatalogCrops } from '../../services/api';
import { CropPicker, type CropPickerSelection } from '../CropPlanner/CropPicker';

export interface QuickAddCropInput {
  cropName: string;
  canonicalId: string | null;
  category: string | null;
  plantCount: number | null;
}

interface QuickAddCropProps {
  /**
   * Persist the crop. May be async; thrown errors surface inline so the
   * grower can retry without losing their typed-in crop.
   */
  onAdd: (input: QuickAddCropInput) => Promise<void> | void;
  disabled?: boolean;
  /** Catalog crop IDs neighbors nearby want — float + badge them in the picker. */
  scarceCropIds?: Set<string>;
  /** Catalog crop IDs already in this garden — badged in the picker. */
  growingCropIds?: Set<string>;
}

/**
 * Inline, no-modal crop adder for the garden design surfaces. Pick a crop
 * (optionally a plant count) and it attaches to the current bed
 * immediately, then the field clears and keeps focus so several crops can
 * be dropped in a row without leaving the canvas. Status, dates, spacing,
 * and sharing get sensible defaults and are refined later in the planner —
 * this surface optimizes for speed while designing, not completeness.
 */
export function QuickAddCrop({
  onAdd,
  disabled = false,
  scarceCropIds,
  growingCropIds,
}: QuickAddCropProps) {
  const { data: catalog = [], isLoading } = useQuery({
    queryKey: ['catalogCrops'],
    queryFn: listCatalogCrops,
  });

  const [selection, setSelection] = useState<CropPickerSelection | null>(null);
  const [count, setCount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  // The picker keeps its own input text and ignores value=null, so we
  // remount it via a key bump to wipe the field after a successful add.
  const [pickerKey, setPickerKey] = useState(0);

  async function submit() {
    if (!selection || !selection.cropName.trim()) {
      setError('Pick a crop first.');
      return;
    }
    setError(null);
    setIsAdding(true);
    try {
      await onAdd({
        cropName: selection.cropName.trim(),
        canonicalId: selection.catalogCropId,
        category: selection.category,
        plantCount: count.trim() ? Number(count) : null,
      });
      setSelection(null);
      setCount('');
      setPickerKey((key) => key + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that crop.');
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <form
      className="grn-quick-add"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="grn-quick-add__row">
        <div className="grn-quick-add__picker">
          <CropPicker
            key={pickerKey}
            compact
            catalog={catalog}
            isLoading={isLoading}
            value={selection}
            onChange={(next) => {
              setSelection(next);
              setError(null);
            }}
            scarceCropIds={scarceCropIds}
            growingCropIds={growingCropIds}
          />
        </div>
        <label className="grn-quick-add__count">
          <span className="grn-quick-add__count-label">Qty</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="#"
            value={count}
            onChange={(event) => setCount(event.target.value)}
            aria-label="Number of plants (optional)"
            disabled={disabled || isAdding}
          />
        </label>
        <button
          type="submit"
          className="grn-quick-add__submit"
          disabled={disabled || isAdding || !selection}
        >
          {isAdding ? 'Adding…' : 'Add'}
        </button>
      </div>
      {error ? (
        <p className="grn-quick-add__error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
