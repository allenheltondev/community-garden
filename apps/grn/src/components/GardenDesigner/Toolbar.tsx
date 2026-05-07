import type { BedShape } from '../../types/listing';
import { BED_SHAPES } from './bedDefaults';

export type DesignerMode = 'idle' | 'drawing-polygon';
export type GridSnap = 'off' | '6' | '12';

interface ToolbarProps {
  isMobile: boolean;
  editUnlocked: boolean;
  onToggleEditUnlocked: () => void;
  mode: DesignerMode;
  onAddBed: (shape: BedShape) => void;
  onStartDrawingPolygon: () => void;
  onCancelDrawingPolygon: () => void;
  gridSnap: GridSnap;
  onGridSnapChange: (snap: GridSnap) => void;
  onFitToScreen: () => void;
}

/**
 * Vertical left-rail toolbar, paint.net style. Each tool is a square
 * icon button with a tooltip; the small select controls are stacked at
 * the bottom. On mobile this collapses into a horizontal strip via CSS.
 */
export function Toolbar({
  isMobile,
  editUnlocked,
  onToggleEditUnlocked,
  mode,
  onAddBed,
  onStartDrawingPolygon,
  onCancelDrawingPolygon,
  gridSnap,
  onGridSnapChange,
  onFitToScreen,
}: ToolbarProps) {
  const editingBlocked = isMobile && !editUnlocked;
  const drawing = mode === 'drawing-polygon';

  return (
    <div
      className={`grn-designer-toolbar ${editingBlocked ? 'is-locked' : ''}`}
      role="toolbar"
      aria-label="Garden designer tools"
    >
      <div className="grn-designer-toolbar__group" role="group" aria-label="Add a bed">
        {BED_SHAPES.map((shape) => (
          <button
            key={shape.value}
            type="button"
            className="grn-designer-toolbar__btn"
            onClick={() => onAddBed(shape.value)}
            disabled={editingBlocked || drawing}
            title={shape.hint}
            aria-label={shape.hint}
          >
            <span className="grn-designer-toolbar__btn-emoji" aria-hidden="true">
              {shape.emoji}
            </span>
            <span className="grn-designer-toolbar__btn-label">{shape.label}</span>
          </button>
        ))}
        <button
          type="button"
          className={`grn-designer-toolbar__btn ${drawing ? 'is-active' : ''}`}
          onClick={drawing ? onCancelDrawingPolygon : onStartDrawingPolygon}
          disabled={editingBlocked}
          title={
            drawing
              ? 'Click to add points, double-click to close. Esc to cancel.'
              : 'Draw a custom polygon by clicking points'
          }
          aria-label={drawing ? 'Cancel drawing' : 'Draw custom shape'}
        >
          <span className="grn-designer-toolbar__btn-emoji" aria-hidden="true">✏️</span>
          <span className="grn-designer-toolbar__btn-label">
            {drawing ? 'Drawing…' : 'Draw shape'}
          </span>
        </button>
      </div>

      <div className="grn-designer-toolbar__divider" aria-hidden="true" />

      <div className="grn-designer-toolbar__group" role="group" aria-label="View">
        <label className="grn-designer-toolbar__field">
          <span>Snap</span>
          <select
            value={gridSnap}
            onChange={(e) => onGridSnapChange(e.target.value as GridSnap)}
            disabled={editingBlocked}
          >
            <option value="off">Off</option>
            <option value="6">6 in</option>
            <option value="12">1 ft</option>
          </select>
        </label>
        <button
          type="button"
          className="grn-designer-toolbar__btn grn-designer-toolbar__btn--ghost"
          onClick={onFitToScreen}
          title="Fit canvas to viewport"
          aria-label="Fit to screen"
        >
          <span className="grn-designer-toolbar__btn-emoji" aria-hidden="true">🔍</span>
          <span className="grn-designer-toolbar__btn-label">Fit</span>
        </button>
      </div>

      {isMobile && (
        <>
          <div className="grn-designer-toolbar__divider" aria-hidden="true" />
          <div className="grn-designer-toolbar__group" role="group" aria-label="Edit lock">
            <button
              type="button"
              className={`grn-designer-toolbar__btn ${editUnlocked ? 'is-active' : ''}`}
              onClick={onToggleEditUnlocked}
              title={editUnlocked ? 'Lock layout (read-only mode)' : 'Unlock to edit'}
              aria-pressed={editUnlocked}
            >
              <span className="grn-designer-toolbar__btn-emoji" aria-hidden="true">
                {editUnlocked ? '🔓' : '🔒'}
              </span>
              <span className="grn-designer-toolbar__btn-label">
                {editUnlocked ? 'Editing' : 'Locked'}
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
