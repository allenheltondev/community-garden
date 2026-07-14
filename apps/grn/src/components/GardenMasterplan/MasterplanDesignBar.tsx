import { useState } from 'react';
import type { BedShape } from '../../types/listing';
import { ANNOTATION_PRESETS } from '../GardenDesigner/annotationPresets';
import { BED_SHAPES } from '../GardenDesigner/bedDefaults';
import type { GridSnap } from '../GardenDesigner/designerTypes';

interface MasterplanDesignBarProps {
  snap: GridSnap;
  onSnapChange: (snap: GridSnap) => void;
  onAddBed: (shape: BedShape) => void;
  onAddAnnotation: (presetId: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isSaving: boolean;
  widthInches: number;
  heightInches: number;
  onPatchCanvas: (patch: { widthInches?: number; heightInches?: number }) => void;
}

// Accept "12", "12ft", "12 ft", "12'", or explicit inches like "144in".
// Bare numbers are read as feet — the gardener's default unit.
function parseFeetInches(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ftMatch = /^(-?\d+(?:\.\d+)?)\s*(?:ft|')$/i.exec(trimmed);
  if (ftMatch) return Math.round(Number(ftMatch[1]) * 12);
  const inMatch = /^(-?\d+(?:\.\d+)?)\s*(?:in|")$/i.exec(trimmed);
  if (inMatch) return Math.round(Number(inMatch[1]));
  const num = Number(trimmed);
  if (Number.isFinite(num)) return Math.round(num * 12);
  return null;
}

function formatFeetFromInches(inches: number): string {
  const feet = inches / 12;
  return Number.isInteger(feet) ? `${feet} ft` : `${feet.toFixed(1)} ft`;
}

/**
 * Floating editing dock for the masterplan — the garden's single design
 * surface. Add a bed or landmark, undo/redo, set grid snap, and adjust the
 * overall garden size, all while looking at the illustrated plan. Per-element
 * precision (resize, rotate, reshape, details) lives on the selected element
 * itself via handles and the inspector.
 */
export function MasterplanDesignBar({
  snap,
  onSnapChange,
  onAddBed,
  onAddAnnotation,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isSaving,
  widthInches,
  heightInches,
  onPatchCanvas,
}: MasterplanDesignBarProps) {
  const [widthInput, setWidthInput] = useState(formatFeetFromInches(widthInches));
  const [heightInput, setHeightInput] = useState(formatFeetFromInches(heightInches));

  // Draft-on-focus: while a field is focused the local draft wins; on blur
  // it commits (clamped) and re-formats, or reverts to the current value.
  const widthValue = widthInput;
  const heightValue = heightInput;

  function commitScale(
    field: 'widthInches' | 'heightInches',
    raw: string,
    current: number,
    setInput: (value: string) => void
  ) {
    const next = parseFeetInches(raw);
    if (next === null || next < 12 || next > 12_000) {
      setInput(formatFeetFromInches(current));
      return;
    }
    setInput(formatFeetFromInches(next));
    if (next !== current) onPatchCanvas({ [field]: next });
  }

  return (
    <div className="mp-design" role="toolbar" aria-label="Design tools">
      <div className="mp-design__group" role="group" aria-label="Edit history">
        <button
          type="button"
          className="mp-design__btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          ↶
        </button>
        <button
          type="button"
          className="mp-design__btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          ↷
        </button>
      </div>

      <span className="mp-design__divider" aria-hidden="true" />

      <div className="mp-design__group" role="group" aria-label="Add a bed">
        <button
          type="button"
          className="mp-design__btn mp-design__btn--primary"
          onClick={() => onAddBed('rect')}
          title="Add a rectangular raised bed"
        >
          <span aria-hidden="true">＋</span>
          <span>Add bed</span>
        </button>
        <label className="mp-design__field mp-design__field--shape">
          <span className="mp-design__field-label">Bed shape</span>
          <select
            aria-label="Add a different bed shape"
            value=""
            onChange={(event) => {
              if (event.target.value) onAddBed(event.target.value as BedShape);
            }}
          >
            <option value="">More shapes</option>
            {BED_SHAPES.filter((shape) => shape.value !== 'rect').map((shape) => (
              <option key={shape.value} value={shape.value}>
                {shape.emoji} {shape.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <span className="mp-design__divider" aria-hidden="true" />

      <label className="mp-design__field">
        <span className="mp-design__field-label">Add landmark</span>
        <select
          aria-label="Add a landmark"
          // Value resets to placeholder after each pick so the same
          // landmark can be added twice in a row.
          value=""
          onChange={(event) => {
            if (event.target.value) onAddAnnotation(event.target.value);
          }}
        >
          <option value="">＋ Landmark…</option>
          {ANNOTATION_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.icon} {preset.label}
            </option>
          ))}
        </select>
      </label>

      <span className="mp-design__divider" aria-hidden="true" />

      <label className="mp-design__field">
        <span className="mp-design__field-label">Snap</span>
        <select
          value={snap}
          aria-label="Grid snap"
          onChange={(event) => onSnapChange(event.target.value as GridSnap)}
        >
          <option value="off">Off</option>
          <option value="6">6 in</option>
          <option value="12">1 ft</option>
        </select>
      </label>

      <span className="mp-design__divider" aria-hidden="true" />

      <div className="mp-design__field mp-design__field--scale">
        <span className="mp-design__field-label">Garden size</span>
        <div className="mp-design__scale">
          <input
            type="text"
            className="mp-design__scale-input"
            value={widthValue}
            aria-label="Garden width"
            inputMode="decimal"
            onChange={(event) => setWidthInput(event.target.value)}
            onBlur={(event) =>
              commitScale('widthInches', event.target.value, widthInches, setWidthInput)
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
            }}
          />
          <span className="mp-design__scale-x" aria-hidden="true">
            ×
          </span>
          <input
            type="text"
            className="mp-design__scale-input"
            value={heightValue}
            aria-label="Garden height"
            inputMode="decimal"
            onChange={(event) => setHeightInput(event.target.value)}
            onBlur={(event) =>
              commitScale('heightInches', event.target.value, heightInches, setHeightInput)
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
            }}
          />
        </div>
      </div>

      {isSaving && (
        <span className="mp-design__saving" role="status">
          Saving…
        </span>
      )}
    </div>
  );
}
