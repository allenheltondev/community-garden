import { useMemo, useRef, useState } from 'react';
import type {
  BedPolygonPoint,
  BedShape,
  GardenAnnotation,
  GardenBed,
  GardenCanvas,
  GrowerCropItem,
} from '../../types/listing';
import type { SelectedItem } from '../../hooks/useGardenDesigner';
import type { QuickAddCropInput } from '../GardenDesigner/QuickAddCrop';
import { GARDEN_TEMPLATES } from '../GardenDesigner/gardenTemplates';
import type { DesignerMode, GridSnap } from '../GardenDesigner/designerTypes';
import type { ElementGeometry } from './isoTransform';
import { downloadScenePng, downloadSceneSvg } from './exportScene';
import { SharePopover } from './SharePopover';
import { sceneMetrics } from './footprints';
import { GardenReviewPanel } from './GardenReviewPanel';
import { IsoScene } from './IsoScene';
import { MasterplanDesignBar } from './MasterplanDesignBar';
import { MasterplanDetailPanel } from './MasterplanDetailPanel';
import {
  MONTH_LABELS_FULL,
  MONTH_LABELS_SHORT,
  filterCropsForMonth,
  harvestCountForMonth,
  type SeasonMonth,
} from './season';
import { bedNoonShadeFraction, hasNoonShadeConflict, type SunTime } from './shadows';
import { useMapViewport } from './useMapViewport';

const SUN_OPTIONS: Array<{ value: SunTime | null; label: string; title: string }> = [
  { value: null, label: 'Off', title: 'Hide sun shadows' },
  { value: 'morning', label: 'AM', title: 'Morning sun (low in the east)' },
  { value: 'noon', label: 'Noon', title: 'Midday sun' },
  { value: 'evening', label: 'PM', title: 'Evening sun (low in the west)' },
];

/**
 * Direct-manipulation editing on the illustrated plan. When supplied, the
 * masterplan becomes the primary design surface: elements drag to
 * reposition on the ground plane, and the floating design bar adds beds /
 * landmarks and drives undo-redo. Omit it for read-only contexts (the
 * public shared garden) and the plan stays explore-only.
 */
export interface MasterplanEditing {
  snap: GridSnap;
  onSnapChange: (snap: GridSnap) => void;
  /** Idle vs per-vertex reshaping of the selected custom-shape bed. */
  mode: DesignerMode;
  onSetMode: (mode: DesignerMode) => void;
  onMoveBed: (bedId: string, positionX: number, positionY: number) => void;
  onMoveAnnotation: (annotationId: string, positionX: number, positionY: number) => void;
  onResizeBed: (bedId: string, next: ElementGeometry) => void;
  onResizeAnnotation: (annotationId: string, next: ElementGeometry) => void;
  onUpdateBedPoints: (bedId: string, points: BedPolygonPoint[]) => void;
  onAddBed: (shape: BedShape) => void;
  onAddAnnotation: (presetId: string) => void;
  onDeleteBed: (bedId: string) => void;
  onDeleteAnnotation: (annotationId: string) => void;
  /** Attach a crop to the currently-selected bed from the detail panel. */
  onAddCrop: (input: QuickAddCropInput) => Promise<void>;
  onDuplicate: () => void;
  /** Edit garden-level scale from the masterplan design bar. */
  onPatchCanvas: (patch: { widthInches?: number; heightInches?: number }) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isSaving: boolean;
}

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
  onApplyTemplate: (templateId: string) => Promise<void>;
  /** Present when the plan is an editable design surface. */
  editing?: MasterplanEditing;
}

const SNAP_INCHES: Record<GridSnap, number> = { off: 0, '6': 6, '12': 12 };

/**
 * The masterplan explorer: an isometric illustrated map of the whole
 * garden that doubles as navigation and the single editing surface.
 * Drag/scroll/pinch to move around, click any element for its floating
 * inspector, and — when `editing` is supplied — drag handles to
 * resize/rotate, reshape custom outlines, and tune every detail in place.
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
  onApplyTemplate,
  editing,
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

  // Time dimension: null = "All season" (the unfiltered, default map).
  const [seasonMonth, setSeasonMonth] = useState<SeasonMonth>(null);
  // Sun shadows default to noon: the short midday stubs add depth without
  // cluttering the plan, and they make the full-sun/shade insight visible.
  const [sunTime, setSunTime] = useState<SunTime | null>('noon');

  // Crops standing in their beds during the scrubbed month. With "All
  // season" selected this is the original map, untouched.
  const visibleCropsByBedId = useMemo(() => {
    if (seasonMonth == null) return cropsByBedId;
    const filtered = new Map<string, GrowerCropItem[]>();
    for (const [bedId, crops] of cropsByBedId) {
      filtered.set(bedId, filterCropsForMonth(crops, seasonMonth));
    }
    return filtered;
  }, [cropsByBedId, seasonMonth]);

  const selectedBedCrops = selectedBed ? cropsByBedId.get(selectedBed.id) ?? [] : [];
  const harvestCount = harvestCountForMonth(selectedBedCrops, seasonMonth);

  // Noon-shade sanity check for the selected bed, independent of the sun
  // toggle — the conflict exists whether or not shadows are drawn.
  const noonShadeConflict = useMemo(() => {
    if (!selectedBed) return false;
    const fraction = bedNoonShadeFraction(
      selectedBed,
      beds,
      annotations,
      canvas.northOffsetDeg
    );
    return hasNoonShadeConflict(selectedBed, fraction);
  }, [annotations, beds, canvas.northOffsetDeg, selectedBed]);

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
  const plantedBedCount = useMemo(
    () => beds.filter((bed) => (cropsByBedId.get(bed.id)?.length ?? 0) > 0).length,
    [beds, cropsByBedId]
  );

  // Plain DOM ref to find the scene <svg> for export; pan/zoom state
  // never touches it.
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState(false);
  // Review panel and detail panel share the same screen edge; opening one
  // closes the other so they never stack.
  const [reviewOpen, setReviewOpen] = useState(false);

  function handleSelect(next: SelectedItem) {
    if (next) setReviewOpen(false);
    onSelect(next);
  }

  async function handleExport(format: 'png' | 'svg') {
    const svg = contentRef.current?.querySelector<SVGSVGElement>('svg.mp-scene');
    if (!svg || exporting) return;
    setExporting(true);
    try {
      if (format === 'svg') {
        downloadSceneSvg(svg);
      } else {
        await downloadScenePng(svg);
      }
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mp-explorer">
      <div
        ref={containerRef}
        className="mp-explorer__viewport"
        {...containerHandlers}
      >
        <div className="mp-explorer__content" style={contentStyle} ref={contentRef}>
          <IsoScene
            canvas={canvas}
            beds={beds}
            annotations={annotations}
            cropsByBedId={visibleCropsByBedId}
            selected={selected}
            onSelect={handleSelect}
            shouldIgnoreClick={shouldIgnoreClick}
            seasonMonth={seasonMonth}
            sunTime={sunTime}
            editable={Boolean(editing)}
            snapInches={editing ? SNAP_INCHES[editing.snap] : 0}
            mode={editing?.mode ?? 'idle'}
            onMoveBed={editing?.onMoveBed}
            onMoveAnnotation={editing?.onMoveAnnotation}
            onResizeBed={editing?.onResizeBed}
            onResizeAnnotation={editing?.onResizeAnnotation}
            onUpdateBedPoints={editing?.onUpdateBedPoints}
            onRequestVertexEdit={
              editing
                ? (bedId) => {
                    onSelect({ kind: 'bed', id: bedId });
                    editing.onSetMode('editing-vertices');
                  }
                : undefined
            }
          />
        </div>

        {editing && !isEmpty && (
          <MasterplanDesignBar
            snap={editing.snap}
            onSnapChange={editing.onSnapChange}
            onAddBed={editing.onAddBed}
            onAddAnnotation={editing.onAddAnnotation}
            canUndo={editing.canUndo}
            canRedo={editing.canRedo}
            onUndo={editing.onUndo}
            onRedo={editing.onRedo}
            isSaving={editing.isSaving}
            widthInches={canvas.widthInches}
            heightInches={canvas.heightInches}
            onPatchCanvas={editing.onPatchCanvas}
          />
        )}

        {editing && !isEmpty && !selected && (
          <aside className="mp-explorer__coach" aria-label="Garden design next step">
            <p className="mp-explorer__coach-kicker">Your garden at a glance</p>
            <p className="mp-explorer__coach-summary">
              {beds.length} {beds.length === 1 ? 'bed' : 'beds'} · {annotations.length}{' '}
              {annotations.length === 1 ? 'landmark' : 'landmarks'} · {plantedBedCount}{' '}
              {plantedBedCount === 1 ? 'bed planted' : 'beds planted'}
            </p>
            <p className="mp-explorer__coach-copy">
              Select anything on the map to tend it, or keep shaping your garden one bed at a time.
            </p>
            <button
              type="button"
              className="mp-explorer__coach-action"
              onClick={() => editing.onAddBed('rect')}
            >
              Add a raised bed
            </button>
          </aside>
        )}

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
          <div className="mp-explorer__export" role="group" aria-label="Export the masterplan">
            <button
              type="button"
              className="mp-explorer__export-btn"
              onClick={() => {
                void handleExport('png');
              }}
              disabled={exporting}
              title="Download the masterplan as a PNG image"
            >
              ⬇ PNG
            </button>
            <button
              type="button"
              className="mp-explorer__export-btn"
              onClick={() => {
                void handleExport('svg');
              }}
              disabled={exporting}
              title="Download the masterplan as an SVG file"
            >
              ⬇ SVG
            </button>
            <button
              type="button"
              className="mp-explorer__export-btn"
              onClick={() => {
                setReviewOpen(true);
                onSelect(null);
              }}
              title="Get an AI review of your garden plan (Pro)"
            >
              ✨ Review
            </button>
            <SharePopover />
          </div>
        )}

        {!isEmpty && (
          <p className="mp-explorer__hint" aria-hidden="true">
            {editing
              ? 'Drag an element to move it · scroll to zoom · drag the lawn to pan'
              : 'Drag to explore · scroll to zoom · click anything for details'}
          </p>
        )}

        {!isEmpty && (
          <div className="mp-explorer__toolbar">
            <div
              className="mp-season"
              role="group"
              aria-label="Show the garden during a month"
            >
              <button
                type="button"
                className={`mp-season__btn mp-season__btn--all${seasonMonth == null ? ' mp-season__btn--active' : ''}`}
                aria-pressed={seasonMonth == null}
                onClick={() => setSeasonMonth(null)}
              >
                All season
              </button>
              {MONTH_LABELS_SHORT.map((label, month) => (
                <button
                  key={label}
                  type="button"
                  className={`mp-season__btn${seasonMonth === month ? ' mp-season__btn--active' : ''}`}
                  aria-pressed={seasonMonth === month}
                  aria-label={MONTH_LABELS_FULL[month]}
                  onClick={() => setSeasonMonth(month)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mp-sun" role="group" aria-label="Sun shadows">
              <span className="mp-sun__label" aria-hidden="true">
                Sun
              </span>
              {SUN_OPTIONS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className={`mp-sun__btn${sunTime === option.value ? ' mp-sun__btn--active' : ''}`}
                  aria-pressed={sunTime === option.value}
                  title={option.title}
                  aria-label={option.title}
                  onClick={() => setSunTime(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
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
            {editing && (
              <>
                <p className="mp-templates__or">or start from scratch</p>
                <button
                  type="button"
                  className="mp-panel__action mp-templates__editor-btn"
                  onClick={() => editing.onAddBed('rect')}
                  disabled={applyingTemplateId !== null}
                >
                  Add a raised bed
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {reviewOpen && (
        <GardenReviewPanel
          onSelectBed={(bedId) => {
            setReviewOpen(false);
            onSelect({ kind: 'bed', id: bedId });
          }}
          onClose={() => setReviewOpen(false)}
        />
      )}

      {!reviewOpen && (selectedBed || selectedAnnotation) && (
        <MasterplanDetailPanel
          key={selectedBed?.id ?? selectedAnnotation?.id}
          bed={selectedBed}
          annotation={selectedAnnotation}
          crops={selectedBedCrops}
          seasonMonth={seasonMonth}
          harvestCount={harvestCount}
          noonShadeConflict={noonShadeConflict}
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
          editing={
            editing
              ? {
                  isSaving: editing.isSaving,
                  isVertexEditing: editing.mode === 'editing-vertices',
                  onToggleVertexEditing: () =>
                    editing.onSetMode(
                      editing.mode === 'editing-vertices' ? 'idle' : 'editing-vertices'
                    ),
                  onPatchBed: (patch) => {
                    if (selectedBed) onPatchBed(selectedBed.id, patch);
                  },
                  onPatchAnnotation: (patch) => {
                    if (selectedAnnotation)
                      onPatchAnnotation(selectedAnnotation.id, patch);
                  },
                  onDuplicate: editing.onDuplicate,
                  onDelete: () => {
                    if (selectedBed) editing.onDeleteBed(selectedBed.id);
                    else if (selectedAnnotation)
                      editing.onDeleteAnnotation(selectedAnnotation.id);
                  },
                  onAddCrop: editing.onAddCrop,
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
