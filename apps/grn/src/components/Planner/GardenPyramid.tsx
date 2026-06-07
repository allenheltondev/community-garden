import { PYRAMID_TIERS, type PyramidTier } from '../CropPlanner/gardenPyramid';
import { CropIcon } from '../CropPlanner/cropIcons';
import type { CropIconKey } from '../CropPlanner/cropIconPaths';

export interface PyramidCropVisual {
  id: string;
  label: string;
  iconKey: CropIconKey;
  accent: string;
}

interface GardenPyramidProps {
  /** The grower's crops in each layer, with the vector icon to render. */
  cropsByTier: Record<PyramidTier, PyramidCropVisual[]>;
  /** Currently focused layer. */
  activeTier: PyramidTier;
  onSelectTier: (tier: PyramidTier) => void;
}

// Stepped widths give the stacked bands a clear pyramid silhouette — widest at
// the Foundation, narrowest at Joy. Indexed by level (1-5).
const BAND_WIDTH: Record<PyramidTier, string> = {
  1: '100%',
  2: '88%',
  3: '76%',
  4: '64%',
  5: '52%',
};

// How many crop icons to show inline before collapsing into a "+N" pill.
const MAX_VISIBLE_ICONS = 6;

/**
 * The Garden Pyramid hero. Renders the five layers top (Joy) to bottom
 * (Foundation) as selectable bands. Each band shows the vector icons of the
 * crops the grower has placed there; empty layers preview faded suggestion
 * icons so the gardener can see what belongs.
 */
export function GardenPyramid({ cropsByTier, activeTier, onSelectTier }: GardenPyramidProps) {
  // Render narrowest (top) to widest (bottom): Joy → Foundation.
  const topDown = [...PYRAMID_TIERS].reverse();

  return (
    <div className="grn-pyramid" role="list" aria-label="Garden pyramid layers">
      {topDown.map((tier) => {
        const crops = cropsByTier[tier.level] ?? [];
        const count = crops.length;
        const covered = count > 0;
        const isActive = activeTier === tier.level;
        const visible = crops.slice(0, MAX_VISIBLE_ICONS);
        const overflow = count - visible.length;

        return (
          <button
            key={tier.key}
            type="button"
            role="listitem"
            data-testid={`pyramid-band-${tier.key}`}
            className={`grn-pyramid__band ${isActive ? 'is-active' : ''} ${
              covered ? 'is-covered' : 'is-empty'
            }`.trim()}
            style={{
              width: BAND_WIDTH[tier.level],
              ['--tier-accent' as string]: tier.accent,
            }}
            aria-pressed={isActive}
            aria-label={`Layer ${tier.level}, ${tier.name}: ${
              covered
                ? `${count} crop${count === 1 ? '' : 's'} planned`
                : 'nothing here yet'
            }`}
            onClick={() => onSelectTier(tier.level)}
          >
            <span className="grn-pyramid__level" aria-hidden="true">
              {tier.level}
            </span>

            <span className="grn-pyramid__band-main">
              <span className="grn-pyramid__band-text">
                <span className="grn-pyramid__band-name">{tier.name}</span>
                <span className="grn-pyramid__band-tagline">{tier.tagline}</span>
              </span>

              <span className="grn-pyramid__crops" aria-hidden="true">
                {covered ? (
                  <>
                    {visible.map((crop) => (
                      <span
                        key={crop.id}
                        className="grn-pyramid__crop-icon"
                        title={crop.label}
                      >
                        <CropIcon iconKey={crop.iconKey} color={crop.accent} size="1.5rem" />
                      </span>
                    ))}
                    {overflow > 0 ? (
                      <span className="grn-pyramid__crop-more">+{overflow}</span>
                    ) : null}
                  </>
                ) : (
                  tier.suggestions.slice(0, 4).map((suggestion) => (
                    <span
                      key={suggestion.name}
                      className="grn-pyramid__crop-icon is-ghost"
                      title={suggestion.name}
                    >
                      <CropIcon iconKey={suggestion.iconKey} size="1.4rem" />
                    </span>
                  ))
                )}
              </span>
            </span>

            <span
              className={`grn-pyramid__band-count ${covered ? 'is-covered' : 'is-empty'}`.trim()}
              data-testid={`pyramid-count-${tier.key}`}
              aria-hidden="true"
            >
              {covered ? count : '+'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
