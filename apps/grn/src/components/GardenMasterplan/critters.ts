// Ambient critter selection + routing for the masterplan.
//
// Purely decorative: the scene shows at most two critters, chosen
// deterministically from what the garden actually contains (a chicken
// needs a coop, pollinators need planted beds, a rabbit just needs a
// garden to lope around). Routes are world-space waypoint loops; the
// renderer projects and smooths them. Everything here is seeded through
// hashSeed so a given garden always hosts the same residents — this
// module stays component-free and unit-testable.

import type {
  GardenAnnotation,
  GardenBed,
  GardenCanvas,
  GrowerCropItem,
} from '../../types/listing';
import { annotationFootprint, bedFootprint } from './footprints';
import { hashSeed, worldCentroid, type WorldPoint } from './iso';
import { annotationKind } from './palette';
import { IN_GROUND_BED_HEIGHT, MOUND_HEIGHT, RAISED_BED_HEIGHT } from './shadows';

export type CritterKind = 'rabbit' | 'bee' | 'butterfly' | 'chicken';

export interface Critter {
  kind: CritterKind;
  /** Looping route in world inches; the renderer closes the loop. */
  waypoints: WorldPoint[];
  /** Travel height above the ground plane (0 for ground critters). */
  heightInches: number;
  durationSeconds: number;
}

export interface ChooseCrittersArgs {
  canvas: Pick<GardenCanvas, 'widthInches' | 'heightInches'>;
  beds: GardenBed[];
  annotations: GardenAnnotation[];
  cropsByBedId: Map<string, GrowerCropItem[]>;
  seed: string;
}

interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function worldBoundsOf(points: WorldPoint[]): WorldBounds {
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

function seededDuration(seed: string, min: number, max: number): number {
  return Math.round((min + hashSeed(seed) * (max - min)) * 10) / 10;
}

// Small pecking loop just south of the coop — "in front" in this
// isometric view means toward the camera (south-east).
function chickenRoute(coop: GardenAnnotation, seed: string): WorldPoint[] {
  const footprint = annotationFootprint(coop);
  const c = worldCentroid(footprint);
  const b = worldBoundsOf(footprint);
  const cx = c.x + (hashSeed(`${seed}:cx`) - 0.5) * 14;
  const cy = b.maxY + 14 + hashSeed(`${seed}:cy`) * 10;
  const rx = 16 + hashSeed(`${seed}:rx`) * 8;
  const ry = 9 + hashSeed(`${seed}:ry`) * 5;
  const points: WorldPoint[] = [];
  const n = 6;
  for (let i = 0; i < n; i += 1) {
    const angle = (i / n) * Math.PI * 2;
    const wobble = 1 + (hashSeed(`${seed}:w${i}`) - 0.5) * 0.4;
    points.push({
      x: cx + Math.cos(angle) * rx * wobble,
      y: cy + Math.sin(angle) * ry * wobble,
    });
  }
  return points;
}

function bedSurfaceHeight(bed: GardenBed): number {
  switch (bed.bedType) {
    case 'raised':
      return RAISED_BED_HEIGHT;
    case 'mound':
      return MOUND_HEIGHT;
    default:
      return IN_GROUND_BED_HEIGHT;
  }
}

// Pollinator circuit: 2–4 planted bed centroids with a meandering
// midpoint between each pair so the flight reads as a wander, not a bus
// route. Cruise altitude sits a hand above the tallest visited surface.
function flyerRoute(
  planted: GardenBed[],
  seed: string
): { waypoints: WorldPoint[]; heightInches: number } {
  const count = Math.max(
    1,
    Math.min(planted.length, 2 + Math.floor(hashSeed(`${seed}:n`) * 3))
  );
  const start = Math.floor(hashSeed(`${seed}:s`) * planted.length) % planted.length;
  const visited: GardenBed[] = [];
  for (let i = 0; i < count; i += 1) {
    visited.push(planted[(start + i) % planted.length]);
  }
  const stops = visited.map((bed) => worldCentroid(bedFootprint(bed)));
  const heightInches =
    Math.max(...visited.map(bedSurfaceHeight)) + 6 + hashSeed(`${seed}:h`) * 4;

  if (stops.length === 1) {
    // Lone planted bed: hover a lazy hexagon around its centroid.
    const c = stops[0];
    const r = 18 + hashSeed(`${seed}:r`) * 10;
    const ring: WorldPoint[] = [];
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2;
      ring.push({ x: c.x + Math.cos(angle) * r, y: c.y + Math.sin(angle) * r * 0.7 });
    }
    return { waypoints: ring, heightInches };
  }

  const waypoints: WorldPoint[] = [];
  for (let i = 0; i < stops.length; i += 1) {
    const a = stops[i];
    const b = stops[(i + 1) % stops.length];
    waypoints.push(a);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const offset = (hashSeed(`${seed}:m${i}`) - 0.5) * Math.min(60, len * 0.6);
    waypoints.push({
      x: (a.x + b.x) / 2 + (-dy / len) * offset,
      y: (a.y + b.y) / 2 + (dx / len) * offset,
    });
  }
  return { waypoints, heightInches };
}

// How far rabbit hop points keep away from bed edges (inches).
const RABBIT_CLEARANCE = 24;

// Hop circuit around the open lawn margin, skipping stretches that run
// through (or hug) a bed footprint.
function rabbitRoute(
  canvas: Pick<GardenCanvas, 'widthInches' | 'heightInches'>,
  beds: GardenBed[],
  seed: string
): WorldPoint[] {
  const w = canvas.widthInches;
  const h = canvas.heightInches;
  const inset = Math.max(10, Math.min(w, h) * 0.08);
  const step = Math.max(30, Math.min(w, h) / 6);
  const jitter = (i: number) => (hashSeed(`${seed}:j${i}`) - 0.5) * inset * 0.8;

  const ring: WorldPoint[] = [];
  for (let x = inset; x < w - inset; x += step) {
    ring.push({ x, y: inset + jitter(ring.length) });
  }
  for (let y = inset; y < h - inset; y += step) {
    ring.push({ x: w - inset + jitter(ring.length), y });
  }
  for (let x = w - inset; x > inset; x -= step) {
    ring.push({ x, y: h - inset + jitter(ring.length) });
  }
  for (let y = h - inset; y > inset; y -= step) {
    ring.push({ x: inset + jitter(ring.length), y });
  }

  const keepOut = beds.map((bed) => {
    const b = worldBoundsOf(bedFootprint(bed));
    return {
      minX: b.minX - RABBIT_CLEARANCE,
      minY: b.minY - RABBIT_CLEARANCE,
      maxX: b.maxX + RABBIT_CLEARANCE,
      maxY: b.maxY + RABBIT_CLEARANCE,
    };
  });
  const clear = ring.filter(
    (p) =>
      !keepOut.some(
        (b) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY
      )
  );
  // A wall-to-wall garden can swallow the whole margin; better an
  // occasional overlap than a rabbit with nowhere to go.
  const route = clear.length >= 4 ? clear : ring;
  const start = Math.floor(hashSeed(`${seed}:start`) * route.length) % route.length;
  return route.map((_, i) => route[(start + i) % route.length]);
}

/**
 * Pick at most two ambient critters for a garden: one flyer (bee or
 * butterfly, seed's choice) when any bed is planted, plus one ground
 * critter — a chicken if there's a coop to belong to, otherwise a
 * rabbit. An empty garden hosts no one.
 */
export function chooseCritters({
  canvas,
  beds,
  annotations,
  cropsByBedId,
  seed,
}: ChooseCrittersArgs): Critter[] {
  if (beds.length === 0 && annotations.length === 0) return [];

  const coop = annotations.find((a) => annotationKind(a) === 'coop');
  const planted = beds.filter((bed) => (cropsByBedId.get(bed.id) ?? []).length > 0);

  const critters: Critter[] = [];
  if (planted.length > 0) {
    const kind: CritterKind = hashSeed(`${seed}:flyer`) < 0.5 ? 'bee' : 'butterfly';
    const route = flyerRoute(planted, `${seed}:${kind}`);
    critters.push({
      kind,
      waypoints: route.waypoints,
      heightInches: route.heightInches,
      durationSeconds: seededDuration(`${seed}:${kind}:dur`, 25, 45),
    });
  }

  const ground: Critter[] = [];
  if (coop) {
    ground.push({
      kind: 'chicken',
      waypoints: chickenRoute(coop, `${seed}:chicken`),
      heightInches: 0,
      durationSeconds: seededDuration(`${seed}:chicken:dur`, 28, 45),
    });
  }
  ground.push({
    kind: 'rabbit',
    waypoints: rabbitRoute(canvas, beds, `${seed}:rabbit`),
    heightInches: 0,
    durationSeconds: seededDuration(`${seed}:rabbit:dur`, 40, 60),
  });

  for (const critter of ground) {
    if (critters.length >= 2) break;
    critters.push(critter);
  }
  return critters;
}
