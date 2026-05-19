import { useMemo } from 'react';
import type { CatalogCrop } from '../../types/listing';
import type { CropPickerSelection } from '../CropPlanner/CropPicker';
import { visualForCrop } from '../CropPlanner/cropVisuals';
import { CropIcon } from '../CropPlanner/cropIcons';
import type { ScarceCropEntry } from '../../hooks/useGrowerCropSignals';

interface NeededNearbyStripProps {
  topScarce: ScarceCropEntry[];
  catalog: CatalogCrop[];
  isLoading: boolean;
  onSelect: (selection: CropPickerSelection) => void;
  selectedCatalogCropId?: string | null;
}

interface ResolvedScarceCrop extends ScarceCropEntry {
  crop: CatalogCrop;
}

/**
 * Compact chip strip that highlights the crops nearby searchers are
 * asking for. Tapping a chip prefills the CropPicker so a grower can
 * commit to that crop in one move. Renders nothing when there is
 * nothing to recommend, so it stays invisible in cold-start regions.
 */
export function NeededNearbyStrip({
  topScarce,
  catalog,
  isLoading,
  onSelect,
  selectedCatalogCropId,
}: NeededNearbyStripProps) {
  const resolved = useMemo<ResolvedScarceCrop[]>(() => {
    if (catalog.length === 0) return [];
    const byId = new Map(catalog.map((crop) => [crop.id, crop]));
    return topScarce
      .map((entry) => {
        const crop = byId.get(entry.cropId);
        return crop ? { ...entry, crop } : null;
      })
      .filter((entry): entry is ResolvedScarceCrop => entry !== null);
  }, [topScarce, catalog]);

  if (isLoading) {
    return null;
  }

  if (resolved.length === 0) {
    return null;
  }

  return (
    <div className="grn-needed-nearby" data-testid="needed-nearby-strip">
      <div className="grn-needed-nearby__header">
        <span className="grn-needed-nearby__eyebrow">Needed nearby</span>
        <p className="grn-needed-nearby__hint">
          Local searchers are asking for these. Tap one to start adding it.
        </p>
      </div>
      <ul className="grn-needed-nearby__chips" role="list">
        {resolved.map((entry) => {
          const visual = visualForCrop(entry.crop.commonName, entry.crop.category);
          const isSelected = selectedCatalogCropId === entry.crop.id;
          return (
            <li key={entry.cropId}>
              <button
                type="button"
                className={`grn-needed-nearby__chip ${isSelected ? 'is-selected' : ''}`.trim()}
                aria-pressed={isSelected}
                data-testid={`needed-nearby-chip-${entry.crop.slug}`}
                onClick={() =>
                  onSelect({
                    catalogCropId: entry.crop.id,
                    cropName: entry.crop.commonName,
                    category: entry.crop.category,
                  })
                }
              >
                <span
                  className="grn-needed-nearby__chip-emoji"
                  aria-hidden="true"
                  style={{ background: `${visual.accent}1f` }}
                >
                  <CropIcon iconKey={visual.iconKey} color={visual.accent} size="1.1rem" />
                </span>
                <span className="grn-needed-nearby__chip-text">
                  <span className="grn-needed-nearby__chip-name">{entry.crop.commonName}</span>
                  <span className="grn-needed-nearby__chip-meta">
                    {entry.requestCount} request{entry.requestCount === 1 ? '' : 's'}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default NeededNearbyStrip;
