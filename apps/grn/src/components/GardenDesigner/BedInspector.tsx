import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { GardenBed, GrowerCropItem, SunExposure } from '../../types/listing';
import { visualForCrop } from '../CropPlanner/cropVisuals';
import { BED_COLOR_PALETTE, BED_TYPE_DESCRIPTIONS, defaultsFor } from './bedDefaults';

interface BedInspectorProps {
  bed: GardenBed;
  cropsForBed: GrowerCropItem[];
  isEditable: boolean;
  isSaving: boolean;
  onChange: (patch: Partial<GardenBed>) => void;
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
  onChange,
  onDelete,
  onClose,
}: BedInspectorProps) {
  // The parent re-keys this component on bed.id, so initial state is the
  // right snapshot for the current selection without a syncing effect.
  const [name, setName] = useState(bed.name);
  const [length, setLength] = useState<number | ''>(bed.lengthInches ?? '');
  const [width, setWidth] = useState<number | ''>(bed.widthInches ?? '');
  const [sun, setSun] = useState<SunExposure | ''>(bed.sunExposure ?? '');
  const [soil, setSoil] = useState(bed.soilType ?? '');
  const [notes, setNotes] = useState(bed.locationNotes ?? '');
  const [color, setColor] = useState<string | null>(bed.color);

  const defaults = defaultsFor(bed.bedType);

  function commit(patch: Partial<GardenBed>) {
    if (!isEditable) return;
    onChange(patch);
  }

  return (
    <aside className="grn-designer-inspector" aria-label={`${bed.name} details`}>
      <header className="grn-designer-inspector__header">
        <div>
          <span className="grn-designer-inspector__eyebrow">{defaults.emoji} {defaults.label}</span>
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
        {BED_TYPE_DESCRIPTIONS[bed.bedType]}
      </p>

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

        {bed.shape !== 'circle' && (
          <div className="grn-designer-inspector__row">
            <label className="grn-designer-inspector__field">
              <span>Length (in)</span>
              <input
                type="number"
                min={0}
                value={length}
                onChange={(e) => setLength(e.target.value === '' ? '' : Number(e.target.value))}
                onBlur={() =>
                  typeof length === 'number' &&
                  length >= 0 &&
                  commit({ lengthInches: length })
                }
              />
            </label>
            <label className="grn-designer-inspector__field">
              <span>Width (in)</span>
              <input
                type="number"
                min={0}
                value={width}
                onChange={(e) => setWidth(e.target.value === '' ? '' : Number(e.target.value))}
                onBlur={() =>
                  typeof width === 'number' &&
                  width >= 0 &&
                  commit({ widthInches: width })
                }
              />
            </label>
          </div>
        )}

        {bed.shape === 'circle' && (
          <label className="grn-designer-inspector__field">
            <span>Diameter (in)</span>
            <input
              type="number"
              min={0}
              value={length}
              onChange={(e) => setLength(e.target.value === '' ? '' : Number(e.target.value))}
              onBlur={() => {
                if (typeof length === 'number' && length >= 0) {
                  commit({ lengthInches: length, widthInches: length });
                }
              }}
            />
          </label>
        )}

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

        <label className="grn-designer-inspector__field">
          <span>Soil</span>
          <input
            type="text"
            value={soil}
            onChange={(e) => setSoil(e.target.value)}
            onBlur={() => commit({ soilType: soil.trim() || null })}
            placeholder="e.g. sandy_loam"
          />
        </label>

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
          <Link to={`/crops/new?bedId=${bed.id}`} className="grn-designer-inspector__add-crop">
            + Add crop
          </Link>
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
                    {visual.emoji}
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
        <button
          type="button"
          className="grn-designer-inspector__delete"
          onClick={onDelete}
          disabled={!isEditable}
        >
          Delete bed
        </button>
      </footer>
    </aside>
  );
}
