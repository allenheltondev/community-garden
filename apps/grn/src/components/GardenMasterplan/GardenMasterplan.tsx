import { useMemo } from 'react';
import type {
  GardenAnnotation,
  GardenBed,
  GardenCanvas,
  GrowerCropItem,
} from '../../types/listing';
import type { SelectedItem } from '../../hooks/useGardenDesigner';
import { IsoScene, sceneMetrics } from './IsoScene';
import { MasterplanDetailPanel } from './MasterplanDetailPanel';
import { useMapViewport } from './useMapViewport';

interface GardenMasterplanProps {
  canvas: GardenCanvas;
  beds: GardenBed[];
  annotations: GardenAnnotation[];
  cropsByBedId: Map<string, GrowerCropItem[]>;
  selected: SelectedItem;
  selectedBed: GardenBed | undefined;
  selectedAnnotation: GardenAnnotation | undefined;
  onSelect: (next: SelectedItem) => void;
  onPatchBed: (bedId: string, patch: Partial<GardenBed>) => void;
  onPatchAnnotation: (annotationId: string, patch: Partial<GardenAnnotation>) => void;
  onOpenLayoutEditor: () => void;
}

/**
 * The masterplan explorer: an isometric illustrated map of the whole
 * garden that doubles as navigation. Drag/scroll/pinch to move around,
 * click any element for its floating detail card. Editing geometry stays
 * in the layout editor — this view is for understanding and exploring
 * the property.
 */
export function GardenMasterplan({
  canvas,
  beds,
  annotations,
  cropsByBedId,
  selected,
  selectedBed,
  selectedAnnotation,
  onSelect,
  onPatchBed,
  onPatchAnnotation,
  onOpenLayoutEditor,
}: GardenMasterplanProps) {
  const metrics = useMemo(() => sceneMetrics(canvas), [canvas]);
  const viewport = useMapViewport(metrics.width, metrics.height);
  const isEmpty = beds.length === 0 && annotations.length === 0;

  return (
    <div className="mp-explorer">
      <div
        ref={viewport.containerRef}
        className="mp-explorer__viewport"
        {...viewport.containerHandlers}
      >
        <div className="mp-explorer__content" style={viewport.contentStyle}>
          <IsoScene
            canvas={canvas}
            beds={beds}
            annotations={annotations}
            cropsByBedId={cropsByBedId}
            selected={selected}
            onSelect={onSelect}
            shouldIgnoreClick={viewport.shouldIgnoreClick}
          />
        </div>

        <div className="mp-explorer__zoom" role="group" aria-label="Map zoom controls">
          <button
            type="button"
            className="mp-explorer__zoom-btn"
            onClick={viewport.zoomIn}
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="mp-explorer__zoom-btn"
            onClick={viewport.zoomOut}
            aria-label="Zoom out"
            title="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className="mp-explorer__zoom-btn mp-explorer__zoom-btn--fit"
            onClick={viewport.fitToScreen}
            aria-label="Fit garden to screen"
            title="Fit to screen"
          >
            ⊡
          </button>
        </div>

        {!isEmpty && (
          <p className="mp-explorer__hint" aria-hidden="true">
            Drag to explore · scroll to zoom · click anything for details
          </p>
        )}

        {isEmpty && (
          <div className="mp-explorer__empty">
            <h2>Your property, beautifully mapped</h2>
            <p>
              Add beds, trees, paths, and structures in the layout editor and
              they’ll appear here as an illustrated masterplan.
            </p>
            <button
              type="button"
              className="mp-panel__action"
              onClick={onOpenLayoutEditor}
            >
              Open the layout editor
            </button>
          </div>
        )}
      </div>

      {(selectedBed || selectedAnnotation) && (
        <MasterplanDetailPanel
          key={selectedBed?.id ?? selectedAnnotation?.id}
          bed={selectedBed}
          annotation={selectedAnnotation}
          crops={selectedBed ? cropsByBedId.get(selectedBed.id) ?? [] : []}
          onArrange={(direction) => {
            const delta = direction === 'forward' ? 1 : -1;
            if (selectedBed) {
              onPatchBed(selectedBed.id, { sortOrder: selectedBed.sortOrder + delta });
            } else if (selectedAnnotation) {
              onPatchAnnotation(selectedAnnotation.id, {
                sortOrder: selectedAnnotation.sortOrder + delta,
              });
            }
          }}
          onClose={() => onSelect(null)}
          onOpenLayoutEditor={onOpenLayoutEditor}
        />
      )}
    </div>
  );
}
