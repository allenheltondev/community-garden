import { describe, expect, it } from 'vitest';
import type {
  GardenAnnotation,
  GardenBed,
  GrowerCropItem,
} from '../../types/listing';
import { annotationFootprint, bedFootprint } from './footprints';
import { worldCentroid } from './iso';
import { chooseCritters, dwellTimeline, type Critter } from './critters';

const canvas = { widthInches: 360, heightInches: 240 };

function makeBed(overrides: Partial<GardenBed>): GardenBed {
  return {
    id: 'bed-1',
    userId: 'u1',
    name: 'Herb spiral',
    description: null,
    sunExposure: 'full_sun',
    soilType: 'loam',
    lengthInches: 96,
    widthInches: 48,
    locationNotes: null,
    sortOrder: 0,
    bedType: 'raised',
    shape: 'rect',
    positionX: 120,
    positionY: 96,
    rotationDeg: 0,
    points: null,
    color: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeAnnotation(overrides: Partial<GardenAnnotation>): GardenAnnotation {
  return {
    id: 'ann-1',
    userId: 'u1',
    label: 'Old oak',
    icon: '🌳',
    shape: 'circle',
    positionX: 200,
    positionY: 60,
    lengthInches: 60,
    widthInches: 60,
    rotationDeg: 0,
    points: null,
    color: null,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeCrop(bedId: string, id = `crop-${bedId}`): GrowerCropItem {
  return {
    id,
    userId: 'u1',
    canonicalId: null,
    cropName: 'Tomato',
    varietyId: null,
    status: 'active',
    visibility: 'private',
    surplusEnabled: false,
    nickname: null,
    defaultUnit: null,
    notes: null,
    bedId,
    bedName: 'Herb spiral',
    plantingDate: null,
    expectedHarvestDate: null,
    plantCount: 4,
    spacingInches: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function cropsFor(...bedIds: string[]): Map<string, GrowerCropItem[]> {
  return new Map(bedIds.map((id) => [id, [makeCrop(id)]]));
}

const coop = makeAnnotation({ id: 'coop-1', label: 'Chicken coop', icon: '🐔', shape: 'rect' });

function kinds(critters: Critter[]): string[] {
  return critters.map((c) => c.kind);
}

describe('chooseCritters', () => {
  it('returns no critters for an empty garden', () => {
    expect(
      chooseCritters({ canvas, beds: [], annotations: [], cropsByBedId: new Map(), seed: 's' })
    ).toEqual([]);
  });

  it('never exceeds two critters and never repeats a kind', () => {
    for (const seed of ['a', 'b', 'c', 'garden-42']) {
      const critters = chooseCritters({
        canvas,
        beds: [makeBed({}), makeBed({ id: 'bed-2', positionX: 240 })],
        annotations: [coop],
        cropsByBedId: cropsFor('bed-1', 'bed-2'),
        seed,
      });
      expect(critters.length).toBeLessThanOrEqual(2);
      expect(new Set(kinds(critters)).size).toBe(critters.length);
    }
  });

  it('is deterministic for the same garden and seed', () => {
    const args = {
      canvas,
      beds: [makeBed({})],
      annotations: [coop],
      cropsByBedId: cropsFor('bed-1'),
      seed: 'stable',
    };
    expect(chooseCritters(args)).toEqual(chooseCritters(args));
  });

  it('pairs one flyer with one ground critter when both are possible', () => {
    const critters = chooseCritters({
      canvas,
      beds: [makeBed({})],
      annotations: [coop],
      cropsByBedId: cropsFor('bed-1'),
      seed: 's',
    });
    expect(critters).toHaveLength(2);
    expect(kinds(critters).filter((k) => k === 'bee' || k === 'butterfly')).toHaveLength(1);
    expect(kinds(critters)).toContain('chicken');
  });

  it('only fields a chicken when the garden has a coop', () => {
    const without = chooseCritters({
      canvas,
      beds: [makeBed({})],
      annotations: [makeAnnotation({})],
      cropsByBedId: cropsFor('bed-1'),
      seed: 's',
    });
    expect(kinds(without)).not.toContain('chicken');
    expect(kinds(without)).toContain('rabbit');
  });

  it('pecks its chicken loop in front of (south of) the coop', () => {
    const critters = chooseCritters({
      canvas,
      beds: [],
      annotations: [coop],
      cropsByBedId: new Map(),
      seed: 's',
    });
    const chicken = critters.find((c) => c.kind === 'chicken');
    expect(chicken).toBeDefined();
    expect(chicken!.heightInches).toBe(0);
    const footprint = annotationFootprint(coop);
    const front = Math.max(...footprint.map((p) => p.y));
    const center = worldCentroid(footprint);
    for (const p of chicken!.waypoints) {
      expect(p.y).toBeGreaterThan(front);
      expect(Math.abs(p.x - center.x)).toBeLessThan(80);
    }
  });

  it('only fields pollinators when at least one bed is planted', () => {
    const critters = chooseCritters({
      canvas,
      beds: [makeBed({})],
      annotations: [],
      cropsByBedId: new Map(),
      seed: 's',
    });
    expect(kinds(critters)).toEqual(['rabbit']);
  });

  it('routes the flyer through planted bed centroids above the bed surface', () => {
    const beds = [
      makeBed({ id: 'bed-1', positionX: 24, positionY: 24 }),
      makeBed({ id: 'bed-2', positionX: 220, positionY: 60 }),
      makeBed({ id: 'bed-3', positionX: 120, positionY: 160 }),
    ];
    const critters = chooseCritters({
      canvas,
      beds,
      annotations: [],
      cropsByBedId: cropsFor('bed-1', 'bed-2', 'bed-3'),
      seed: 's',
    });
    const flyer = critters.find((c) => c.kind === 'bee' || c.kind === 'butterfly');
    expect(flyer).toBeDefined();
    // Raised beds are 11" tall; cruise altitude is surface +6–10".
    expect(flyer!.heightInches).toBeGreaterThanOrEqual(17);
    expect(flyer!.heightInches).toBeLessThanOrEqual(21);
    const centroids = beds.map((bed) => worldCentroid(bedFootprint(bed)));
    const stopCount = flyer!.waypoints.filter((p) =>
      centroids.some((c) => Math.abs(c.x - p.x) < 0.01 && Math.abs(c.y - p.y) < 0.01)
    ).length;
    expect(stopCount).toBeGreaterThanOrEqual(2);
    expect(stopCount).toBeLessThanOrEqual(4);
  });

  it('keeps the rabbit on the lawn margins, clear of bed footprints', () => {
    const bed = makeBed({ positionX: 140, positionY: 90 });
    const critters = chooseCritters({
      canvas,
      beds: [bed],
      annotations: [],
      cropsByBedId: new Map(),
      seed: 's',
    });
    const rabbit = critters.find((c) => c.kind === 'rabbit');
    expect(rabbit).toBeDefined();
    expect(rabbit!.heightInches).toBe(0);
    expect(rabbit!.waypoints.length).toBeGreaterThanOrEqual(4);
    const footprint = bedFootprint(bed);
    const minX = Math.min(...footprint.map((p) => p.x)) - 12;
    const maxX = Math.max(...footprint.map((p) => p.x)) + 12;
    const minY = Math.min(...footprint.map((p) => p.y)) - 12;
    const maxY = Math.max(...footprint.map((p) => p.y)) + 12;
    for (const p of rabbit!.waypoints) {
      const insideBed = p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
      expect(insideBed).toBe(false);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(canvas.widthInches);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(canvas.heightInches);
    }
  });

  it('gives ground critters a stop-and-go motion timeline but leaves flyers cruising', () => {
    const critters = chooseCritters({
      canvas,
      beds: [makeBed({})],
      annotations: [coop],
      cropsByBedId: cropsFor('bed-1'),
      seed: 's',
    });
    const chicken = critters.find((c) => c.kind === 'chicken');
    const flyer = critters.find((c) => c.kind === 'bee' || c.kind === 'butterfly');
    expect(chicken?.motion).toBeDefined();
    expect(flyer?.motion).toBeUndefined();
  });

  it('runs the rabbit on a longer, more relaxed loop than the flyers', () => {
    const critters = chooseCritters({
      canvas,
      beds: [makeBed({})],
      annotations: [],
      cropsByBedId: new Map(),
      seed: 'paced',
    });
    const rabbit = critters.find((c) => c.kind === 'rabbit');
    expect(rabbit?.motion).toBeDefined();
    // The relaxed loop runs well past the old 40–60s ceiling.
    expect(rabbit!.durationSeconds).toBeGreaterThanOrEqual(64);
    expect(rabbit!.durationSeconds).toBeLessThanOrEqual(92);
  });

  it('keeps every flyer and chicken duration in the ambient 25–60s band', () => {
    const critters = chooseCritters({
      canvas,
      beds: [makeBed({})],
      annotations: [coop],
      cropsByBedId: cropsFor('bed-1'),
      seed: 's',
    });
    for (const critter of critters) {
      expect(critter.durationSeconds).toBeGreaterThanOrEqual(25);
      expect(critter.durationSeconds).toBeLessThanOrEqual(60);
    }
  });
});

describe('dwellTimeline', () => {
  it('returns null when there are too few stops to form a loop', () => {
    expect(dwellTimeline(1, 's')).toBeNull();
    expect(dwellTimeline(0, 's')).toBeNull();
  });

  it('produces matched keyPoints/keyTimes that span the whole loop', () => {
    const timeline = dwellTimeline(6, 'loop');
    expect(timeline).not.toBeNull();
    const points = timeline!.keyPoints.split(';').map(Number);
    const times = timeline!.keyTimes.split(';').map(Number);
    expect(points.length).toBe(times.length);
    expect(points[0]).toBe(0);
    expect(points[points.length - 1]).toBe(1);
    expect(times[0]).toBe(0);
    expect(times[times.length - 1]).toBe(1);
  });

  it('keeps keyTimes monotonically non-decreasing', () => {
    const timeline = dwellTimeline(8, 'mono')!;
    const times = timeline.keyTimes.split(';').map(Number);
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }
  });

  it('holds a keyPoint across two keyTimes so the critter actually pauses', () => {
    const timeline = dwellTimeline(7, 'pause')!;
    const points = timeline.keyPoints.split(';');
    const held = points.some((p, i) => i > 0 && p === points[i - 1]);
    expect(held).toBe(true);
  });

  it('is deterministic for the same stop count and seed', () => {
    expect(dwellTimeline(5, 'same')).toEqual(dwellTimeline(5, 'same'));
  });
});
