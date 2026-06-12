// Smart alignment for drags in the layout editor: the dragged element's
// edges and centers snap to neighbors' edges and centers, and the editor
// draws a guide line through whatever it locked onto. All units inches.

export interface ElementBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface AlignmentGuide {
  orientation: 'vertical' | 'horizontal';
  position: number;
}

export interface SnapToNeighborsResult {
  x: number;
  y: number;
  guides: AlignmentGuide[];
}

function axisCandidates(start: number, size: number): number[] {
  return [start, start + size / 2, start + size];
}

interface AxisMatch {
  delta: number;
  guidePosition: number;
}

function bestAxisMatch(
  dragged: number[],
  neighborLines: number[],
  tolerance: number
): AxisMatch | null {
  let best: AxisMatch | null = null;
  for (const line of neighborLines) {
    for (const candidate of dragged) {
      const delta = line - candidate;
      if (Math.abs(delta) > tolerance) continue;
      if (!best || Math.abs(delta) < Math.abs(best.delta)) {
        best = { delta, guidePosition: line };
      }
    }
  }
  return best;
}

/**
 * Given the dragged element's proposed position and the bounds of its
 * neighbors, returns the position nudged onto the nearest alignment line
 * within tolerance (per axis, independently) plus the guide lines to draw.
 * No match inside tolerance leaves that axis untouched.
 */
export function snapToNeighbors(args: {
  x: number;
  y: number;
  width: number;
  height: number;
  neighbors: ElementBounds[];
  toleranceInches?: number;
}): SnapToNeighborsResult {
  const { x, y, width, height, neighbors, toleranceInches = 2 } = args;

  const verticalLines: number[] = [];
  const horizontalLines: number[] = [];
  for (const n of neighbors) {
    verticalLines.push(...axisCandidates(n.left, n.right - n.left));
    horizontalLines.push(...axisCandidates(n.top, n.bottom - n.top));
  }

  const guides: AlignmentGuide[] = [];
  let nextX = x;
  let nextY = y;

  const vMatch = bestAxisMatch(
    axisCandidates(x, width),
    verticalLines,
    toleranceInches
  );
  if (vMatch) {
    nextX = x + vMatch.delta;
    guides.push({ orientation: 'vertical', position: vMatch.guidePosition });
  }

  const hMatch = bestAxisMatch(
    axisCandidates(y, height),
    horizontalLines,
    toleranceInches
  );
  if (hMatch) {
    nextY = y + hMatch.delta;
    guides.push({ orientation: 'horizontal', position: hMatch.guidePosition });
  }

  return { x: nextX, y: nextY, guides };
}

export interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Axis-aligned overlap test for marquee selection. Rotated elements use
// their unrotated bounding box — close enough for grab-everything-here.
export function marqueeIntersects(rect: MarqueeRect, bounds: ElementBounds): boolean {
  const left = Math.min(rect.x, rect.x + rect.width);
  const right = Math.max(rect.x, rect.x + rect.width);
  const top = Math.min(rect.y, rect.y + rect.height);
  const bottom = Math.max(rect.y, rect.y + rect.height);
  return (
    bounds.left < right &&
    bounds.right > left &&
    bounds.top < bottom &&
    bounds.bottom > top
  );
}
