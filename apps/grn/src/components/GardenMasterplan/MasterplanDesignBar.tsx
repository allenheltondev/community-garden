import type { BedShape } from '../../types/listing';
import { ANNOTATION_PRESETS } from '../GardenDesigner/annotationPresets';
import { BED_SHAPES } from '../GardenDesigner/bedDefaults';
import type { GridSnap } from '../GardenDesigner/Toolbar';

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
}

/**
 * Floating editing dock for the masterplan. Keeps the "design while looking
 * at the illustrated plan" tools — add a bed or landmark, undo/redo, grid
 * snap — on the same view as the artwork, so dragging elements around isn't
 * the only thing you can do without leaving for the precision editor.
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
}: MasterplanDesignBarProps) {
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
        {BED_SHAPES.map((shape) => (
          <button
            key={shape.value}
            type="button"
            className="mp-design__btn"
            onClick={() => onAddBed(shape.value)}
            title={shape.hint}
            aria-label={shape.hint}
          >
            <span aria-hidden="true">{shape.emoji}</span>
            <span className="mp-design__btn-label">{shape.label}</span>
          </button>
        ))}
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

      {isSaving && (
        <span className="mp-design__saving" role="status">
          Saving…
        </span>
      )}
    </div>
  );
}
