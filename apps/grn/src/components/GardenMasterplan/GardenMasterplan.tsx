import { useMemo, useState } from 'react';
import type {
  GardenAnnotation,
  GardenBed,
  GardenCanvas,
  GrowerCropItem,
} from '../../types/listing';
import type { SelectedItem } from '../../hooks/useGardenDesigner';
import { GARDEN_TEMPLATES } from '../GardenDesigner/gardenTemplates';
import { sceneMetrics } from './footprints';
import { IsoScene } from './IsoScene';
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
  onApplyTemplate: (templateId: string) => Promise<void>;
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
  onApplyTemplate,
}: GardenMasterplanProps) {
  const metrics = useMemo(() => sceneMetrics(canvas), [canvas]);
  // Which template is being applied right now (null = none). Applying
  // disables every card so the guard in applyTemplate can't be raced by
  // a second click.
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);

  async function handleApplyTemplate(templateId: string) {
    setApplyingTemplateId(templateId);
    try {
      await onApplyTemplate(templateId);
    } finally {
      setApplyingTemplateId(null);
    }
  }
  // Destructured (rather than kept as one `viewport` object) so the
  // react-hooks/refs rule can see that only the callback ref goes to the
  // ref prop and everything else is plain render data.
  const {
    containerRef,
    containerHandlers,
    contentStyle,
    zoomIn,
    zoomOut,
    fitToScreen,
    shouldIgnoreClick,
  } = useMapViewport(metrics.width, metrics.height);
  const isEmpty = beds.length === 0 && annotations.length === 0;

  return (
    <div className="mp-explorer">
      <div
        ref={containerRef}
        className="mp-explorer__viewport"
        {...containerHandlers}
      >
        <div className="mp-explorer__content" style={contentStyle}>
          <IsoScene
            canvas={canvas}
            beds={beds}
            annotations={annotations}
            cropsByBedId={cropsByBedId}
            selected={selected}
            onSelect={onSelect}
            shouldIgnoreClick={shouldIgnoreClick}
          />
        </div>

        <div className="mp-explorer__zoom" role="group" aria-label="Map zoom controls">
          <button
            type="button"
            className="mp-explorer__zoom-btn"
            onClick={zoomIn}
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="mp-explorer__zoom-btn"
            onClick={zoomOut}
            aria-label="Zoom out"
            title="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className="mp-explorer__zoom-btn mp-explorer__zoom-btn--fit"
            onClick={fitToScreen}
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
              Add beds, trees, paths, and structures and they’ll appear here
              as an illustrated masterplan.
            </p>
            <h3 className="mp-templates__heading">Start from a template</h3>
            <div className="mp-templates" role="list" aria-label="Starter garden templates">
              {GARDEN_TEMPLATES.map((template) => (
                <div key={template.id} className="mp-template-card" role="listitem">
                  <h4 className="mp-template-card__name">{template.name}</h4>
                  <p className="mp-template-card__desc">{template.description}</p>
                  <p className="mp-template-card__stats">
                    {template.stats.bedCount}{' '}
                    {template.stats.bedCount === 1 ? 'bed' : 'beds'} ·{' '}
                    {template.stats.annotationCount}{' '}
                    {template.stats.annotationCount === 1 ? 'landmark' : 'landmarks'}
                  </p>
                  <button
                    type="button"
                    className="mp-template-card__use"
                    disabled={applyingTemplateId !== null}
                    onClick={() => {
                      void handleApplyTemplate(template.id);
                    }}
                  >
                    {applyingTemplateId === template.id
                      ? 'Planting…'
                      : 'Use this layout'}
                  </button>
                </div>
              ))}
            </div>
            {applyingTemplateId !== null && (
              <p className="mp-templates__progress" role="status">
                Planting your starter garden…
              </p>
            )}
            <p className="mp-templates__or">or start from scratch</p>
            <button
              type="button"
              className="mp-panel__action mp-templates__editor-btn"
              onClick={onOpenLayoutEditor}
              disabled={applyingTemplateId !== null}
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
