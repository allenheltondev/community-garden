import { useEffect, useMemo, useState } from 'react';
import { Button } from '@olivias/ui';
import type { GrowerCropItem } from '../../types/listing';
import './CropTimingModal.css';

const DAY_MS = 24 * 60 * 60 * 1000;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(base: string, days: number): string {
  const date = new Date(`${base}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number | null {
  if (!start || !end) return null;
  const startAt = new Date(`${start}T00:00:00Z`).getTime();
  const endAt = new Date(`${end}T00:00:00Z`).getTime();
  if (Number.isNaN(startAt) || Number.isNaN(endAt)) return null;
  return Math.round((endAt - startAt) / DAY_MS);
}

interface CropTimingModalProps {
  crop: GrowerCropItem;
  isSaving: boolean;
  saveError?: string | null;
  onSave: (dates: { plantingDate: string | null; expectedHarvestDate: string | null }) => void;
  onClose: () => void;
}

export function CropTimingModal({
  crop,
  isSaving,
  saveError,
  onSave,
  onClose,
}: CropTimingModalProps) {
  const [plantingDate, setPlantingDate] = useState(crop.plantingDate ?? '');
  const [expectedHarvestDate, setExpectedHarvestDate] = useState(crop.expectedHarvestDate ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const cropName = crop.nickname?.trim() || crop.cropName;
  const harvestDays = useMemo(
    () => daysBetween(plantingDate, expectedHarvestDate),
    [expectedHarvestDate, plantingDate]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (harvestDays !== null && harvestDays < 0) {
      setFormError('Expected harvest must be on or after the planting date.');
      return;
    }
    onSave({
      plantingDate: plantingDate || null,
      expectedHarvestDate: expectedHarvestDate || null,
    });
  };

  return (
    <div className="grn-timing-modal" onClick={onClose}>
      <div
        className="grn-timing-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-timing-heading"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="grn-timing-modal__header">
          <div>
            <span>Harvest timeline</span>
            <h2 id="crop-timing-heading">Timing for {cropName}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close timing editor">
            ×
          </button>
        </header>

        <form onSubmit={submit}>
          <p className="grn-timing-modal__intro">
            Save your best estimate for the first harvest. The timeline will treat it as a helpful
            check-in, not a guarantee.
          </p>

          <div className="grn-timing-modal__fields">
            <label>
              <span>Planting date</span>
              <input
                type="date"
                value={plantingDate}
                onChange={(event) => setPlantingDate(event.target.value)}
              />
            </label>
            <label>
              <span>Expected first harvest</span>
              <input
                type="date"
                value={expectedHarvestDate}
                onChange={(event) => setExpectedHarvestDate(event.target.value)}
              />
            </label>
          </div>

          <div className="grn-timing-modal__quick-picks" role="group" aria-label="Quick harvest estimates">
            <span>Estimate from planting:</span>
            {[60, 75, 90, 120].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => {
                  const start = plantingDate || todayIso();
                  setPlantingDate(start);
                  setExpectedHarvestDate(addDaysIso(start, days));
                }}
              >
                {days} days
              </button>
            ))}
          </div>

          {harvestDays !== null && harvestDays >= 0 ? (
            <p className="grn-timing-modal__hint">
              About {harvestDays} day{harvestDays === 1 ? '' : 's'} from planting to first harvest.
            </p>
          ) : null}

          {formError || saveError ? (
            <p className="grn-timing-modal__error" role="alert">
              {formError || saveError}
            </p>
          ) : null}

          <footer className="grn-timing-modal__actions">
            <Button type="button" variant="ghost" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save timing'}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
}
