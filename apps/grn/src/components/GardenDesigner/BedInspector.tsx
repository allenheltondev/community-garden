import { useState } from 'react';
import type { BedType, GardenBed, GrowerCropItem, SunExposure } from '../../types/listing';
import { visualForCrop } from '../CropPlanner/cropVisuals';
import { CropIcon } from '../CropPlanner/cropIcons';
import { AddCropModal } from './AddCropModal';
import { InspectorShell } from './InspectorShell';
import {
  BED_COLOR_PALETTE,
  BED_TYPES,
  bedAreaSquareInches,
  bedTypeMeta,
  defaultRectPolygonPoints,
  ellipsePolygonPoints,
  formatArea,
  parseSoilField,
  serializeSoilField,
  SOIL_OPTIONS,
} from './bedDefaults';

interface BedInspectorProps {
  bed: GardenBed;
  cropsForBed: GrowerCropItem[];
  isEditable: boolean;
  isSaving: boolean;
  isMobile: boolean;
  isVertexEditing: boolean;
  onToggleVertexEditing: () => void;
  onChange: (patch: Partial<GardenBed>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const SUN_OPTIONS: Array<{ value: SunExposure; label: string }> = [
  { value: 'full_sun', label: 'Full sun' },
  { value: 'partial_sun', label: 'Partial sun' },
  { value: 'partial_shade', label: 'Partial shade' },
  { value: 'full_shade', label: 'Full shade' },
  { value: 'mixed', label: 'Mixed' },
];

/**
 * Right-side (or bottom-sheet on mobile) panel showing the selected bed's
 * details. All edits flow up through onChange so the parent can debounce
 * and persist them.
 */
export function BedInspector({
  bed,
  cropsForBed,
  isEditable,
  isSaving,
  isMobile,
  isVertexEditing,
  onToggleVertexEditing,
  onChange,
  onDuplicate,
  onDelete,
  onClose,
}: BedInspectorProps) {
  // The parent re-keys this component on bed.id, so initial state is the
  // right snapshot for the current selection without a syncing effect.
  // Length/width use a draft-on-focus pattern: while the user is typing,
  // the local draft wins; otherwise the input reads straight from the
  // bed prop, which means Transformer-driven resize updates are
  // reflected immediately in the field values.
  const [name, setName] = useState(bed.name);
  const [draftLength, setDraftLength] = useState<string | null>(null);
  const [draftWidth, setDraftWidth] = useState<string | null>(null);
  const [sun, setSun] = useState<SunExposure | ''>(bed.sunExposure ?? '');
  const [soils, setSoils] = useState<string[]>(parseSoilField(bed.soilType));
  const [notes, setNotes] = useState(bed.locationNotes ?? '');
  const [color, setColor] = useState<string | null>(bed.color);
  const [addCropOpen, setAddCropOpen] = useState(false);

  const lengthValue = draftLength !== null
    ? draftLength
    : bed.lengthInches !== null
      ? String(bed.lengthInches)
      : '';
  const widthValue = draftWidth !== null
    ? draftWidth
    : bed.widthInches !== null
      ? String(bed.widthInches)
      : '';

  function commitDimension(field: 'lengthInches' | 'widthInches', raw: string) {
    const trimmed = raw.trim();
    if (trimmed === '') return;
    const next = Number(trimmed);
    if (!Number.isFinite(next) || next < 0) return;
    if (bed[field] === next) return;
    commit({ [field]: next } as Partial<GardenBed>);
  }

  const meta = bedTypeMeta(bed.bedType);
  const areaSquareInches = bedAreaSquareInches({
    shape: bed.shape,
    lengthInches: bed.lengthInches,
    widthInches: bed.widthInches,
    points: bed.points,
  });

  function commit(patch: Partial<GardenBed>) {
    if (!isEditable) return;
    onChange(patch);
  }

  function convertToPolygon() {
    const length = bed.lengthInches ?? 96;
    const width = bed.widthInches ?? 48;
    const points =
      bed.shape === 'circle'
        ? ellipsePolygonPoints(length, width)
        : defaultRectPolygonPoints(length, width);
    commit({ shape: 'polygon', points });
    onToggleVertexEditing();
  }

  function toggleSoil(value: string) {
    const next = soils.includes(value)
      ? soils.filter((v) => v !== value)
      : [...soils, value];
    setSoils(next);
    commit({ soilType: serializeSoilField(next) });
  }

  return (
    <InspectorShell
      ariaLabel={`${bed.name} details`}
      isMobile={isMobile}
      onClose={onClose}
    >
      <header className="grn-designer-inspector__header">
        <div>
          <span className="grn-designer-inspector__eyebrow">{meta.emoji} {meta.label}</span>
          <h2 className="grn-designer-inspector__title">{name || 'Untitled bed'}</h2>
        </div>
        <button
          type="button"
          className="grn-designer-inspector__close"
          aria-label="Close inspector"
          onClick={onClose}
        >
          ✕
        </button>
      </header>

      <p className="grn-designer-inspector__description">
        {meta.description}
      </p>

      <div className="grn-designer-inspector__metric-row" aria-label="Bed metrics">
        <div className="grn-designer-inspector__metric">
          <span className="grn-designer-inspector__metric-label">Total area</span>
          <span className="grn-designer-inspector__metric-value">
            {formatArea(areaSquareInches)}
          </span>
        </div>
        <div className="grn-designer-inspector__metric">
          <span className="grn-designer-inspector__metric-label">Crops</span>
          <span className="grn-designer-inspector__metric-value">{cropsForBed.length}</span>
        </div>
      </div>

      <fieldset className="grn-designer-inspector__fieldset" disabled={!isEditable}>
        <legend>Details</legend>

        <label className="grn-designer-inspector__field">
          <span>Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && commit({ name: name.trim() })}
            maxLength={80}
          />
        </label>

        <label className="grn-designer-inspector__field">
          <span>Type</span>
          <select
            value={bed.bedType}
            onChange={(e) => commit({ bedType: e.target.value as BedType })}
          >
            {BED_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.emoji} {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grn-designer-inspector__row">
          <label className="grn-designer-inspector__field">
            <span>Length (in)</span>
            <input
              type="number"
              min={0}
              value={lengthValue}
              onFocus={() =>
                setDraftLength(bed.lengthInches !== null ? String(bed.lengthInches) : '')
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
                setDraftWidth(bed.widthInches !== null ? String(bed.widthInches) : '')
              }
              onChange={(e) => setDraftWidth(e.target.value)}
              onBlur={(e) => {
                commitDimension('widthInches', e.target.value);
                setDraftWidth(null);
              }}
            />
          </label>
        </div>

        <div className="grn-designer-inspector__field">
          <span>Shape</span>
          {bed.shape === 'polygon' ? (
            <button
              type="button"
              className={`grn-designer-inspector__shape-btn ${
                isVertexEditing ? 'is-active' : ''
              }`}
              onClick={onToggleVertexEditing}
              title="Drag, add, or remove the points of this bed's outline on the canvas"
            >
              {isVertexEditing ? '✓ Done editing points' : '⬡ Edit shape points'}
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

        <div className="grn-designer-inspector__field">
          <span>Stacking</span>
          <div
            className="grn-designer-inspector__arrange"
            role="group"
            aria-label="Stacking order"
          >
            <button
              type="button"
              className="grn-designer-inspector__arrange-btn"
              onClick={() => commit({ sortOrder: bed.sortOrder - 1 })}
              title="Draw this bed beneath overlapping elements"
            >
              ↓ Send backward
            </button>
            <button
              type="button"
              className="grn-designer-inspector__arrange-btn"
              onClick={() => commit({ sortOrder: bed.sortOrder + 1 })}
              title="Draw this bed above overlapping elements"
            >
              ↑ Bring forward
            </button>
          </div>
        </div>

        <label className="grn-designer-inspector__field">
          <span>Sun exposure</span>
          <select
            value={sun}
            onChange={(e) => {
              const value = e.target.value as SunExposure | '';
              setSun(value);
              commit({ sunExposure: value === '' ? null : value });
            }}
          >
            <option value="">—</option>
            {SUN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <fieldset className="grn-designer-inspector__soil">
          <legend>Soil</legend>
          <div className="grn-designer-inspector__soil-grid" role="group" aria-label="Soil types">
            {SOIL_OPTIONS.map((option) => {
              const selected = soils.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`grn-designer-inspector__soil-chip ${selected ? 'is-selected' : ''}`}
                  onClick={() => toggleSoil(option.value)}
                  aria-pressed={selected}
                  disabled={!isEditable}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="grn-designer-inspector__field">
          <span>Location notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => commit({ locationNotes: notes.trim() || null })}
            rows={2}
            placeholder="e.g. south fence line"
          />
        </label>

        <fieldset className="grn-designer-inspector__color">
          <legend>Color</legend>
          <div className="grn-designer-inspector__color-row" role="radiogroup" aria-label="Bed color">
            <button
              type="button"
              className={`grn-designer-inspector__color-swatch ${color === null ? 'is-selected' : ''}`}
              onClick={() => {
                setColor(null);
                commit({ color: null });
              }}
              aria-label="Default color"
              aria-pressed={color === null}
              style={{ background: 'transparent', borderStyle: 'dashed' }}
            />
            {BED_COLOR_PALETTE.map((preset) => (
              <button
                type="button"
                key={preset.value}
                className={`grn-designer-inspector__color-swatch ${color === preset.value ? 'is-selected' : ''}`}
                onClick={() => {
                  setColor(preset.value);
                  commit({ color: preset.value });
                }}
                aria-label={preset.label}
                aria-pressed={color === preset.value}
                style={{ background: preset.value }}
                title={preset.label}
              />
            ))}
          </div>
        </fieldset>
      </fieldset>

      <section className="grn-designer-inspector__crops" aria-label="Crops in this bed">
        <header className="grn-designer-inspector__crops-header">
          <h3>Crops</h3>
          <button
            type="button"
            className="grn-designer-inspector__add-crop"
            onClick={() => setAddCropOpen(true)}
            disabled={!isEditable}
          >
            + Add crop
          </button>
        </header>
        {cropsForBed.length === 0 ? (
          <p className="grn-designer-inspector__empty">
            No crops planted here yet.
          </p>
        ) : (
          <ul className="grn-designer-inspector__crop-list">
            {cropsForBed.map((crop) => {
              const visual = visualForCrop(crop.cropName);
              return (
                <li key={crop.id} className="grn-designer-inspector__crop">
                  <span className="grn-designer-inspector__crop-emoji" aria-hidden="true">
                    <CropIcon iconKey={visual.iconKey} color={visual.accent} size="1.1rem" />
                  </span>
                  <span className="grn-designer-inspector__crop-name">{crop.cropName}</span>
                  {crop.plantCount && (
                    <span className="grn-designer-inspector__crop-count">×{crop.plantCount}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="grn-designer-inspector__footer">
        <span
          className="grn-designer-inspector__save-status"
          aria-live="polite"
          data-saving={isSaving}
        >
          {isSaving ? 'Saving…' : 'Saved'}
        </span>
        <div className="grn-designer-inspector__footer-actions">
          <button
            type="button"
            className="grn-designer-inspector__duplicate"
            onClick={onDuplicate}
            disabled={!isEditable}
            title="Duplicate bed (Ctrl+D)"
          >
            Duplicate
          </button>
          <button
            type="button"
            className="grn-designer-inspector__delete"
            onClick={onDelete}
            disabled={!isEditable}
            title="Delete bed (Del or Backspace)"
          >
            Delete bed
          </button>
        </div>
      </footer>
      <AddCropModal bed={bed} open={addCropOpen} onClose={() => setAddCropOpen(false)} />
    </InspectorShell>
  );
}
