import type { KeyboardEvent } from 'react';
import { PYRAMID_TIERS, type PyramidTier, type PyramidTierMeta } from '../CropPlanner/gardenPyramid';
import { CROP_ICON_PATHS, type CropIconKey } from '../CropPlanner/cropIconPaths';
import {
  projectFootprint,
  scaleFootprint,
  smoothClosedPath,
  toPath,
} from '../GardenMasterplan/iso';
import { SCENE, mixHex, mute, shade, tint } from '../GardenMasterplan/palette';
import {
  badgeAnchor,
  groundRing,
  labelAnchor,
  ledgeAnchors,
  ledgeCapacity,
  pyramidMetrics,
  tierBaseZ,
  tierFootprint,
  tierTopZ,
  tierWalls,
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
  onSelectTier: (tier: PyramidTier) => void;
}

const GHOST_COLOR = '#a39c8a';

/**
 * The Garden Pyramid hero, drawn as an isometric terraced hill in the
 * same flat-shaded illustration language as the garden masterplan. Each
 * tier is a selectable terrace: planted crops stand on its front ledge as
 * silhouettes, empty tiers preview faded suggestions. Hovering lifts a
 * terrace while the others recede; the active terrace keeps a dashed
 * survey ring.
 */
export function GardenPyramid({ cropsByTier, activeTier, onSelectTier }: GardenPyramidProps) {
  const metrics = pyramidMetrics();
  const ring = groundRing();

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
            d={smoothClosedPath(
              projectFootprint(ring, 0).map((p) => ({ x: p.x + 9, y: p.y + 7 }))
            )}
            fill={SCENE.groundShadow}
          />
          <path d={smoothClosedPath(projectFootprint(ring, 0))} fill={SCENE.lawn} />
          <path
            d={smoothClosedPath(projectFootprint(scaleFootprint(ring, 0.9), 0))}
            fill={SCENE.lawnLight}
            opacity={0.6}
          />
          <path
            d={smoothClosedPath(projectFootprint(scaleFootprint(ring, 0.72), 0))}
            fill="none"
            stroke={SCENE.contour}
            strokeWidth={1}
            strokeDasharray="2 8"
            strokeLinecap="round"
          />
        </g>
        {PYRAMID_TIERS.map((tier) => (
          <TierStep
            key={tier.key}
            tier={tier}
            crops={cropsByTier[tier.level] ?? []}
            isActive={activeTier === tier.level}
            labelColumnX={metrics.labelColumnX}
            onSelect={() => onSelectTier(tier.level)}
          />
        ))}
      </svg>
    </div>
  );
}

interface TierStepProps {
  tier: PyramidTierMeta;
  crops: PyramidCropVisual[];
  isActive: boolean;
  labelColumnX: number;
  onSelect: () => void;
}

function TierStep({ tier, crops, isActive, labelColumnX, onSelect }: TierStepProps) {
  const count = crops.length;
  const covered = count > 0;

  const base = mute(tier.accent, 0.22);
  const body = covered ? base : mixHex(base, SCENE.paper, 0.5);

  const footprint = tierFootprint(tier.level);
  const topZ = tierTopZ(tier.level);
  const top = projectFootprint(footprint, topZ);
  const walls = tierWalls(tier.level);

  // Front lip of the terrace: west -> south -> east corners of the top
  // face. The square's corners project to north (top), east (right),
  // south (bottom), west (left) in that array order.
  const [, east, south, west] = top;
  const lip = [west, south, east];

  const capacity = ledgeCapacity(tier.level);
  const standing = covered
    ? crops.slice(0, capacity)
    : tier.suggestions.slice(0, Math.min(4, capacity)).map((s) => ({
        id: s.name,
        label: s.name,
        iconKey: s.iconKey,
        accent: GHOST_COLOR,
      }));
  const overflow = covered ? count - standing.length : 0;
  const anchors = ledgeAnchors(tier.level, standing.length);

  const label = labelAnchor(tier.level);
  const badge = badgeAnchor(tier.level);

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
    >
      <path d={toPath(walls.right)} fill={shade(body, 0.18)} />
      <path d={toPath(walls.left)} fill={shade(body, 0.34)} />
      <path d={toPath(top)} fill={tint(body, 0.24)} />
      <path
        d={toPath(lip, false)}
        fill="none"
        stroke={tint(body, 0.45)}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      {!covered && (
        <path
          d={toPath(projectFootprint(scaleFootprint(footprint, 0.86), topZ))}
          fill="none"
          stroke={shade(body, 0.3)}
          strokeWidth={1}
          strokeDasharray="4 5"
          strokeLinecap="round"
        />
      )}

      {standing.map((crop, idx) => {
        const anchor = anchors[idx];
        if (!anchor) return null;
        const p = projectFootprint([anchor], topZ)[0];
        const k = 1.5;
        return (
          <g key={crop.id} className={`mp-crop ${covered ? '' : 'is-ghost'}`.trim()}>
            <title>{crop.label}</title>
            {covered && (
              <ellipse cx={p.x} cy={p.y + 1} rx={10} ry={3.4} fill={SCENE.elementShadowSoft} />
            )}
            <path
              d={CROP_ICON_PATHS[crop.iconKey]}
              fill={covered ? mute(crop.accent, 0.18) : GHOST_COLOR}
              opacity={covered ? 1 : 0.45}
              transform={`translate(${p.x - 12 * k} ${p.y - 23 * k}) scale(${k})`}
            />
          </g>
        );
      })}
      {overflow > 0 && (
        <text
          className="mp-label mp-label--count"
          x={south.x + 16}
          y={south.y + 2}
          aria-hidden="true"
        >
          +{overflow}
        </text>
      )}

      <g className="grn-iso-pyramid__side-label" aria-hidden="true">
        <text
          className="grn-iso-pyramid__name"
          x={labelColumnX}
          y={label.y - 3}
          textAnchor="end"
        >
          {tier.name}
        </text>
        <text
          className="grn-iso-pyramid__caption"
          x={labelColumnX}
          y={label.y + 9.5}
          textAnchor="end"
        >
          Layer {tier.level}
        </text>
        <line
          className="grn-iso-pyramid__leader"
          x1={labelColumnX + 8}
          y1={label.y + 3}
          x2={label.x - 8}
          y2={label.y + 3}
        />
      </g>

      <g
        className="grn-iso-pyramid__badge"
        data-testid={`pyramid-count-${tier.key}`}
        aria-hidden="true"
      >
        <circle
          cx={badge.x + 26}
          cy={badge.y + 2}
          r={11}
          fill={covered ? mute(tier.accent, 0.18) : 'rgba(91, 58, 28, 0.1)'}
        />
        <text
          className={`grn-iso-pyramid__count ${covered ? 'is-covered' : 'is-empty'}`.trim()}
          x={badge.x + 26}
          y={badge.y + 6}
          textAnchor="middle"
        >
          {covered ? count : '+'}
        </text>
      </g>

      {isActive && (
        // Survey ring drawn on the surface this terrace stands on, so it
        // hugs the selected step instead of floating at its (mostly
        // covered) top plane.
        <path
          className="mp-el__ring"
          d={toPath(projectFootprint(scaleFootprint(footprint, 1.07), tierBaseZ(tier.level)))}
          fill="none"
          stroke={SCENE.selection}
          strokeWidth={1.8}
          strokeDasharray="5 4"
        />
      )}
    </g>
  );
}
