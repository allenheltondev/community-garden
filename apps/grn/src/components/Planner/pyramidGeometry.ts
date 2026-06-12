// Geometry for the Garden Pyramid hero: a front-elevation stepped
// pyramid (the classic food-pyramid silhouette) rendered with the
// masterplan's flat-shaded relief. All layout math lives here
// (component-free) so the GardenPyramid component stays a pure
// illustration and the math is unit testable.
//
// Unlike the masterplan this is NOT an isometric projection — the
// pyramid metaphor lives in the triangular front profile, so the bands
// are drawn face-on in screen space, with a small skewed "relief" on
// each band's top ledge and right side to keep the hand-crafted depth.

import type { ScreenPoint } from '../GardenMasterplan/iso';
import type { PyramidTier } from '../CropPlanner/gardenPyramid';

export const ALL_TIERS: readonly PyramidTier[] = [1, 2, 3, 4, 5];

// Band sizes, widest to narrowest. Heights taper slightly so the base
// reads heavier — the hierarchy is the message.
export const BAND_WIDTHS: Record<PyramidTier, number> = {
  1: 480,
  2: 384,
  3: 288,
  4: 192,
  5: 96,
};

export const BAND_HEIGHTS: Record<PyramidTier, number> = {
  1: 64,
  2: 58,
  3: 54,
  4: 50,
  5: 46,
};

// Skew of the ledge/side relief, in screen px.
export const RELIEF = { dx: 9, dy: 6 } as const;

export const CENTER_X = 330;
export const BASE_Y = 400;

export interface BandRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function bandRect(level: PyramidTier): BandRect {
  const w = BAND_WIDTHS[level];
  let y = BASE_Y;
  for (let l = 1 as PyramidTier; l <= level; l += 1) {
    y -= BAND_HEIGHTS[l as PyramidTier];
  }
  return { x: CENTER_X - w / 2, y, w, h: BAND_HEIGHTS[level] };
}

function parallelogram(x0: number, x1: number, y: number): ScreenPoint[] {
  return [
    { x: x0, y },
    { x: x1, y },
    { x: x1 + RELIEF.dx, y: y - RELIEF.dy },
    { x: x0 + RELIEF.dx, y: y - RELIEF.dy },
  ];
}

// The lit top ledges of a band: the exposed left/right shoulders beside
// the band above, or the full top for the topmost band.
export function ledgeQuads(level: PyramidTier): ScreenPoint[][] {
  const band = bandRect(level);
  if (level === 5) {
    return [parallelogram(band.x, band.x + band.w, band.y)];
  }
  const above = bandRect((level + 1) as PyramidTier);
  return [
    parallelogram(band.x, above.x, band.y),
    parallelogram(above.x + above.w, band.x + band.w, band.y),
  ];
}

// The shaded right-side return of a band.
export function sideQuad(level: PyramidTier): ScreenPoint[] {
  const band = bandRect(level);
  const xr = band.x + band.w;
  return [
    { x: xr, y: band.y },
    { x: xr + RELIEF.dx, y: band.y - RELIEF.dy },
    { x: xr + RELIEF.dx, y: band.y + band.h - RELIEF.dy },
    { x: xr, y: band.y + band.h },
  ];
}

// --- Crop stand points -------------------------------------------------------
// Crops stand with their feet on a band's top edge. Two modes:
//
// - 'shoulders': the resting state. Silhouettes stand only on the
//   exposed ledges beside the band above, so they never crowd the upper
//   band's copy.
// - 'full': the showcase state for the hovered/selected band. The whole
//   planting steps forward across the band's full width, drawn in front
//   of the hill.

const STAND_MARGIN = 18;
const SHOWCASE_SPACING = { min: 17, max: 30 } as const;

function spread(x0: number, x1: number, count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [(x0 + x1) / 2];
  const usable = x1 - x0;
  const spacing = Math.min(SHOWCASE_SPACING.max, usable / (count - 1));
  const start = (x0 + x1) / 2 - (spacing * (count - 1)) / 2;
  return Array.from({ length: count }, (_, i) => start + spacing * i);
}

// Two silhouettes per shoulder in the resting state; the top band's
// full ledge holds the same four.
export const SHOULDER_CAPACITY = 4;

export function showcaseCapacity(level: PyramidTier): number {
  const band = bandRect(level);
  const usable = band.w - STAND_MARGIN * 2;
  return Math.max(4, Math.floor(usable / SHOWCASE_SPACING.min) + 1);
}

export function standPoints(
  level: PyramidTier,
  count: number,
  mode: 'shoulders' | 'full'
): ScreenPoint[] {
  if (count <= 0) return [];
  const band = bandRect(level);
  const y = band.y;

  if (mode === 'full' || level === 5) {
    const xs = spread(band.x + STAND_MARGIN, band.x + band.w - STAND_MARGIN, count);
    return xs.map((x) => ({ x, y }));
  }

  const above = bandRect((level + 1) as PyramidTier);
  const leftCount = Math.ceil(count / 2);
  const rightCount = count - leftCount;
  const left = spread(band.x + STAND_MARGIN, above.x - 8, leftCount);
  const right = spread(above.x + above.w + 8, band.x + band.w - STAND_MARGIN, rightCount);
  return [...left, ...right].map((x) => ({ x, y }));
}

// --- Scene metrics -----------------------------------------------------------

export interface PyramidMetrics {
  width: number;
  height: number;
  viewBox: string;
}

export function pyramidMetrics(): PyramidMetrics {
  // Fixed frame: the pyramid plus lawn, headroom for standing crops on
  // the top band, and the ground shadow below.
  return { width: 680, height: 472, viewBox: '0 0 680 472' };
}

// Organic lawn blob beneath the pyramid, in screen space, with the same
// hand-drawn wobble as the masterplan ground plate.
export function lawnRing(): ScreenPoint[] {
  const cx = CENTER_X;
  const cy = BASE_Y + 8;
  const rx = BAND_WIDTHS[1] / 2 + 64;
  const ry = 42;
  const points: ScreenPoint[] = [];
  const segments = 14;
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const wobble = 1 + Math.sin(i * 2.7) * 0.06;
    points.push({
      x: cx + Math.cos(angle) * rx * wobble,
      y: cy + Math.sin(angle) * ry * wobble,
    });
  }
  return points;
}
