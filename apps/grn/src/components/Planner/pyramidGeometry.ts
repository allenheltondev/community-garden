// Geometry for the isometric Garden Pyramid: a five-step terraced
// "ziggurat" drawn with the same projection and flat-shading rules as the
// garden masterplan. All layout math lives here (component-free) so the
// GardenPyramid component stays a pure illustration and the math is unit
// testable.
//
// World units are inches, centered on the pyramid's axis at (0, 0).
// Tier 1 (Foundation) is the widest, ground-level step; each tier above
// is inset by a fixed ledge and raised one step.

import {
  ISO_COS,
  ISO_SIN,
  PX_PER_INCH,
  Z_PER_INCH,
  project,
  rectFootprint,
  type ScreenPoint,
  type WorldPoint,
} from '../GardenMasterplan/iso';
import type { PyramidTier } from '../CropPlanner/gardenPyramid';

export const STEP_HEIGHT = 27; // inches per terrace step
export const LEDGE = 22; // exposed terrace band per side, in inches

// Side length of each tier's square, widest to narrowest.
export const TIER_SIDES: Record<PyramidTier, number> = {
  1: 240,
  2: 240 - LEDGE * 2,
  3: 240 - LEDGE * 4,
  4: 240 - LEDGE * 6,
  5: 240 - LEDGE * 8,
};

export function tierFootprint(level: PyramidTier): WorldPoint[] {
  const half = TIER_SIDES[level] / 2;
  return rectFootprint({ x: -half, y: -half, length: half * 2, width: half * 2 });
}

export function tierBaseZ(level: PyramidTier): number {
  return (level - 1) * STEP_HEIGHT;
}

export function tierTopZ(level: PyramidTier): number {
  return level * STEP_HEIGHT;
}

// Walls of one step between two heights. Like iso.extrude but with an
// explicit base elevation, since tiers stack on each other rather than on
// the ground. Footprints are axis-aligned squares, so the two visible
// walls are always the +x (right) and +y (left) faces.
export interface TierWalls {
  right: ScreenPoint[];
  left: ScreenPoint[];
}

export function tierWalls(level: PyramidTier): TierWalls {
  const half = TIER_SIDES[level] / 2;
  const z0 = tierBaseZ(level);
  const z1 = tierTopZ(level);
  // Corners: E = (h, -h), S = (h, h), W = (-h, h).
  const e = { x: half, y: -half };
  const s = { x: half, y: half };
  const w = { x: -half, y: half };
  return {
    right: [
      project(e.x, e.y, z0),
      project(s.x, s.y, z0),
      project(s.x, s.y, z1),
      project(e.x, e.y, z1),
    ],
    left: [
      project(s.x, s.y, z0),
      project(w.x, w.y, z0),
      project(w.x, w.y, z1),
      project(s.x, s.y, z1),
    ],
  };
}

// Evenly spaced stand-points for crop silhouettes along the front ledge
// of a tier: the two camera-facing edges of its top face, walked from the
// west corner around the south corner to the east corner, inset from the
// outer rim so icons sit on the terrace band. Returned back-to-front so
// upright billboards overlap correctly.
export function ledgeAnchors(level: PyramidTier, count: number): WorldPoint[] {
  if (count <= 0) return [];
  const half = TIER_SIDES[level] / 2;
  const inset = Math.min(LEDGE / 2, half / 2);
  const r = half - inset;
  // Polyline W' -> S' -> E' along the inset front edges.
  const corner = 10; // keep icons off the very tips
  const start = { x: -r + corner, y: r };
  const mid = { x: r, y: r };
  const end = { x: r, y: -r + corner };
  const leg1 = Math.hypot(mid.x - start.x, mid.y - start.y);
  const leg2 = Math.hypot(end.x - mid.x, end.y - mid.y);
  const total = leg1 + leg2;

  const anchors: WorldPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    // Center the run along the polyline.
    const t = count === 1 ? 0.5 : 0.5 + (i / (count - 1) - 0.5) * 0.9;
    const dist = t * total;
    if (dist <= leg1) {
      const k = leg1 === 0 ? 0 : dist / leg1;
      anchors.push({ x: start.x + (mid.x - start.x) * k, y: start.y + (mid.y - start.y) * k });
    } else {
      const k = leg2 === 0 ? 0 : (dist - leg1) / leg2;
      anchors.push({ x: mid.x + (end.x - mid.x) * k, y: mid.y + (end.y - mid.y) * k });
    }
  }
  return anchors.sort((a, b) => a.x + a.y - (b.x + b.y));
}

// How many silhouettes fit on a tier's front ledge before "+N" kicks in.
// Narrower (higher) tiers hold fewer.
export function ledgeCapacity(level: PyramidTier): number {
  const half = TIER_SIDES[level] / 2;
  const frontLength = (half - LEDGE / 2) * 4; // both front edges, inset
  return Math.max(2, Math.min(6, Math.floor(frontLength / 42)));
}

// Anchor points for the side labels (west corner of each terrace top) and
// the count badges (east corner), in screen space.
export function labelAnchor(level: PyramidTier): ScreenPoint {
  const half = TIER_SIDES[level] / 2;
  return project(-half, half, tierTopZ(level));
}

export function badgeAnchor(level: PyramidTier): ScreenPoint {
  const half = TIER_SIDES[level] / 2;
  return project(half, -half, tierTopZ(level));
}

// --- Scene metrics -----------------------------------------------------------

const LABEL_COLUMN = 168; // reserved width for the leader-line labels
const BADGE_GUTTER = 64;
const PAD_TOP = 56;
const PAD_BOTTOM = 64;

export interface PyramidMetrics {
  width: number;
  height: number;
  viewBox: string;
  /** x where label text right-aligns (leader lines run from here). */
  labelColumnX: number;
}

export function pyramidMetrics(): PyramidMetrics {
  const baseHalf = TIER_SIDES[1] / 2;
  // Widest extent comes from the base square's west/east corners.
  const halfWidth = baseHalf * 2 * ISO_COS * PX_PER_INCH;
  // Lowest point: base south corner at z=0; highest: keep simple and use
  // the base north corner (z=0) vs top tier's north corner and take the
  // higher (smaller y).
  const south = baseHalf * 2 * ISO_SIN * PX_PER_INCH;
  const baseNorth = -south;
  const topHalf = TIER_SIDES[5] / 2;
  const topNorth = -topHalf * 2 * ISO_SIN * PX_PER_INCH - tierTopZ(5) * Z_PER_INCH;
  const north = Math.min(baseNorth, topNorth);

  const minX = -halfWidth - LABEL_COLUMN;
  const maxX = halfWidth + BADGE_GUTTER;
  const minY = north - PAD_TOP;
  const maxY = south + PAD_BOTTOM;
  return {
    width: maxX - minX,
    height: maxY - minY,
    viewBox: `${Math.round(minX)} ${Math.round(minY)} ${Math.round(maxX - minX)} ${Math.round(maxY - minY)}`,
    labelColumnX: -halfWidth - 28,
  };
}

// Organic lawn blob under the pyramid, same hand-drawn wobble as the
// masterplan ground plate. The radius covers the base square's *diagonal*
// corners (half·√2), not just its sides, so no corner pokes past the lawn.
export function groundRing(margin = 26): WorldPoint[] {
  const half = (TIER_SIDES[1] / 2) * Math.SQRT2 + margin;
  const points: WorldPoint[] = [];
  const segments = 14;
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const wobble = 1 + Math.sin(i * 2.7) * 0.06;
    points.push({
      x: Math.cos(angle) * half * wobble,
      y: Math.sin(angle) * half * wobble,
    });
  }
  return points;
}
