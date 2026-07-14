import { useState } from 'react';
import type {
  BedType,
  GardenAnnotation,
  GardenBed,
  GrowerCropItem,
  SunExposure,
} from '../../types/listing';
import {
  BED_COLOR_PALETTE,
  BED_TYPES,
  SOIL_OPTIONS,
  bedAreaSquareInches,
  bedTypeMeta,
  defaultRectPolygonPoints,
  ellipsePolygonPoints,
  formatArea,
  parseSoilField,
  serializeSoilField,
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

const SUN_OPTIONS: Array<{ value: SunExposure; label: string }> = [
  { value: 'full_sun', label: 'Full sun' },
  { value: 'partial_sun', label: 'Partial sun' },
  { value: 'partial_shade', label: 'Partial shade' },
  { value: 'full_shade', label: 'Full shade' },
  { value: 'mixed', label: 'Mixed' },
];

function formatFeet(inches: number | null): string {
  if (!inches) return '—';
  const feet = inches / 12;
  return feet >= 1 ? `${Math.round(feet * 10) / 10} ft` : `${Math.round(inches)} in`;
}

/**
 * Editing actions for the detail panel. Present whenever the masterplan is
 * an editable surface — the same object the scene uses for direct
 * manipulation, so typed edits and handle drags stay in sync.
 */
export interface MasterplanPanelEditing {
  isSaving: boolean;
  isVertexEditing: boolean;
  onToggleVertexEditing: () => void;
  onPatchBed: (patch: Partial<GardenBed>) => void;
  onPatchAnnotation: (patch: Partial<GardenAnnotation>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddCrop: (input: QuickAddCropInput) => Promise<void>;
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
  editing?: MasterplanPanelEditing;
}

/**
 * Floating inspector shown over the masterplan when an element is selected.
 * This is the garden's single fine-tuning surface: it reads what the
 * element is and what's growing there, and — when editing — carries the
 * full precise controls (name, exact size, rotation, custom-shape points,
 * type, sun, soil, color, stacking) that used to live in the separate
 * layout editor. The map stays visible and navigable behind it.
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
  editing,
}: MasterplanDetailPanelProps) {
  // The parent re-keys this panel on the selected element's id, so initial
  // state is the right snapshot without a syncing effect. Length/width/
  // rotation use draft-on-focus: while the field is focused the local draft
  // wins; otherwise the input reads straight from the element, so
  // handle-driven resizes show up live in the numbers.
  const [name, setName] = useState(bed?.name ?? annotation?.label ?? '');
  const [icon, setIcon] = useState(annotation?.icon ?? '');
  const [notes, setNotes] = useState(bed?.locationNotes ?? '');
  const [draftLength, setDraftLength] = useState<string | null>(null);
  const [draftWidth, setDraftWidth] = useState<string | null>(null);
  const [draftRotation, setDraftRotation] = useState<string | null>(null);
  const [soils, setSoils] = useState<string[]>(parseSoilField(bed?.soilType));

  if (!bed && !annotation) return null;

  const el = bed ?? annotation!;
  const isCircle = (bed?.shape ?? annotation?.shape) === 'circle';
  const isPolygonBed = bed?.shape === 'polygon';

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

  const readSoils = bed ? parseSoilField(bed.soilType) : [];
  const capacity = bed ? bedCapacitySummary(bed, crops) : null;

  const lengthValue =
    draftLength !== null
      ? draftLength
      : el.lengthInches !== null
        ? String(el.lengthInches)
        : '';
  const widthValue =
    draftWidth !== null
      ? draftWidth
      : el.widthInches !== null
        ? String(el.widthInches)
        : '';
  const rotationValue =
    draftRotation !== null ? draftRotation : String(Math.round(el.rotationDeg));

  function patch(next: Partial<GardenBed> & Partial<GardenAnnotation>) {
    if (!editing) return;
    if (bed) editing.onPatchBed(next);
    else if (annotation) editing.onPatchAnnotation(next);
  }

  function commitDimension(field: 'lengthInches' | 'widthInches', raw: string) {
    const trimmed = raw.trim();
    if (trimmed === '') return;
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value < 0) return;
    if (isCircle) {
      // Circles stay round: a single diameter drives both axes.
      patch({ lengthInches: value, widthInches: value });
    } else {
      patch({ [field]: value });
    }
  }

  function commitRotation(raw: string) {
    const value = Number(raw.trim());
    if (!Number.isFinite(value)) return;
    const normalized = ((Math.round(value) % 360) + 360) % 360;
    patch({ rotationDeg: normalized });
  }

  function convertToPolygon() {
    if (!bed || !editing) return;
    const length = bed.lengthInches ?? 96;
    const width = bed.widthInches ?? 48;
    const points =
      bed.shape === 'circle'
        ? ellipsePolygonPoints(length, width)
        : defaultRectPolygonPoints(length, width);
    editing.onPatchBed({ shape: 'polygon', points });
    editing.onToggleVertexEditing();
  }

  function toggleSoil(value: string) {
    const next = soils.includes(value)
      ? soils.filter((v) => v !== value)
      : [...soils, value];
    setSoils(next);
    patch({ soilType: serializeSoilField(next) });
  }

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
          <h2 className="mp-panel__title">{title || 'Untitled'}</h2>
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

        {editing ? (
          <fieldset className="grn-designer-inspector__fieldset mp-panel__edit">
            <legend>Fine-tune</legend>

            <label className="grn-designer-inspector__field">
              <span>{bed ? 'Name' : 'Label'}</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() =>
                  name.trim() && patch(bed ? { name: name.trim() } : { label: name.trim() })
                }
                maxLength={80}
              />
            </label>

            {bed && (
              <label className="grn-designer-inspector__field">
                <span>Type</span>
                <select
                  value={bed.bedType}
                  onChange={(e) => patch({ bedType: e.target.value as BedType })}
                >
                  {BED_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.emoji} {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {annotation && (
              <label className="grn-designer-inspector__field">
                <span>Icon</span>
                <input
                  type="text"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  onBlur={() => patch({ icon: icon.trim() || null })}
                  maxLength={32}
                  placeholder="e.g. 🌳, 💧, 🏚️"
                />
              </label>
            )}

            {annotation?.shape === 'line' ? null : isCircle ? (
              <label className="grn-designer-inspector__field">
                <span>Diameter (in)</span>
                <input
                  type="number"
                  min={0}
                  value={lengthValue}
                  onFocus={() =>
                    setDraftLength(el.lengthInches !== null ? String(el.lengthInches) : '')
                  }
                  onChange={(e) => setDraftLength(e.target.value)}
                  onBlur={(e) => {
                    commitDimension('lengthInches', e.target.value);
                    setDraftLength(null);
                  }}
                />
              </label>
            ) : (
              <div className="grn-designer-inspector__row">
                <label className="grn-designer-inspector__field">
                  <span>Length (in)</span>
                  <input
                    type="number"
                    min={0}
                    value={lengthValue}
                    onFocus={() =>
                      setDraftLength(el.lengthInches !== null ? String(el.lengthInches) : '')
                    }
                    onChange={(e) => setDraftLength(e.target.value)}
                    onBlur={(e) => {
                      commitDimension('lengthInches', e.target.value);
                      setDraftLength(null);
                    }}
                  />
                </label>
                <label className="grn-designer-inspector__field">
                  <span>Width (in)</span>
                  <input
                    type="number"
                    min={0}
                    value={widthValue}
                    onFocus={() =>
                      setDraftWidth(el.widthInches !== null ? String(el.widthInches) : '')
                    }
                    onChange={(e) => setDraftWidth(e.target.value)}
                    onBlur={(e) => {
                      commitDimension('widthInches', e.target.value);
                      setDraftWidth(null);
                    }}
                  />
                </label>
              </div>
            )}

            <label className="grn-designer-inspector__field">
              <span>Rotation (°)</span>
              <input
                type="number"
                value={rotationValue}
                onFocus={() => setDraftRotation(String(Math.round(el.rotationDeg)))}
                onChange={(e) => setDraftRotation(e.target.value)}
                onBlur={(e) => {
                  commitRotation(e.target.value);
                  setDraftRotation(null);
                }}
              />
            </label>

            {bed && (
              <div className="grn-designer-inspector__field">
                <span>Shape</span>
                {isPolygonBed ? (
                  <button
                    type="button"
                    className={`grn-designer-inspector__shape-btn ${
                      editing.isVertexEditing ? 'is-active' : ''
                    }`}
                    onClick={editing.onToggleVertexEditing}
                    title="Drag, add, or remove the points of this bed's outline on the map"
                  >
                    {editing.isVertexEditing
                      ? '✓ Done editing points'
                      : '⬡ Edit shape points'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="grn-designer-inspector__shape-btn"
                    onClick={convertToPolygon}
                    title="Turn this bed into a custom outline with movable points"
                  >
                    ⬡ Convert to custom shape
                  </button>
                )}
              </div>
            )}

            {bed && (
              <label className="grn-designer-inspector__field">
                <span>Sun exposure</span>
                <select
                  value={bed.sunExposure ?? ''}
                  onChange={(e) => {
                    const value = e.target.value as SunExposure | '';
                    patch({ sunExposure: value === '' ? null : value });
                  }}
                >
                  <option value="">—</option>
                  {SUN_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {bed && (
              <fieldset className="grn-designer-inspector__soil">
                <legend>Soil</legend>
                <div
                  className="grn-designer-inspector__soil-grid"
                  role="group"
                  aria-label="Soil types"
                >
                  {SOIL_OPTIONS.map((option) => {
                    const selected = soils.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`grn-designer-inspector__soil-chip ${
                          selected ? 'is-selected' : ''
                        }`}
                        onClick={() => toggleSoil(option.value)}
                        aria-pressed={selected}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <fieldset className="grn-designer-inspector__color">
              <legend>Color</legend>
              <div
                className="grn-designer-inspector__color-row"
                role="radiogroup"
                aria-label="Element color"
              >
                <button
                  type="button"
                  className={`grn-designer-inspector__color-swatch ${
                    el.color === null ? 'is-selected' : ''
                  }`}
                  onClick={() => patch({ color: null })}
                  aria-label="Default color"
                  aria-pressed={el.color === null}
                  style={{ background: 'transparent', borderStyle: 'dashed' }}
                />
                {BED_COLOR_PALETTE.map((preset) => (
                  <button
                    type="button"
                    key={preset.value}
                    className={`grn-designer-inspector__color-swatch ${
                      el.color === preset.value ? 'is-selected' : ''
                    }`}
                    onClick={() => patch({ color: preset.value })}
                    aria-label={preset.label}
                    aria-pressed={el.color === preset.value}
                    style={{ background: preset.value }}
                    title={preset.label}
                  />
                ))}
              </div>
            </fieldset>

            {bed && (
              <label className="grn-designer-inspector__field">
                <span>Location notes</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => patch({ locationNotes: notes.trim() || null })}
                  rows={2}
                  placeholder="e.g. south fence line"
                />
              </label>
            )}
          </fieldset>
        ) : (
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
            {readSoils.length > 0 && (
              <div className="mp-panel__meta-row">
                <dt>Soil</dt>
                <dd>
                  <span className="mp-panel__chips">
                    {readSoils.map((soil) => (
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
        )}

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

        {bed?.locationNotes && !editing && (
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
          <>
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
            <span
              className="mp-panel__save-status"
              aria-live="polite"
              data-saving={editing.isSaving}
            >
              {editing.isSaving ? 'Saving…' : 'Saved'}
            </span>
          </>
        )}
      </footer>
    </aside>
  );
}
