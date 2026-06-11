// Sun-shadow geometry for the masterplan.
//
// Shadows are computed in world space (inches on the ground plane) and
// projected like any other footprint: for an element with footprint F and
// height h, the shadow is the convex hull of F ∪ translate(F, h·k·dir),
// where dir is the unit shadow direction (away from the sun) and k a
// time-of-day length factor. That's the classic "drag the base along the
// light ray" approximation — plenty for an illustrated plan, and convex
// hulls keep the soft smoothed outline tidy even for concave footprints.
//
// This module also owns the canonical element heights so the renderers
// (IsoBed/IsoAnnotation) and the shadow caster share one set of numbers.
// It stays component-free so react-refresh is happy and everything here
// is unit-testable.

import type { GardenAnnotation, GardenBed } from '../../types/listing';
import { annotationFootprint, bedFootprint } from './footprints';
import { boundsOf, worldCentroid, type WorldPoint } from './iso';
import { annotationKind } from './palette';

// --- Canonical element heights (inches) --------------------------------------
// Imported by the Iso* renderers — change them here and both the drawing
// and its shadow follow.

export const RAISED_BED_HEIGHT = 11;
export const IN_GROUND_BED_HEIGHT = 2.5;
export const MOUND_HEIGHT = 8;
export const SHED_EAVES = 70;
export const SHED_RIDGE = 96;
export const GREENHOUSE_EAVES = 62;
export const GREENHOUSE_RIDGE = 84;
export const COOP_EAVES = 40;
export const COOP_RIDGE = 56;
export const TRELLIS_HEIGHT = 66;
export const COMPOST_HEIGHT = 24;
// Canopy slices in IsoAnnotation top out at radius × these factors.
export const CANOPY_TOP_FACTOR = 1.08;
export const BERRY_BUSH_TOP_FACTOR = 0.62;

/** Mean vertex distance from the centroid — the renderers' proxy for canopy radius. */
export function avgFootprintRadius(footprint: WorldPoint[]): number {
  const c = worldCentroid(footprint);
  if (footprint.length === 0) return 12;
  const total = footprint.reduce((sum, p) => sum + Math.hypot(p.x - c.x, p.y - c.y), 0);
  return Math.max(8, total / footprint.length);
}

// --- Sun model ----------------------------------------------------------------

export type SunTime = 'morning' | 'noon' | 'evening';

// Long raking shadows at the edges of the day, short stubs at midday.
export const SHADOW_LENGTH_FACTOR: Record<SunTime, number> = {
  morning: 1.2,
  noon: 0.45,
  evening: 1.2,
};

// Shadow directions (unit vectors, away from the sun) in a north-up world
// where +x is east and +y is south:
// - morning: sun in the east → shadows point due west.
// - noon: sun south-southeast → shadows point north-northwest.
// - evening: sun in the west → shadows point due east.
const NOON_ANGLE = (22.5 * Math.PI) / 180; // SSE, 22.5° east of due south
const BASE_DIR: Record<SunTime, WorldPoint> = {
  morning: { x: -1, y: 0 },
  noon: { x: -Math.sin(NOON_ANGLE), y: -Math.cos(NOON_ANGLE) },
  evening: { x: 1, y: 0 },
};

/**
 * Unit shadow direction in world space for a time of day.
 * `northOffsetDeg` rotates the whole sun model the same way the compass
 * needle rotates: a positive offset turns true north clockwise from the
 * canvas's "up" (-y), so the shadow directions turn with it.
 */
export function sunShadowDir(sun: SunTime, northOffsetDeg = 0): WorldPoint {
  const base = BASE_DIR[sun];
  if (!northOffsetDeg) return { ...base };
  const rad = (northOffsetDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: base.x * cos - base.y * sin, y: base.x * sin + base.y * cos };
}

// --- Convex hull ----------------------------------------------------------------

function cross(o: WorldPoint, a: WorldPoint, b: WorldPoint): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Andrew's monotone chain. Returns the hull counter-clockwise in the
 * world's y-down coordinate system; collinear points are dropped.
 */
export function convexHull(points: WorldPoint[]): WorldPoint[] {
  if (points.length <= 2) return [...points];
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: WorldPoint[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: WorldPoint[] = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * World-space shadow polygon for a footprint of the given height: convex
 * hull of the base and the base swept along the shadow direction by
 * height × lengthFactor.
 */
export function shadowPolygon(
  footprint: WorldPoint[],
  heightInches: number,
  dir: WorldPoint,
  lengthFactor: number
): WorldPoint[] {
  const reach = heightInches * lengthFactor;
  const swept = footprint.map((p) => ({ x: p.x + dir.x * reach, y: p.y + dir.y * reach }));
  return convexHull([...footprint, ...swept]);
}

// --- Casters ----------------------------------------------------------------------

export interface ShadowCaster {
  id: string;
  footprint: WorldPoint[];
  height: number;
}

/**
 * Effective shadow-casting height of a bed. In-ground beds sit ~2.5"
 * proud of the lawn — visually negligible — so only raised beds and
 * mounds cast.
 */
export function bedCasterHeight(bed: GardenBed): number | null {
  if (bed.bedType === 'raised') return RAISED_BED_HEIGHT;
  if (bed.bedType === 'mound') return MOUND_HEIGHT;
  return null;
}

/**
 * Effective shadow-casting height of an annotation, or null for things
 * that shouldn't cast: paths and ponds are flat, markers are knee-high
 * clutter, and fences are skipped deliberately — a long picket line of
 * hull shadows reads as noise, not light.
 */
export function annotationCasterHeight(a: GardenAnnotation): number | null {
  const kind = annotationKind(a);
  switch (kind) {
    case 'tree':
    case 'fruitTree':
      return avgFootprintRadius(annotationFootprint(a)) * CANOPY_TOP_FACTOR;
    case 'berryBush':
      return avgFootprintRadius(annotationFootprint(a)) * BERRY_BUSH_TOP_FACTOR;
    case 'shed':
      return SHED_RIDGE;
    case 'greenhouse':
      return GREENHOUSE_RIDGE;
    case 'coop':
      return COOP_RIDGE;
    case 'trellis':
      return TRELLIS_HEIGHT;
    case 'compost':
      return COMPOST_HEIGHT;
    default:
      return null;
  }
}

/** Every element in the garden tall enough to throw a readable shadow. */
export function collectShadowCasters(
  beds: GardenBed[],
  annotations: GardenAnnotation[]
): ShadowCaster[] {
  const casters: ShadowCaster[] = [];
  for (const bed of beds) {
    const height = bedCasterHeight(bed);
    if (height != null) casters.push({ id: bed.id, footprint: bedFootprint(bed), height });
  }
  for (const a of annotations) {
    const height = annotationCasterHeight(a);
    const footprint = annotationFootprint(a);
    if (height != null && footprint.length >= 3) {
      casters.push({ id: a.id, footprint, height });
    }
  }
  return casters;
}

/** World-space shadow polygons for a set of casters at a time of day. */
export function shadowPolygonsFor(
  casters: ShadowCaster[],
  sun: SunTime,
  northOffsetDeg = 0
): WorldPoint[][] {
  const dir = sunShadowDir(sun, northOffsetDeg);
  const k = SHADOW_LENGTH_FACTOR[sun];
  return casters.map((c) => shadowPolygon(c.footprint, c.height, dir, k));
}

// --- Sun-conflict insight ---------------------------------------------------------

/** Ray-casting point-in-polygon (boundary points count as inside-ish; fine for sampling). */
export function pointInPolygon(p: WorldPoint, polygon: WorldPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

const SHADE_SAMPLE_GRID = 5;

/**
 * Approximate fraction of a footprint's area covered by any of the given
 * shadow polygons: a 5×5 grid of sample points across the footprint's
 * bounding box, keeping only points actually inside the footprint, each
 * tested against the shadows.
 */
export function shadeFraction(footprint: WorldPoint[], shadows: WorldPoint[][]): number {
  if (footprint.length < 3 || shadows.length === 0) return 0;
  const b = boundsOf(footprint);
  let inside = 0;
  let shaded = 0;
  for (let i = 0; i < SHADE_SAMPLE_GRID; i += 1) {
    for (let j = 0; j < SHADE_SAMPLE_GRID; j += 1) {
      // Cell centers, so samples never sit exactly on the bounding box edge.
      const p = {
        x: b.minX + ((i + 0.5) / SHADE_SAMPLE_GRID) * (b.maxX - b.minX),
        y: b.minY + ((j + 0.5) / SHADE_SAMPLE_GRID) * (b.maxY - b.minY),
      };
      if (!pointInPolygon(p, footprint)) continue;
      inside += 1;
      if (shadows.some((shadow) => pointInPolygon(p, shadow))) shaded += 1;
    }
  }
  return inside === 0 ? 0 : shaded / inside;
}

/**
 * Fraction of this bed sitting in *other* elements' noon shadows —
 * the bed's own shadow never counts against it.
 */
export function bedNoonShadeFraction(
  bed: GardenBed,
  beds: GardenBed[],
  annotations: GardenAnnotation[],
  northOffsetDeg = 0
): number {
  const casters = collectShadowCasters(beds, annotations).filter((c) => c.id !== bed.id);
  if (casters.length === 0) return 0;
  const shadows = shadowPolygonsFor(casters, 'noon', northOffsetDeg);
  return shadeFraction(bedFootprint(bed), shadows);
}

export const SHADE_CONFLICT_THRESHOLD = 0.4;

/** A bed labeled full sun that sits mostly in shade at midday. */
export function hasNoonShadeConflict(bed: GardenBed, noonShadeFraction: number): boolean {
  return bed.sunExposure === 'full_sun' && noonShadeFraction > SHADE_CONFLICT_THRESHOLD;
}
