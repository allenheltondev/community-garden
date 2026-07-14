// Pure geometry for the masterplan's on-scene transform handles.
//
// The transform "box" of any element is its axis-aligned bounding box in
// the element's own (un-rotated) local frame: origin at (positionX,
// positionY), extents lengthInches × widthInches, rotated by rotationDeg
// about that origin — exactly how `rectFootprint` builds bed/annotation
// footprints. Circles and custom polygons share the same box; the box is
// only the resize/rotate frame, while the illustration keeps its shape.
//
// Kept free of React so the resize/rotate math can be unit-tested in
// isolation (jsdom has no getScreenCTM, so the component leans on these).

import type { BedPolygonPoint } from '../../types/listing';
import { rectFootprint, worldCentroid, type WorldPoint } from './iso';

export interface ElementGeometry {
  positionX: number;
  positionY: number;
  lengthInches: number;
  widthInches: number;
  rotationDeg: number;
  /** Present for custom-shape beds; scaled alongside the box on resize. */
  points: BedPolygonPoint[] | null;
}

// Smallest side we let a resize produce, in inches. Keeps a bed from
// collapsing to a zero-area sliver that's impossible to grab again.
export const MIN_SIDE_INCHES = 6;

// The four transform-box corners in world space, ordered
// [top-left, top-right, bottom-right, bottom-left] to match rectFootprint.
export function boxCornersWorld(g: ElementGeometry): WorldPoint[] {
  return rectFootprint({
    x: g.positionX,
    y: g.positionY,
    length: g.lengthInches,
    width: g.widthInches,
    rotationDeg: g.rotationDeg,
  });
}

function rotateVec(x: number, y: number, deg: number): WorldPoint {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

function snapDimension(value: number, snapInches: number): number {
  const rounded =
    snapInches > 0 ? Math.round(value / snapInches) * snapInches : Math.round(value);
  return Math.max(MIN_SIDE_INCHES, rounded);
}

/**
 * Resize by dragging corner `cornerIndex` (0=TL,1=TR,2=BR,3=BL) by a
 * world-space delta. The diagonally-opposite corner stays anchored: the
 * dragged corner and the anchor remain opposite corners of the new box, so
 * the anchor never moves. New length/width come from projecting the
 * (dragged − anchor) vector onto the element's local axes; the new origin
 * is the box's min corner. Custom polygons scale their points to match.
 */
export function resizeFromCornerDrag(
  g0: ElementGeometry,
  cornerIndex: number,
  worldDelta: WorldPoint,
  snapInches = 0
): ElementGeometry {
  const corners = boxCornersWorld(g0);
  const anchor = corners[(cornerIndex + 2) % 4];
  const dragged = corners[cornerIndex];
  const draggedNext = { x: dragged.x + worldDelta.x, y: dragged.y + worldDelta.y };

  const rad = (g0.rotationDeg * Math.PI) / 180;
  const ex = { x: Math.cos(rad), y: Math.sin(rad) }; // local +x in world
  const ey = { x: -Math.sin(rad), y: Math.cos(rad) }; // local +y in world

  const rel = { x: draggedNext.x - anchor.x, y: draggedNext.y - anchor.y };
  const u = rel.x * ex.x + rel.y * ex.y; // signed local-x extent
  const v = rel.x * ey.x + rel.y * ey.y; // signed local-y extent
  const signU = u < 0 ? -1 : 1;
  const signV = v < 0 ? -1 : 1;

  const lengthInches = snapDimension(Math.abs(u), snapInches);
  const widthInches = snapDimension(Math.abs(v), snapInches);

  // Min (origin) corner of the new box: step from the anchor toward the
  // dragged corner only on the axes where the drag headed negative.
  const originX =
    anchor.x + ex.x * (signU < 0 ? -lengthInches : 0) + ey.x * (signV < 0 ? -widthInches : 0);
  const originY =
    anchor.y + ex.y * (signU < 0 ? -lengthInches : 0) + ey.y * (signV < 0 ? -widthInches : 0);

  const scaleX = g0.lengthInches > 0 ? lengthInches / g0.lengthInches : 1;
  const scaleY = g0.widthInches > 0 ? widthInches / g0.widthInches : 1;
  const points =
    g0.points && g0.points.length >= 3
      ? g0.points.map((p) => ({
          x: Math.round(p.x * scaleX),
          y: Math.round(p.y * scaleY),
        }))
      : g0.points;

  // Positions are not clamped to >= 0: doing so would slide the anchored
  // corner and distort the box when an element sits against the origin.
  return {
    positionX: Math.round(originX),
    positionY: Math.round(originY),
    lengthInches,
    widthInches,
    rotationDeg: g0.rotationDeg,
    points,
  };
}

/**
 * Rotate the element by `deltaDeg` about the transform box's center, so the
 * box appears to pivot in place even though rotation is stored about the
 * position origin. `snapDeg` (e.g. 15) quantizes the absolute angle.
 */
export function rotateGeometry(
  g0: ElementGeometry,
  deltaDeg: number,
  snapDeg = 0
): ElementGeometry {
  const half = { x: g0.lengthInches / 2, y: g0.widthInches / 2 };
  const center = worldCentroid(boxCornersWorld(g0));
  let nextRotation = g0.rotationDeg + deltaDeg;
  if (snapDeg > 0) nextRotation = Math.round(nextRotation / snapDeg) * snapDeg;
  const offset = rotateVec(half.x, half.y, nextRotation);
  // Position can go negative so the box pivots exactly about its center.
  return {
    positionX: Math.round(center.x - offset.x),
    positionY: Math.round(center.y - offset.y),
    lengthInches: g0.lengthInches,
    widthInches: g0.widthInches,
    rotationDeg: Math.round(nextRotation),
    points: g0.points,
  };
}

// World angle (degrees) from a pivot to a point — used by the rotate handle
// to turn pointer motion into a rotation delta.
export function angleFromTo(pivot: WorldPoint, point: WorldPoint): number {
  return (Math.atan2(point.y - pivot.y, point.x - pivot.x) * 180) / Math.PI;
}
