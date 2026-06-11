import { useState, type FormEvent } from 'react';
import { Button } from '@olivias/ui';
import { Modal } from '../Modal';
import type { GardenCanvas } from '../../types/listing';
import {
  calibrationFactor,
  formatInchesAsFeet,
  rescaledCanvas,
} from './calibration';

type LengthUnit = 'ft' | 'in';

interface CalibrateScaleModalProps {
  canvas: GardenCanvas;
  /** Length of the reference line the user drew, in canvas inches. */
  drawnLengthInches: number;
  /** Beds + annotations that could be rescaled along with the canvas. */
  elementCount: number;
  onApply: (realLengthInches: number, rescaleElements: boolean) => void;
  onCancel: () => void;
}

/**
 * Asks how long the just-drawn reference line is in real life, previews
 * the resulting canvas size (including any clamping), and lets the user
 * choose whether existing beds/annotations scale along with the canvas
 * so everything keeps its place over the photo.
 *
 * Mount this only while a calibration line is pending — local input
 * state resets naturally with each mount.
 */
export function CalibrateScaleModal({
  canvas,
  drawnLengthInches,
  elementCount,
  onApply,
  onCancel,
}: CalibrateScaleModalProps) {
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<LengthUnit>('ft');
  const [rescaleElements, setRescaleElements] = useState(true);

  const parsed = Number(value);
  const realLengthInches =
    Number.isFinite(parsed) && parsed > 0
      ? parsed * (unit === 'ft' ? 12 : 1)
      : null;
  const factor =
    realLengthInches !== null
      ? calibrationFactor(drawnLengthInches, realLengthInches)
      : null;
  const preview = factor !== null ? rescaledCanvas(canvas, factor) : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (realLengthInches === null) return;
    onApply(realLengthInches, elementCount > 0 && rescaleElements);
  }

  return (
    <Modal
      open
      onClose={onCancel}
      title="How long is this line in real life?"
      subtitle={`You drew a line measuring ${formatInchesAsFeet(
        drawnLengthInches
      )} at the canvas's current scale.`}
      size="md"
      className="grn-calibrate-modal"
    >
      <form className="grn-calibrate-form" onSubmit={handleSubmit}>
        <div className="grn-calibrate-form__row">
          <label className="grn-calibrate-form__field">
            <span>Real-world length</span>
            <input
              type="number"
              min="0"
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              autoFocus
              required
              aria-label="Real-world length"
            />
          </label>
          <label className="grn-calibrate-form__field grn-calibrate-form__field--unit">
            <span>Unit</span>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as LengthUnit)}
              aria-label="Length unit"
            >
              <option value="ft">feet</option>
              <option value="in">inches</option>
            </select>
          </label>
        </div>

        {elementCount > 0 && (
          <label className="grn-calibrate-form__rescale">
            <input
              type="checkbox"
              checked={rescaleElements}
              onChange={(e) => setRescaleElements(e.target.checked)}
            />
            <span>
              Also rescale my {elementCount} beds and annotations to match
            </span>
          </label>
        )}

        <p className="grn-calibrate-form__preview" aria-live="polite">
          {preview ? (
            <>
              Your garden becomes {formatInchesAsFeet(preview.widthInches)} ×{' '}
              {formatInchesAsFeet(preview.heightInches)}.
              {preview.clamped &&
                ' The scale was limited to keep the canvas between 5 ft and 500 ft per side.'}
            </>
          ) : (
            'Enter the length to preview your garden’s new size.'
          )}
        </p>

        <div className="grn-calibrate-form__actions">
          <Button type="button" variant="ghost" size="md" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="md" disabled={realLengthInches === null}>
            Apply
          </Button>
        </div>
      </form>
    </Modal>
  );
}
