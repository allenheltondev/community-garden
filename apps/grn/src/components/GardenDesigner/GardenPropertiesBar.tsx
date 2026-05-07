import type { ChangeEvent } from 'react';
import { useState } from 'react';
import type { GardenAnnotation, GardenBed, GardenCanvas } from '../../types/listing';
import { bedAreaSquareInches, formatArea } from './bedDefaults';

interface GardenPropertiesBarProps {
  canvas: GardenCanvas;
  beds: GardenBed[];
  annotations: GardenAnnotation[];
  isEditable: boolean;
  isSaving: boolean;
  onCanvasChange: (patch: {
    widthInches?: number;
    heightInches?: number;
    backgroundOpacity?: number;
  }) => void;
  hasBackground: boolean;
  onPickBackgroundFile: (file: File) => void;
  onClearBackground: () => void;
}

const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function parseFeetInches(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Accept "12", "12ft", "12 ft", "12'", or just inches like "144in".
  const ftMatch = /^(-?\d+(?:\.\d+)?)\s*(?:ft|')$/i.exec(trimmed);
  if (ftMatch) {
    return Math.round(Number(ftMatch[1]) * 12);
  }
  const inMatch = /^(-?\d+(?:\.\d+)?)\s*(?:in|")$/i.exec(trimmed);
  if (inMatch) {
    return Math.round(Number(inMatch[1]));
  }
  const num = Number(trimmed);
  if (Number.isFinite(num)) {
    // Bare numbers are interpreted as feet — that's the gardener's
    // unit of choice. They can append "in" if they really meant inches.
    return Math.round(num * 12);
  }
  return null;
}

function formatFeetFromInches(inches: number): string {
  const feet = inches / 12;
  if (Number.isInteger(feet)) {
    return `${feet} ft`;
  }
  return `${feet.toFixed(1)} ft`;
}

/**
 * Top-of-page bar showing garden-level properties: editable scale,
 * background photo controls, and live totals (bed count, total
 * growable area). Replaces the old per-bed toolbar that lived here
 * in the first iteration.
 */
export function GardenPropertiesBar({
  canvas,
  beds,
  annotations,
  isEditable,
  isSaving,
  onCanvasChange,
  hasBackground,
  onPickBackgroundFile,
  onClearBackground,
}: GardenPropertiesBarProps) {
  const [widthInput, setWidthInput] = useState(formatFeetFromInches(canvas.widthInches));
  const [heightInput, setHeightInput] = useState(formatFeetFromInches(canvas.heightInches));

  function commitWidth(raw: string) {
    const next = parseFeetInches(raw);
    if (next === null || next < 12 || next > 12_000) {
      setWidthInput(formatFeetFromInches(canvas.widthInches));
      return;
    }
    setWidthInput(formatFeetFromInches(next));
    if (next !== canvas.widthInches) {
      onCanvasChange({ widthInches: next });
    }
  }

  function commitHeight(raw: string) {
    const next = parseFeetInches(raw);
    if (next === null || next < 12 || next > 12_000) {
      setHeightInput(formatFeetFromInches(canvas.heightInches));
      return;
    }
    setHeightInput(formatFeetFromInches(next));
    if (next !== canvas.heightInches) {
      onCanvasChange({ heightInches: next });
    }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) return;
    onPickBackgroundFile(file);
    event.target.value = '';
  }

  const totalSquareInches = beds.reduce(
    (sum, bed) =>
      sum +
      bedAreaSquareInches({
        shape: bed.shape,
        lengthInches: bed.lengthInches,
        widthInches: bed.widthInches,
        points: bed.points,
      }),
    0
  );

  return (
    <div className="grn-garden-properties" role="region" aria-label="Garden properties">
      <div className="grn-garden-properties__group" role="group" aria-label="Scale">
        <span className="grn-garden-properties__label">Scale</span>
        <div className="grn-garden-properties__scale">
          <label className="grn-garden-properties__scale-field">
            <span>Width</span>
            <input
              type="text"
              value={widthInput}
              onChange={(e) => setWidthInput(e.target.value)}
              onBlur={(e) => commitWidth(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              disabled={!isEditable}
              inputMode="decimal"
              aria-label="Garden width"
            />
          </label>
          <span className="grn-garden-properties__scale-x" aria-hidden="true">×</span>
          <label className="grn-garden-properties__scale-field">
            <span>Height</span>
            <input
              type="text"
              value={heightInput}
              onChange={(e) => setHeightInput(e.target.value)}
              onBlur={(e) => commitHeight(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              disabled={!isEditable}
              inputMode="decimal"
              aria-label="Garden height"
            />
          </label>
        </div>
      </div>

      <div className="grn-garden-properties__group" role="group" aria-label="Totals">
        <div className="grn-garden-properties__metric">
          <span className="grn-garden-properties__metric-label">Beds</span>
          <span className="grn-garden-properties__metric-value">{beds.length}</span>
        </div>
        <div className="grn-garden-properties__metric">
          <span className="grn-garden-properties__metric-label">Annotations</span>
          <span className="grn-garden-properties__metric-value">{annotations.length}</span>
        </div>
        <div className="grn-garden-properties__metric">
          <span className="grn-garden-properties__metric-label">Growable area</span>
          <span className="grn-garden-properties__metric-value">
            {formatArea(totalSquareInches)}
          </span>
        </div>
      </div>

      <div className="grn-garden-properties__group" role="group" aria-label="Background photo">
        <label className="grn-designer-toolbar__btn grn-designer-toolbar__btn--ghost">
          <span className="grn-designer-toolbar__btn-emoji" aria-hidden="true">🛰️</span>
          <span>{hasBackground ? 'Replace background photo' : 'Add background photo'}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFile}
            disabled={!isEditable}
            hidden
          />
        </label>
        {hasBackground && (
          <>
            <label className="grn-designer-toolbar__field">
              <span>Opacity</span>
              <input
                type="range"
                min={0}
                max={100}
                value={canvas.backgroundOpacity}
                onChange={(e) =>
                  onCanvasChange({ backgroundOpacity: Number(e.target.value) })
                }
                disabled={!isEditable}
              />
            </label>
            <button
              type="button"
              className="grn-designer-toolbar__btn grn-designer-toolbar__btn--ghost"
              onClick={onClearBackground}
              disabled={!isEditable}
            >
              Remove
            </button>
          </>
        )}
      </div>

      <div className="grn-garden-properties__group grn-garden-properties__group--end">
        <span
          className="grn-designer-toolbar__save-status"
          aria-live="polite"
          data-saving={isSaving}
        >
          {isSaving ? 'Saving…' : 'Saved'}
        </span>
      </div>
    </div>
  );
}
