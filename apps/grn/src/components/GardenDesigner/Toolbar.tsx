import type { ChangeEvent } from 'react';
import type { BedType } from '../../types/listing';
import { defaultsFor } from './bedDefaults';

export type DesignerMode = 'idle' | 'drawing-polygon';
export type GridSnap = 'off' | '6' | '12';

interface ToolbarProps {
  isMobile: boolean;
  editUnlocked: boolean;
  onToggleEditUnlocked: () => void;
  mode: DesignerMode;
  onAddBed: (type: BedType) => void;
  onStartDrawingPolygon: () => void;
  onCancelDrawingPolygon: () => void;
  gridSnap: GridSnap;
  onGridSnapChange: (snap: GridSnap) => void;
  onPickBackgroundFile: (file: File) => void;
  onClearBackground: () => void;
  hasBackground: boolean;
  backgroundOpacity: number;
  onBackgroundOpacityChange: (opacity: number) => void;
  onFitToScreen: () => void;
  isSaving: boolean;
}

const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function Toolbar({
  isMobile,
  editUnlocked,
  onToggleEditUnlocked,
  mode,
  onAddBed,
  onStartDrawingPolygon,
  onCancelDrawingPolygon,
  gridSnap,
  onGridSnapChange,
  onPickBackgroundFile,
  onClearBackground,
  hasBackground,
  backgroundOpacity,
  onBackgroundOpacityChange,
  onFitToScreen,
  isSaving,
}: ToolbarProps) {
  const editingBlocked = isMobile && !editUnlocked;
  const drawing = mode === 'drawing-polygon';

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) return;
    onPickBackgroundFile(file);
    event.target.value = '';
  }

  return (
    <div
      className={`grn-designer-toolbar ${editingBlocked ? 'is-locked' : ''}`}
      role="toolbar"
      aria-label="Garden designer tools"
    >
      <div className="grn-designer-toolbar__group" role="group" aria-label="Add a bed">
        {(['raised', 'mound', 'in_ground'] as BedType[]).map((type) => (
          <button
            key={type}
            type="button"
            className="grn-designer-toolbar__btn"
            onClick={() => onAddBed(type)}
            disabled={editingBlocked || drawing}
            title={defaultsFor(type).label}
          >
            <span className="grn-designer-toolbar__btn-emoji" aria-hidden="true">
              {defaultsFor(type).emoji}
            </span>
            <span>{defaultsFor(type).label}</span>
          </button>
        ))}
        <button
          type="button"
          className={`grn-designer-toolbar__btn ${drawing ? 'is-active' : ''}`}
          onClick={drawing ? onCancelDrawingPolygon : onStartDrawingPolygon}
          disabled={editingBlocked}
          title={drawing ? 'Click to add points, double-click to close. Esc to cancel.' : 'Draw a custom in-ground bed shape'}
        >
          <span className="grn-designer-toolbar__btn-emoji" aria-hidden="true">✏️</span>
          <span>{drawing ? 'Drawing… (esc)' : 'Draw shape'}</span>
        </button>
      </div>

      <div className="grn-designer-toolbar__group" role="group" aria-label="Snap and fit">
        <label className="grn-designer-toolbar__field">
          <span>Snap</span>
          <select
            value={gridSnap}
            onChange={(e) => onGridSnapChange(e.target.value as GridSnap)}
            disabled={editingBlocked}
          >
            <option value="off">Off</option>
            <option value="6">6 in</option>
            <option value="12">1 ft</option>
          </select>
        </label>
        <button
          type="button"
          className="grn-designer-toolbar__btn grn-designer-toolbar__btn--ghost"
          onClick={onFitToScreen}
          title="Fit canvas to viewport"
        >
          Fit
        </button>
      </div>

      <div className="grn-designer-toolbar__group" role="group" aria-label="Background">
        <label className="grn-designer-toolbar__btn grn-designer-toolbar__btn--ghost">
          <span className="grn-designer-toolbar__btn-emoji" aria-hidden="true">🛰️</span>
          <span>{hasBackground ? 'Replace photo' : 'Add photo'}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFile}
            disabled={editingBlocked}
            hidden
          />
        </label>
        {hasBackground && (
          <>
            <label className="grn-designer-toolbar__field">
              <span>Opacity</span>
              <input
                type="range"
                min={0}
                max={100}
                value={backgroundOpacity}
                onChange={(e) => onBackgroundOpacityChange(Number(e.target.value))}
                disabled={editingBlocked}
              />
            </label>
            <button
              type="button"
              className="grn-designer-toolbar__btn grn-designer-toolbar__btn--ghost"
              onClick={onClearBackground}
              disabled={editingBlocked}
            >
              Remove photo
            </button>
          </>
        )}
      </div>

      <div className="grn-designer-toolbar__group grn-designer-toolbar__group--end">
        {isMobile && (
          <button
            type="button"
            className={`grn-designer-toolbar__btn ${editUnlocked ? 'is-active' : ''}`}
            onClick={onToggleEditUnlocked}
            title={editUnlocked ? 'Lock layout (read-only mode)' : 'Unlock to edit'}
          >
            <span className="grn-designer-toolbar__btn-emoji" aria-hidden="true">
              {editUnlocked ? '🔓' : '🔒'}
            </span>
            <span>{editUnlocked ? 'Editing' : 'Locked'}</span>
          </button>
        )}
        <span
          className="grn-designer-toolbar__save-status"
          aria-live="polite"
          data-saving={isSaving}
        >
          {isSaving ? 'Saving…' : 'Saved'}
        </span>
      </div>
    </div>
  );
}
