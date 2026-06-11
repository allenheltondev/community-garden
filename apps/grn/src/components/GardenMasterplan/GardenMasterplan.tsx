import { useMemo, useState } from 'react';
import type {
  GardenAnnotation,
  GardenBed,
  GardenCanvas,
  GrowerCropItem,
} from '../../types/listing';
import type { SelectedItem } from '../../hooks/useGardenDesigner';
import { sceneMetrics } from './footprints';
import { IsoScene } from './IsoScene';
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
            cropsByBedId={visibleCropsByBedId}
            selected={selected}
            onSelect={onSelect}
            shouldIgnoreClick={shouldIgnoreClick}
            seasonMonth={seasonMonth}
            sunTime={sunTime}
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
          onOpenLayoutEditor={onOpenLayoutEditor}
        />
      )}
    </div>
  );
}
