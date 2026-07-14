// Isometric projection and low-poly geometry helpers for the garden
// masterplan view.
//
// World coordinates are inches on the ground plane and match the layout
// editor exactly: x grows east (right), y grows south (down). Screen
// coordinates are SVG pixels in a classic 30° architectural isometric:
// the world origin projects to (0, 0), +x runs down-right, +y runs
// down-left, and +z (height above ground) runs straight up.

import type { BedPolygonPoint } from '../../types/listing';

export interface WorldPoint {
  x: number;
  y: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export const ISO_COS = Math.cos(Math.PI / 6); // ≈ 0.866
export const ISO_SIN = Math.sin(Math.PI / 6); // 0.5

// Ground scale. The masterplan renders the whole property at once, so a
// small scale keeps SVG coordinates (and text sizes) manageable before
// viewport zoom.
export const PX_PER_INCH = 1.6;

// Vertical scale. Slightly flatter than the ground scale so extruded
// objects read as gentle relief rather than towers — closer to the look
// of a landscape architect's axonometric than a video-game world.
export const Z_PER_INCH = 1.15;

export function project(x: number, y: number, z = 0): ScreenPoint {
  return {
    x: (x - y) * ISO_COS * PX_PER_INCH,
    y: (x + y) * ISO_SIN * PX_PER_INCH - z * Z_PER_INCH,
  };
}

export function projectPoint(p: WorldPoint, z = 0): ScreenPoint {
  return project(p.x, p.y, z);
}

// Inverse of project() on the ground plane (z = 0): turns a scene-space SVG
// point back into world inches. Used by the isometric editor to translate
// pointer movement into bed/annotation repositioning. Off the ground plane
// the mapping is ambiguous (a screen point is a whole ray), so this is
// ground-only by design.
export function unprojectGround(screen: ScreenPoint): WorldPoint {
  const u = screen.x / (ISO_COS * PX_PER_INCH); // = x - y
  const v = screen.y / (ISO_SIN * PX_PER_INCH); // = x + y
  return { x: (v + u) / 2, y: (v - u) / 2 };
}

// A scene-space delta (SVG px) translated into a ground-plane world delta
// (inches). project() is linear in (x, y) at z = 0, so a delta maps the
// same way a point does — independent of where the drag started.
export function screenDeltaToWorld(dx: number, dy: number): WorldPoint {
  return unprojectGround({ x: dx, y: dy });
}

export function projectFootprint(points: WorldPoint[], z = 0): ScreenPoint[] {
  return points.map((p) => project(p.x, p.y, z));
}

// --- Footprints -----------------------------------------------------------
// Every element is normalized to a world-space polygon ("footprint") so
// projection, extrusion, shadows, and depth sorting share one code path.
// Rotation semantics match Konva: shapes rotate about their position
// origin (the un-rotated top-left corner).

export function rotateWorld(
  points: WorldPoint[],
  originX: number,
  originY: number,
  rotationDeg: number
): WorldPoint[] {
  if (!rotationDeg) return points;
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return points.map((p) => {
    const dx = p.x - originX;
    const dy = p.y - originY;
    return {
      x: originX + dx * cos - dy * sin,
      y: originY + dx * sin + dy * cos,
    };
  });
}

export function rectFootprint(args: {
  x: number;
  y: number;
  length: number;
  width: number;
  rotationDeg?: number;
}): WorldPoint[] {
  const { x, y, length, width, rotationDeg = 0 } = args;
  const corners: WorldPoint[] = [
    { x, y },
    { x: x + length, y },
    { x: x + length, y: y + width },
    { x, y: y + width },
  ];
  return rotateWorld(corners, x, y, rotationDeg);
}

// Circles/ellipses become low-poly n-gons — on-brand for the flat-shaded
// look, and it lets them share the polygon extrusion path.
export function ellipseFootprint(args: {
  x: number;
  y: number;
  length: number;
  width: number;
  rotationDeg?: number;
  segments?: number;
}): WorldPoint[] {
  const { x, y, length, width, rotationDeg = 0, segments = 20 } = args;
  const cx = x + length / 2;
  const cy = y + width / 2;
  const rx = length / 2;
  const ry = width / 2;
  const points: WorldPoint[] = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
  }
  return rotateWorld(points, x, y, rotationDeg);
}

export function polygonFootprint(args: {
  x: number;
  y: number;
  points: BedPolygonPoint[];
  rotationDeg?: number;
}): WorldPoint[] {
  const { x, y, points, rotationDeg = 0 } = args;
  const translated = points.map((p) => ({ x: x + p.x, y: y + p.y }));
  return rotateWorld(translated, x, y, rotationDeg);
}

export function worldCentroid(points: WorldPoint[]): WorldPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

// Painter's-algorithm key: elements farther "north-west" in the world
// project higher on screen and must paint first. (x + y) of the centroid
// is exactly the screen-y of the projected centroid, so sorting by it
// ascending gives correct near-over-far ordering for non-overlapping
// footprints.
export function depthOf(points: WorldPoint[]): number {
  const c = worldCentroid(points);
  return c.x + c.y;
}

// Approximate inset by pulling each vertex toward the centroid. Exact
// polygon offsetting is overkill for soil-rim effects on convex-ish beds.
export function insetFootprint(points: WorldPoint[], insetInches: number): WorldPoint[] {
  const c = worldCentroid(points);
  return points.map((p) => {
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return p;
    const t = Math.min(0.9, insetInches / dist);
    return { x: p.x + dx * t, y: p.y + dy * t };
  });
}

export function scaleFootprint(points: WorldPoint[], factor: number): WorldPoint[] {
  const c = worldCentroid(points);
  return points.map((p) => ({
    x: c.x + (p.x - c.x) * factor,
    y: c.y + (p.y - c.y) * factor,
  }));
}

// --- Extrusion ------------------------------------------------------------
// A footprint extruded to height h renders as: visible side walls (only
// the camera-facing edges), then the top face. Walls are tagged by which
// way they face so the renderer can flat-shade them as two tones — the
// whole "hand-illustrated axonometric" effect comes from that two-tone
// split plus a lighter top.

export interface ExtrudedWall {
  points: ScreenPoint[];
  facing: 'left' | 'right';
}

export interface ExtrudedShape {
  top: ScreenPoint[];
  base: ScreenPoint[];
  walls: ExtrudedWall[];
}

export function extrude(footprint: WorldPoint[], heightInches: number): ExtrudedShape {
  const top = projectFootprint(footprint, heightInches);
  const base = projectFootprint(footprint, 0);
  const centroid = worldCentroid(footprint);
  const walls: ExtrudedWall[] = [];

  for (let i = 0; i < footprint.length; i += 1) {
    const a = footprint[i];
    const b = footprint[(i + 1) % footprint.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.hypot(dx, dy) < 1e-6) continue;

    // Outward normal: of the two perpendiculars, keep the one pointing
    // away from the centroid so winding order doesn't matter.
    let nx = dy;
    let ny = -dx;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (nx * (mx - centroid.x) + ny * (my - centroid.y) < 0) {
      nx = -nx;
      ny = -ny;
    }

    // The camera looks toward -x/-y, so walls whose outward normal has a
    // positive (x + y) component are visible.
    if (nx + ny <= 1e-6) continue;

    walls.push({
      points: [
        project(a.x, a.y, 0),
        project(b.x, b.y, 0),
        project(b.x, b.y, heightInches),
        project(a.x, a.y, heightInches),
      ],
      facing: nx >= ny ? 'right' : 'left',
    });
  }

  return { top, base, walls };
}

// --- SVG path helpers -------------------------------------------------------

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function toPath(points: ScreenPoint[], closed = true): string {
  if (points.length === 0) return '';
  const segments = points.map(
    (p, i) => `${i === 0 ? 'M' : 'L'}${fmt(p.x)} ${fmt(p.y)}`
  );
  return segments.join(' ') + (closed ? ' Z' : '');
}

// Midpoint-quadratic smoothing turns an angular footprint into the soft
// organic blob used for ponds, canopies, and the ground plate. Each
// vertex becomes the control point of a quadratic segment between the
// midpoints of its adjacent edges.
export function smoothClosedPath(points: ScreenPoint[]): string {
  if (points.length < 3) return toPath(points);
  const mid = (a: ScreenPoint, b: ScreenPoint): ScreenPoint => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const first = mid(points[0], points[1]);
  let d = `M${fmt(first.x)} ${fmt(first.y)}`;
  for (let i = 1; i <= points.length; i += 1) {
    const control = points[i % points.length];
    const next = points[(i + 1) % points.length];
    const m = mid(control, next);
    d += ` Q${fmt(control.x)} ${fmt(control.y)} ${fmt(m.x)} ${fmt(m.y)}`;
  }
  return d + ' Z';
}

export function smoothOpenPath(points: ScreenPoint[]): string {
  if (points.length < 3) return toPath(points, false);
  let d = `M${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const control = points[i];
    const next = points[i + 1];
    const mx = (control.x + next.x) / 2;
    const my = (control.y + next.y) / 2;
    d += ` Q${fmt(control.x)} ${fmt(control.y)} ${fmt(mx)} ${fmt(my)}`;
  }
  const last = points[points.length - 1];
  d += ` L${fmt(last.x)} ${fmt(last.y)}`;
  return d;
}

export interface ScreenBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundsOf(points: ScreenPoint[]): ScreenBounds {
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

// Deterministic per-element variation (canopy hue, fruit placement, …)
// derived from the element id so the map looks organic but never shifts
// between renders.
export function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
