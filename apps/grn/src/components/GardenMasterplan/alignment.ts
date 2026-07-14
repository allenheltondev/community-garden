// Snap-to-neighbor alignment for dragging on the masterplan, in world
// inches. Each element is reduced to the axis-aligned bounding box of its
// footprint; while an element is dragged we look for one X and one Y edge
// (left / center / right and top / center / bottom) that land within a small
// threshold of another element's matching edge, and nudge the drag onto it.
// Pure and world-space so it can be unit-tested and shared by every drag
// surface; the caller projects the returned guide segments for display.

import type { WorldPoint } from './iso';

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// A guide to draw: a world-space segment plus which axis it constrains.
export interface AlignGuide {
  axis: 'x' | 'y';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// Default catch distance, in inches. Tight enough not to fight free
// placement, loose enough to feel magnetic at garden scale.
export const ALIGN_THRESHOLD_INCHES = 6;

export function boundsOfWorld(points: WorldPoint[]): WorldBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function edgesX(b: WorldBounds): number[] {
  return [b.minX, (b.minX + b.maxX) / 2, b.maxX];
}

function edgesY(b: WorldBounds): number[] {
  return [b.minY, (b.minY + b.maxY) / 2, b.maxY];
}

interface Match {
  diff: number;
  pos: number;
  target: WorldBounds;
}

/**
 * Given the moving element's candidate bounds and the bounds of every other
 * element, return the position correction (dx, dy) that snaps the closest
 * aligning edge on each axis, plus the guide segments to draw. Only the
 * single best match per axis is used, so guides never clutter.
 */
export function resolveAlignment(
  moving: WorldBounds,
  targets: WorldBounds[],
  threshold = ALIGN_THRESHOLD_INCHES
): { dx: number; dy: number; guides: AlignGuide[] } {
  let bestX: Match | null = null;
  let bestY: Match | null = null;

  const movingX = edgesX(moving);
  const movingY = edgesY(moving);

  for (const target of targets) {
    for (const te of edgesX(target)) {
      for (const me of movingX) {
        const diff = te - me;
        if (Math.abs(diff) <= threshold && (!bestX || Math.abs(diff) < Math.abs(bestX.diff))) {
          bestX = { diff, pos: te, target };
        }
      }
    }
    for (const te of edgesY(target)) {
      for (const me of movingY) {
        const diff = te - me;
        if (Math.abs(diff) <= threshold && (!bestY || Math.abs(diff) < Math.abs(bestY.diff))) {
          bestY = { diff, pos: te, target };
        }
      }
    }
  }

  const dx = bestX ? bestX.diff : 0;
  const dy = bestY ? bestY.diff : 0;
  const snapped: WorldBounds = {
    minX: moving.minX + dx,
    maxX: moving.maxX + dx,
    minY: moving.minY + dy,
    maxY: moving.maxY + dy,
  };

  const guides: AlignGuide[] = [];
  if (bestX) {
    const y1 = Math.min(snapped.minY, bestX.target.minY);
    const y2 = Math.max(snapped.maxY, bestX.target.maxY);
    guides.push({ axis: 'x', x1: bestX.pos, y1, x2: bestX.pos, y2 });
  }
  if (bestY) {
    const x1 = Math.min(snapped.minX, bestY.target.minX);
    const x2 = Math.max(snapped.maxX, bestY.target.maxX);
    guides.push({ axis: 'y', x1, y1: bestY.pos, x2, y2: bestY.pos });
  }
  return { dx, dy, guides };
}
