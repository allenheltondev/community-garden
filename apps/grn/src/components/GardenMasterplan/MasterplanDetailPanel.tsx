import type {
  GardenAnnotation,
  GardenBed,
  GrowerCropItem,
  SunExposure,
} from '../../types/listing';
import {
  bedAreaSquareInches,
  bedTypeMeta,
  formatArea,
  parseSoilField,
  soilLabel,
} from '../GardenDesigner/bedDefaults';
import { bedCapacitySummary, capacityLabel } from '../GardenDesigner/capacity';
import { CROP_ICON_PATHS } from '../CropPlanner/cropIconPaths';
import { visualForCrop } from '../CropPlanner/cropVisuals';
import { QuickAddCrop, type QuickAddCropInput } from '../GardenDesigner/QuickAddCrop';
import { KIND_LABELS, annotationKind, mute } from './palette';
import { MONTH_LABELS_FULL, type SeasonMonth } from './season';

const SUN_LABELS: Record<SunExposure, string> = {
  full_sun: 'Full sun',
  partial_sun: 'Partial sun',
  partial_shade: 'Partial shade',
  full_shade: 'Full shade',
  mixed: 'Mixed',
};

function formatFeet(inches: number | null): string {
  if (!inches) return '—';
  const feet = inches / 12;
  return feet >= 1 ? `${Math.round(feet * 10) / 10} ft` : `${Math.round(inches)} in`;
}

interface MasterplanDetailPanelProps {
  bed?: GardenBed;
  annotation?: GardenAnnotation;
  crops: GrowerCropItem[];
  /** Scrubbed month (0–11) or null for "All season". */
  seasonMonth?: SeasonMonth;
  /** Crops in this bed whose expected harvest month is the scrubbed month. */
  harvestCount?: number;
  /** True when a full-sun bed sits mostly in other elements' noon shadows. */
  noonShadeConflict?: boolean;
  onArrange: (direction: 'forward' | 'backward') => void;
  onClose: () => void;
  onOpenLayoutEditor: () => void;
  /** Quick edit actions, present only when the plan is an editable surface. */
  editing?: {
    onDuplicate: () => void;
    onDelete: () => void;
    onAddCrop: (input: QuickAddCropInput) => Promise<void>;
  };
}

/**
 * Floating detail card shown over the masterplan when an element is
 * selected. Read-focused: it surfaces what the element is and what's
 * growing there, plus a jump into the layout editor for changes. The map
 * stays visible and navigable behind it.
 */
export function MasterplanDetailPanel({
  bed,
  annotation,
  crops,
  seasonMonth = null,
  harvestCount = 0,
  noonShadeConflict = false,
  onArrange,
  onClose,
  onOpenLayoutEditor,
  editing,
}: MasterplanDetailPanelProps) {
  if (!bed && !annotation) return null;

  const title = bed ? bed.name : annotation?.label ?? '';
  const kicker = bed
    ? `${bedTypeMeta(bed.bedType).label} · ${formatArea(
        bedAreaSquareInches({
          shape: bed.shape,
          lengthInches: bed.lengthInches,
          widthInches: bed.widthInches,
          points: bed.points,
        })
      )}`
    : annotation
      ? KIND_LABELS[annotationKind(annotation)]
      : '';

  const soils = bed ? parseSoilField(bed.soilType) : [];
  const capacity = bed ? bedCapacitySummary(bed, crops) : null;

  return (
    <aside
      className="mp-panel"
      role="dialog"
      aria-label={`${title} details`}
      data-testid="masterplan-detail-panel"
    >
      <header className="mp-panel__header">
        <div>
          <p className="mp-panel__kicker">{kicker}</p>
          <h2 className="mp-panel__title">{title}</h2>
        </div>
        <button
          type="button"
          className="mp-panel__close"
          onClick={onClose}
          aria-label="Close details"
        >
          ×
        </button>
      </header>

      <div className="mp-panel__body">
        {bed?.description && <p className="mp-panel__description">{bed.description}</p>}

        {bed && noonShadeConflict && (
          <p className="mp-panel__warning" role="note">
            <span className="mp-panel__warning-icon" aria-hidden="true">
              ⚠
            </span>
            Labeled full sun, but sits mostly in shade at midday.
          </p>
        )}

        <dl className="mp-panel__meta">
          {bed && (
            <div className="mp-panel__meta-row">
              <dt>Size</dt>
              <dd>
                {formatFeet(bed.lengthInches)} × {formatFeet(bed.widthInches)}
              </dd>
            </div>
          )}
          {bed?.sunExposure && (
            <div className="mp-panel__meta-row">
              <dt>Sun</dt>
              <dd>{SUN_LABELS[bed.sunExposure]}</dd>
            </div>
          )}
          {soils.length > 0 && (
            <div className="mp-panel__meta-row">
              <dt>Soil</dt>
              <dd>
                <span className="mp-panel__chips">
                  {soils.map((soil) => (
                    <span key={soil} className="mp-panel__chip">
                      {soilLabel(soil)}
                    </span>
                  ))}
                </span>
              </dd>
            </div>
          )}
          {annotation && (
            <div className="mp-panel__meta-row">
              <dt>Size</dt>
              <dd>
                {formatFeet(annotation.lengthInches)} × {formatFeet(annotation.widthInches)}
              </dd>
            </div>
          )}
        </dl>

        {bed && (
          <section className="mp-panel__crops" aria-label="Crops in this bed">
            <h3 className="mp-panel__section-title">
              {crops.length > 0
                ? `Growing here (${crops.length})`
                : 'Nothing planted yet'}
            </h3>
            {capacity?.utilization != null && (
              <p
                className={`mp-panel__capacity ${
                  capacity.utilization > 1 ? 'is-over' : ''
                }`}
              >
                Using ~{Math.round(capacity.utilization * 100)}% of this bed ·{' '}
                {capacityLabel(capacity)}
              </p>
            )}
            {seasonMonth != null && harvestCount > 0 && (
              <p className="mp-panel__harvest">
                {harvestCount} crop{harvestCount === 1 ? '' : 's'} ready to harvest in{' '}
                {MONTH_LABELS_FULL[seasonMonth]}
              </p>
            )}
            {crops.length > 0 && (
              <ul className="mp-panel__crop-list">
                {crops.map((crop) => {
                  const visual = visualForCrop(crop.cropName);
                  return (
                    <li key={crop.id} className="mp-panel__crop">
                      <svg
                        className="mp-panel__crop-icon"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          d={CROP_ICON_PATHS[visual.iconKey]}
                          fill={mute(visual.accent, 0.15)}
                        />
                      </svg>
                      <span className="mp-panel__crop-name">
                        {crop.nickname || crop.cropName}
                      </span>
                      {crop.plantCount != null && crop.plantCount > 0 && (
                        <span className="mp-panel__crop-count">×{crop.plantCount}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {editing && <QuickAddCrop onAdd={editing.onAddCrop} />}
          </section>
        )}

        {bed?.locationNotes && (
          <p className="mp-panel__notes">{bed.locationNotes}</p>
        )}
      </div>

      <footer className="mp-panel__footer">
        <div className="mp-panel__arrange" role="group" aria-label="Stacking order">
          <button
            type="button"
            className="mp-panel__arrange-btn"
            onClick={() => onArrange('backward')}
            title="Draw this element behind overlapping neighbors"
          >
            ↓ Send backward
          </button>
          <button
            type="button"
            className="mp-panel__arrange-btn"
            onClick={() => onArrange('forward')}
            title="Draw this element in front of overlapping neighbors"
          >
            ↑ Bring forward
          </button>
        </div>
        {editing && (
          <div className="mp-panel__quick" role="group" aria-label="Quick actions">
            <button
              type="button"
              className="mp-panel__quick-btn"
              onClick={editing.onDuplicate}
              title="Duplicate this element (Ctrl+D)"
            >
              ⧉ Duplicate
            </button>
            <button
              type="button"
              className="mp-panel__quick-btn mp-panel__quick-btn--danger"
              onClick={editing.onDelete}
              title="Delete this element"
            >
              🗑 Delete
            </button>
          </div>
        )}
        <button type="button" className="mp-panel__action" onClick={onOpenLayoutEditor}>
          {editing ? 'Resize & fine-tune →' : 'Edit in layout editor'}
        </button>
      </footer>
    </aside>
  );
}
