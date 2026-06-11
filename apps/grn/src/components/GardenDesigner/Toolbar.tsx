import { useEffect, useRef, useState } from 'react';
import type { BedShape } from '../../types/listing';
import { ANNOTATION_PRESETS } from './annotationPresets';
import { BED_SHAPES } from './bedDefaults';

export type DesignerMode =
  | 'idle'
  | 'drawing-polygon'
  | 'editing-vertices'
  | 'calibrating-scale';
export type GridSnap = 'off' | '6' | '12';

interface ToolbarProps {
  isMobile: boolean;
  mode: DesignerMode;
  onAddBed: (shape: BedShape) => void;
  onAddAnnotation: (presetId: string) => void;
  onStartDrawingPolygon: () => void;
  onCancelDrawingPolygon: () => void;
  gridSnap: GridSnap;
  onGridSnapChange: (snap: GridSnap) => void;
  onFitToScreen: () => void;
}

/**
 * Designer toolbar.
 *
 * Two layouts share the same component:
 * - Desktop: vertical left-rail with all tools laid out in groups.
 * - Mobile: floating bottom dock with the most-used actions (rect, circle,
 *   draw, plus a "More" button that opens a sheet of annotations + view
 *   controls).
 *
 * Bed shape and "draw polygon" are the two primary creation paths so they
 * stay visible at all times. Annotations and snap settings tuck into the
 * More sheet on mobile to keep the dock from wrapping into multiple rows.
 */
export function Toolbar({
  isMobile,
  mode,
  onAddBed,
  onAddAnnotation,
  onStartDrawingPolygon,
  onCancelDrawingPolygon,
  gridSnap,
  onGridSnapChange,
  onFitToScreen,
}: ToolbarProps) {
  const drawing = mode === 'drawing-polygon';
  // While the user is calibrating the background scale, creating new
  // elements would land at a soon-to-change scale — park the tools.
  const calibrating = mode === 'calibrating-scale';
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  // Tap outside the More sheet on mobile to dismiss it.
  useEffect(() => {
    if (!moreOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!moreRef.current) return;
      if (!moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMoreOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [moreOpen]);

  const bedButtons = BED_SHAPES.map((shape) => (
    <button
      key={shape.value}
      type="button"
      className="grn-designer-toolbar__btn"
      onClick={() => {
        onAddBed(shape.value);
        setMoreOpen(false);
      }}
      disabled={drawing || calibrating}
      title={shape.hint}
      aria-label={shape.hint}
    >
      <span className="grn-designer-toolbar__btn-emoji" aria-hidden="true">
        {shape.emoji}
      </span>
      <span className="grn-designer-toolbar__btn-label">{shape.label}</span>
    </button>
  ));

  const drawButton = (
    <button
      type="button"
      className={`grn-designer-toolbar__btn ${drawing ? 'is-active' : ''}`}
      onClick={drawing ? onCancelDrawingPolygon : onStartDrawingPolygon}
      disabled={calibrating}
      title={
        drawing
          ? 'Tap to add points, double-tap to close. Esc to cancel.'
          : 'Draw a custom polygon by tapping points'
      }
      aria-label={drawing ? 'Cancel drawing' : 'Draw custom shape'}
    >
      <span className="grn-designer-toolbar__btn-emoji" aria-hidden="true">✏️</span>
      <span className="grn-designer-toolbar__btn-label">
        {drawing ? 'Drawing' : 'Draw'}
      </span>
    </button>
  );

  const annotationButtons = ANNOTATION_PRESETS.map((preset) => (
    <button
      key={preset.id}
      type="button"
      className="grn-designer-toolbar__btn"
      onClick={() => {
        onAddAnnotation(preset.id);
        setMoreOpen(false);
      }}
      disabled={drawing || calibrating}
      title={preset.description}
      aria-label={preset.description}
    >
      <span className="grn-designer-toolbar__btn-emoji" aria-hidden="true">
        {preset.icon}
      </span>
      <span className="grn-designer-toolbar__btn-label">{preset.label}</span>
    </button>
  ));

  const snapField = (
    <label className="grn-designer-toolbar__field">
      <span>Snap</span>
      <select
        value={gridSnap}
        onChange={(e) => onGridSnapChange(e.target.value as GridSnap)}
      >
        <option value="off">Off</option>
        <option value="6">6 in</option>
        <option value="12">1 ft</option>
      </select>
    </label>
  );

  if (isMobile) {
    return (
      <div
        className="grn-designer-toolbar grn-designer-toolbar--mobile"
        role="toolbar"
        aria-label="Garden designer tools"
        ref={moreRef}
      >
        <div className="grn-designer-toolbar__dock">
          {bedButtons}
          {drawButton}
          <button
            type="button"
            className={`grn-designer-toolbar__btn ${moreOpen ? 'is-active' : ''}`}
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-controls="grn-designer-toolbar-sheet"
            title="More tools"
          >
            <span className="grn-designer-toolbar__btn-emoji" aria-hidden="true">⋯</span>
            <span className="grn-designer-toolbar__btn-label">More</span>
          </button>
        </div>

        {moreOpen && (
          <div
            id="grn-designer-toolbar-sheet"
            className="grn-designer-toolbar__sheet"
            role="group"
            aria-label="More tools"
          >
            <div className="grn-designer-toolbar__sheet-section">
              <h3 className="grn-designer-toolbar__sheet-heading">Annotations</h3>
              <div className="grn-designer-toolbar__sheet-grid">{annotationButtons}</div>
            </div>
            <div className="grn-designer-toolbar__sheet-section">
              <h3 className="grn-designer-toolbar__sheet-heading">View</h3>
              <div className="grn-designer-toolbar__sheet-row">
                {snapField}
                <button
                  type="button"
                  className="grn-designer-toolbar__btn grn-designer-toolbar__btn--ghost"
                  onClick={() => {
                    onFitToScreen();
                    setMoreOpen(false);
                  }}
                  title="Fit canvas to viewport"
                  aria-label="Fit to screen"
                >
                  <span className="grn-designer-toolbar__btn-emoji" aria-hidden="true">🔍</span>
                  <span className="grn-designer-toolbar__btn-label">Fit</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="grn-designer-toolbar"
      role="toolbar"
      aria-label="Garden designer tools"
    >
      <div className="grn-designer-toolbar__group" role="group" aria-label="Add a bed">
        {bedButtons}
        {drawButton}
      </div>

      <div className="grn-designer-toolbar__divider" aria-hidden="true" />

      <div
        className="grn-designer-toolbar__group"
        role="group"
        aria-label="Add an annotation"
      >
        {annotationButtons}
      </div>

      <div className="grn-designer-toolbar__divider" aria-hidden="true" />

      <div className="grn-designer-toolbar__group" role="group" aria-label="View">
        {snapField}
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
    </div>
  );
}
