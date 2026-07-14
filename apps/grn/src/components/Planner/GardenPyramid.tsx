import { useState, type KeyboardEvent } from 'react';
import {
  PYRAMID_TIERS,
  type PyramidTier,
  type PyramidTierMeta,
} from '../CropPlanner/gardenPyramid';
import { CROP_ICON_PATHS, type CropIconKey } from '../CropPlanner/cropIconPaths';
import { smoothClosedPath, toPath } from '../GardenMasterplan/iso';
import { SCENE, mixHex, mute, shade, tint } from '../GardenMasterplan/palette';
import {
  RELIEF,
  SHOULDER_CAPACITY,
  bandRect,
  lawnRing,
  ledgeQuads,
  pyramidMetrics,
  showcaseCapacity,
  sideQuad,
  standPoints,
} from './pyramidGeometry';

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
  /** The layer the plan recommends growing next — gently highlighted so the
   * pyramid itself points the way. */
  nextTier?: PyramidTier | null;
  onSelectTier: (tier: PyramidTier) => void;
}

const GHOST_COLOR = '#a39c8a';
const ICON_SCALE = 1.15;

// Light text for the deep bands, dark text for the pale gold one —
// picked per band from the same family as its fill, like the masterplan
// labels.
function bandInk(base: string): { title: string; subtitle: string } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (luminance > 0.6) {
    return { title: shade(base, 0.72), subtitle: shade(base, 0.55) };
  }
  return { title: tint(base, 0.85), subtitle: tint(base, 0.62) };
}

interface StandingCrop {
  id: string;
  label: string;
  iconKey: CropIconKey;
  fill: string;
  ghost: boolean;
}

function StandingCropRow({
  crops,
  points,
  withShadows,
}: {
  crops: StandingCrop[];
  points: { x: number; y: number }[];
  withShadows: boolean;
}) {
  return (
    <>
      {crops.map((crop, idx) => {
        const p = points[idx];
        if (!p) return null;
        return (
          <g
            key={crop.id}
            className={`mp-crop ${crop.ghost ? 'is-ghost' : ''}`.trim()}
            style={{ ['--crop-index' as string]: idx }}
          >
            <title>{crop.label}</title>
            {withShadows && !crop.ghost && (
              <ellipse cx={p.x} cy={p.y + 1} rx={9} ry={2.8} fill={SCENE.elementShadowSoft} />
            )}
            <path
              d={CROP_ICON_PATHS[crop.iconKey]}
              fill={crop.fill}
              opacity={crop.ghost ? 0.45 : 1}
              transform={`translate(${p.x - 12 * ICON_SCALE} ${p.y - 23 * ICON_SCALE}) scale(${ICON_SCALE})`}
            />
          </g>
        );
      })}
    </>
  );
}

/**
 * The Garden Pyramid hero: the classic stepped-triangle elevation,
 * rendered in the masterplan's flat-shaded illustration style. Each band
 * is a selectable terrace with its name and tagline in place; the
 * grower's crops stand on the exposed ledges as vector silhouettes, and
 * hovering or selecting a band steps its full planting forward across
 * the band's width. Empty bands preview faded suggestions.
 */
export function GardenPyramid({
  cropsByTier,
  activeTier,
  nextTier,
  onSelectTier,
}: GardenPyramidProps) {
  const metrics = pyramidMetrics();
  const [hoverTier, setHoverTier] = useState<PyramidTier | null>(null);
  const lawn = lawnRing();

  // The band whose full planting is showcased: hover wins (preview),
  // otherwise the selected band.
  const showcaseTier =
    hoverTier !== null && (cropsByTier[hoverTier]?.length ?? 0) > 0
      ? hoverTier
      : (cropsByTier[activeTier]?.length ?? 0) > 0
        ? activeTier
        : null;

  const showcaseCrops =
    showcaseTier !== null
      ? (cropsByTier[showcaseTier] ?? []).map((crop) => ({
          id: crop.id,
          label: crop.label,
          iconKey: crop.iconKey,
          fill: mute(crop.accent, 0.18),
          ghost: false,
        }))
      : [];
  const showcaseMax = showcaseTier !== null ? showcaseCapacity(showcaseTier) : 0;
  const showcaseVisible = showcaseCrops.slice(0, showcaseMax);
  const showcaseOverflow = showcaseCrops.length - showcaseVisible.length;
  const showcasePoints =
    showcaseTier !== null
      ? standPoints(showcaseTier, showcaseVisible.length, 'full')
      : [];

  return (
    <div className="grn-iso-pyramid">
      <svg
        className="mp-scene grn-iso-pyramid__svg"
        viewBox={metrics.viewBox}
        role="group"
        aria-label="Garden pyramid layers"
      >
        <g aria-hidden="true">
          <path
            d={smoothClosedPath(lawn.map((p) => ({ x: p.x + 8, y: p.y + 6 })))}
            fill={SCENE.groundShadow}
          />
          <path d={smoothClosedPath(lawn)} fill={SCENE.lawn} />
          <path
            d={smoothClosedPath(
              lawn.map((p) => ({ x: p.x * 0.92 + 330 * 0.08, y: p.y * 0.94 + 408 * 0.06 }))
            )}
            fill={SCENE.lawnLight}
            opacity={0.6}
          />
        </g>
        {PYRAMID_TIERS.map((tier) => (
          <PyramidBand
            key={tier.key}
            tier={tier}
            crops={cropsByTier[tier.level] ?? []}
            isActive={activeTier === tier.level}
            isNext={nextTier === tier.level && activeTier !== tier.level}
            isShowcased={showcaseTier === tier.level}
            // The showcased planting below stands in front of this band's
            // lower edge; quiet the tagline there so the two never fight.
            taglineQuieted={showcaseTier !== null && tier.level === showcaseTier + 1}
            onSelect={() => onSelectTier(tier.level)}
            onHover={(hovering) =>
              setHoverTier((current) =>
                hovering ? tier.level : current === tier.level ? null : current
              )
            }
          />
        ))}
        {showcaseTier !== null && (
          <g className="grn-iso-pyramid__showcase" aria-hidden="true" key={showcaseTier}>
            <StandingCropRow crops={showcaseVisible} points={showcasePoints} withShadows />
            {showcaseOverflow > 0 && (
              <text
                className="mp-label mp-label--count"
                x={bandRect(showcaseTier).x + bandRect(showcaseTier).w + RELIEF.dx + 4}
                y={bandRect(showcaseTier).y - 8}
              >
                +{showcaseOverflow}
              </text>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}

interface PyramidBandProps {
  tier: PyramidTierMeta;
  crops: PyramidCropVisual[];
  isActive: boolean;
  isNext: boolean;
  isShowcased: boolean;
  taglineQuieted: boolean;
  onSelect: () => void;
  onHover: (hovering: boolean) => void;
}

function PyramidBand({
  tier,
  crops,
  isActive,
  isNext,
  isShowcased,
  taglineQuieted,
  onSelect,
  onHover,
}: PyramidBandProps) {
  const count = crops.length;
  const covered = count > 0;

  const base = mute(tier.accent, 0.22);
  const body = covered ? base : mixHex(base, SCENE.paper, 0.5);
  const ink = bandInk(body);

  const band = bandRect(tier.level);
  const ledges = ledgeQuads(tier.level);
  const side = sideQuad(tier.level);

  // Resting-state silhouettes on the shoulders. Hidden while this band's
  // full planting is showcased (the showcase row replaces them), kept
  // for empty bands so ghost suggestions always preview what belongs.
  const resting: StandingCrop[] = covered
    ? crops.slice(0, SHOULDER_CAPACITY).map((crop) => ({
        id: crop.id,
        label: crop.label,
        iconKey: crop.iconKey,
        fill: mute(crop.accent, 0.18),
        ghost: false,
      }))
    : tier.suggestions.slice(0, SHOULDER_CAPACITY).map((s) => ({
        id: s.name,
        label: s.name,
        iconKey: s.iconKey,
        fill: GHOST_COLOR,
        ghost: true,
      }));
  const restingPoints = standPoints(tier.level, resting.length, 'shoulders');
  const restingOverflow = covered ? count - resting.length : 0;
  const hideResting = isShowcased && covered;

  // Copy layout inside the band: every band except the narrow apex fits a
  // concrete descriptor beneath its name, so the context reads straight off
  // the pyramid rather than only in the side panel.
  const showDescriptor = tier.level <= 4;
  const nameY = band.y + (showDescriptor ? 26 : band.h / 2 + 5);
  const badgeCx = band.x + band.w - 24;

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect();
    }
  }

  return (
    <g
      className={`mp-el grn-iso-pyramid__tier ${isActive ? 'mp-el--selected' : ''} ${
        covered ? 'is-covered' : 'is-empty'
      }`.trim()}
      data-testid={`pyramid-band-${tier.key}`}
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      aria-label={`Layer ${tier.level}, ${tier.name}: ${
        covered ? `${count} crop${count === 1 ? '' : 's'} planned` : 'nothing here yet'
      }`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
      <path d={toPath(side)} fill={shade(body, 0.3)} />
      <rect x={band.x} y={band.y} width={band.w} height={band.h} fill={body} />
      {ledges.map((quad, idx) => (
        <path key={idx} d={toPath(quad)} fill={tint(body, 0.28)} />
      ))}
      {/* Empty-state dashed frame — only on the narrow apex, where there is
          no descriptor line for it to cut through. The wider empty bands
          already read as empty from their paper fill, ghost suggestions and
          "+" badge. */}
      {!covered && !showDescriptor && (
        <rect
          x={band.x + 7}
          y={band.y + 7}
          width={band.w - 14}
          height={band.h - 14}
          fill="none"
          stroke={shade(body, 0.28)}
          strokeWidth={1}
          strokeDasharray="4 5"
          strokeLinecap="round"
        />
      )}

      <text
        className="grn-iso-pyramid__name"
        x={band.x + 18}
        y={nameY}
        fill={ink.title}
      >
        {tier.name}
      </text>
      {showDescriptor && (
        <text
          className={`grn-iso-pyramid__tagline ${taglineQuieted ? 'is-quiet' : ''}`.trim()}
          x={band.x + 18}
          y={band.y + 44}
          fill={ink.subtitle}
        >
          {tier.descriptor}
        </text>
      )}

      {!hideResting && (
        <g aria-hidden="true">
          <StandingCropRow crops={resting} points={restingPoints} withShadows={false} />
          {restingOverflow > 0 && (
            <text
              className="mp-label mp-label--count"
              x={band.x + band.w + RELIEF.dx + 4}
              y={band.y - 4}
            >
              +{restingOverflow}
            </text>
          )}
        </g>
      )}

      <g
        className="grn-iso-pyramid__badge"
        data-testid={`pyramid-count-${tier.key}`}
        aria-hidden="true"
      >
        <circle
          cx={badgeCx}
          cy={band.y + band.h / 2}
          r={12}
          fill={covered ? shade(body, 0.28) : 'rgba(91, 58, 28, 0.12)'}
        />
        <text
          className={`grn-iso-pyramid__count ${covered ? 'is-covered' : 'is-empty'}`.trim()}
          x={badgeCx}
          y={band.y + band.h / 2 + 4}
          textAnchor="middle"
        >
          {covered ? count : '+'}
        </text>
      </g>

      {isNext && (
        <rect
          className="grn-iso-pyramid__next-halo"
          x={band.x - 4}
          y={band.y - RELIEF.dy - 4}
          width={band.w + RELIEF.dx + 8}
          height={band.h + RELIEF.dy + 8}
          rx={7}
          fill="none"
          stroke={tier.accent}
          strokeWidth={2}
          aria-hidden="true"
        />
      )}

      {isActive && (
        <rect
          className="mp-el__ring"
          x={band.x - 5}
          y={band.y - RELIEF.dy - 5}
          width={band.w + RELIEF.dx + 10}
          height={band.h + RELIEF.dy + 10}
          rx={7}
          fill="none"
          stroke={SCENE.selection}
          strokeWidth={1.8}
          strokeDasharray="5 4"
        />
      )}
    </g>
  );
}
