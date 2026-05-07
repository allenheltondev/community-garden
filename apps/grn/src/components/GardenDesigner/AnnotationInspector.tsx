import { useState } from 'react';
import type { GardenAnnotation } from '../../types/listing';
import { BED_COLOR_PALETTE } from './bedDefaults';

interface AnnotationInspectorProps {
  annotation: GardenAnnotation;
  isEditable: boolean;
  isSaving: boolean;
  onChange: (patch: Partial<GardenAnnotation>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function AnnotationInspector({
  annotation,
  isEditable,
  isSaving,
  onChange,
  onDelete,
  onClose,
}: AnnotationInspectorProps) {
  // Parent re-keys on annotation.id, so initial state matches the current
  // selection without a syncing effect.
  const [label, setLabel] = useState(annotation.label);
  const [icon, setIcon] = useState(annotation.icon ?? '');
  const [length, setLength] = useState<number | ''>(annotation.lengthInches ?? '');
  const [width, setWidth] = useState<number | ''>(annotation.widthInches ?? '');
  const [color, setColor] = useState<string | null>(annotation.color);

  function commit(patch: Partial<GardenAnnotation>) {
    if (!isEditable) return;
    onChange(patch);
  }

  return (
    <aside className="grn-designer-inspector" aria-label={`${annotation.label} details`}>
      <header className="grn-designer-inspector__header">
        <div>
          <span className="grn-designer-inspector__eyebrow">
            {icon || '📍'} Annotation · {annotation.shape}
          </span>
          <h2 className="grn-designer-inspector__title">{label || 'Untitled'}</h2>
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
        Annotations are visual context only — they aren’t beds, so they don’t
        carry soil or crop data.
      </p>

      <fieldset className="grn-designer-inspector__fieldset" disabled={!isEditable}>
        <legend>Details</legend>

        <label className="grn-designer-inspector__field">
          <span>Label</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => label.trim() && commit({ label: label.trim() })}
            maxLength={80}
          />
        </label>

        <label className="grn-designer-inspector__field">
          <span>Icon</span>
          <input
            type="text"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            onBlur={() => commit({ icon: icon.trim() || null })}
            maxLength={32}
            placeholder="e.g. 🌳, 💧, 🏚️"
          />
        </label>

        {annotation.shape !== 'circle' && annotation.shape !== 'line' && (
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

        {annotation.shape === 'circle' && (
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

        <fieldset className="grn-designer-inspector__color">
          <legend>Color</legend>
          <div className="grn-designer-inspector__color-row" role="radiogroup" aria-label="Annotation color">
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
          title="Delete annotation (Del or Backspace)"
        >
          Delete
        </button>
      </footer>
    </aside>
  );
}
