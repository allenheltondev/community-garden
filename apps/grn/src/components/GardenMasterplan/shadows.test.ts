import { describe, expect, it } from 'vitest';
import type { GardenAnnotation, GardenBed } from '../../types/listing';
import { boundsOf, rectFootprint } from './iso';
import {
  COMPOST_HEIGHT,
  GREENHOUSE_RIDGE,
  MOUND_HEIGHT,
  RAISED_BED_HEIGHT,
  SHADOW_LENGTH_FACTOR,
  SHED_RIDGE,
  TRELLIS_HEIGHT,
  annotationCasterHeight,
  bedCasterHeight,
  bedNoonShadeFraction,
  collectShadowCasters,
  convexHull,
  hasNoonShadeConflict,
  pointInPolygon,
  shadeFraction,
  shadowPolygon,
  sunShadowDir,
} from './shadows';

function makeBed(overrides: Partial<GardenBed>): GardenBed {
  return {
    id: 'bed-1',
    userId: 'u1',
    name: 'Bed',
    description: null,
    sunExposure: 'full_sun',
    soilType: null,
    lengthInches: 96,
    widthInches: 48,
    locationNotes: null,
    sortOrder: 0,
    bedType: 'raised',
    shape: 'rect',
    positionX: 24,
    positionY: 24,
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

describe('sunShadowDir', () => {
  it('points west in the morning and east in the evening (light from the opposite side)', () => {
    expect(sunShadowDir('morning')).toEqual({ x: -1, y: 0 });
    expect(sunShadowDir('evening')).toEqual({ x: 1, y: 0 });
  });

  it('points north-northwest at noon (sun in the south-southeast)', () => {
    const dir = sunShadowDir('noon');
    expect(dir.x).toBeLessThan(0);
    expect(dir.y).toBeLessThan(0);
    // More north than west.
    expect(Math.abs(dir.y)).toBeGreaterThan(Math.abs(dir.x));
  });

  it('always returns a unit vector', () => {
    for (const sun of ['morning', 'noon', 'evening'] as const) {
      expect(Math.hypot(sunShadowDir(sun).x, sunShadowDir(sun).y)).toBeCloseTo(1);
    }
  });

  it('rotates with the canvas north offset', () => {
    const dir = sunShadowDir('morning', 90);
    expect(dir.x).toBeCloseTo(0);
    expect(dir.y).toBeCloseTo(-1);
    expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1);
  });

  it('uses longer shadows at the edges of the day than at noon', () => {
    expect(SHADOW_LENGTH_FACTOR.morning).toBeGreaterThan(SHADOW_LENGTH_FACTOR.noon);
    expect(SHADOW_LENGTH_FACTOR.evening).toBeGreaterThan(SHADOW_LENGTH_FACTOR.noon);
  });
});

describe('convexHull', () => {
  it('drops interior points', () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 },
    ]);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ x: 5, y: 5 });
  });

  it('drops collinear points along an edge', () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
    expect(hull).toHaveLength(4);
  });

  it('passes degenerate inputs through', () => {
    expect(convexHull([])).toEqual([]);
    expect(convexHull([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }]);
  });
});

describe('shadowPolygon', () => {
  it('covers the base footprint and its swept copy', () => {
    const base = rectFootprint({ x: 0, y: 0, length: 20, width: 10 });
    const poly = shadowPolygon(base, 10, { x: -1, y: 0 }, 1.2);
    const b = boundsOf(poly);
    // Base extends x 0..20; swept copy is shifted by -12.
    expect(b.minX).toBeCloseTo(-12);
    expect(b.maxX).toBeCloseTo(20);
    expect(b.minY).toBeCloseTo(0);
    expect(b.maxY).toBeCloseTo(10);
  });

  it('scales its reach with height and length factor', () => {
    const base = rectFootprint({ x: 0, y: 0, length: 20, width: 10 });
    const tall = shadowPolygon(base, 40, { x: 1, y: 0 }, 0.45);
    expect(boundsOf(tall).maxX).toBeCloseTo(20 + 40 * 0.45);
  });
});

describe('caster heights', () => {
  it('uses the renderer heights for beds, skipping flat in-ground beds', () => {
    expect(bedCasterHeight(makeBed({ bedType: 'raised' }))).toBe(RAISED_BED_HEIGHT);
    expect(bedCasterHeight(makeBed({ bedType: 'mound' }))).toBe(MOUND_HEIGHT);
    expect(bedCasterHeight(makeBed({ bedType: 'in_ground' }))).toBeNull();
  });

  it('maps annotation kinds to their rendered heights', () => {
    expect(annotationCasterHeight(makeAnnotation({ icon: '🏚️' }))).toBe(SHED_RIDGE);
    expect(annotationCasterHeight(makeAnnotation({ icon: '🪴' }))).toBe(GREENHOUSE_RIDGE);
    expect(annotationCasterHeight(makeAnnotation({ icon: '🪜' }))).toBe(TRELLIS_HEIGHT);
    expect(annotationCasterHeight(makeAnnotation({ icon: '♻️' }))).toBe(COMPOST_HEIGHT);
    const tree = annotationCasterHeight(makeAnnotation({ icon: '🌳' }));
    expect(tree).toBeGreaterThan(0);
  });

  it('never casts from flat or noisy kinds (paths, ponds, fences, markers)', () => {
    expect(annotationCasterHeight(makeAnnotation({ icon: '🛤️', shape: 'line' }))).toBeNull();
    expect(annotationCasterHeight(makeAnnotation({ icon: '💧' }))).toBeNull();
    expect(annotationCasterHeight(makeAnnotation({ icon: '🚧', shape: 'line' }))).toBeNull();
    expect(annotationCasterHeight(makeAnnotation({ icon: '📍', shape: 'rect' }))).toBeNull();
  });
});

describe('collectShadowCasters', () => {
  it('collects only elements with meaningful height', () => {
    const casters = collectShadowCasters(
      [makeBed({ id: 'raised' }), makeBed({ id: 'flat', bedType: 'in_ground' })],
      [
        makeAnnotation({ id: 'oak' }),
        makeAnnotation({ id: 'walk', icon: '🛤️', shape: 'line' }),
      ]
    );
    expect(casters.map((c) => c.id).sort()).toEqual(['oak', 'raised']);
    for (const caster of casters) {
      expect(caster.height).toBeGreaterThan(0);
      expect(caster.footprint.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('pointInPolygon', () => {
  const square = rectFootprint({ x: 0, y: 0, length: 10, width: 10 });

  it('detects inside and outside points', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: -1, y: -1 }, square)).toBe(false);
  });
});

describe('shadeFraction', () => {
  const bed = rectFootprint({ x: 0, y: 0, length: 48, width: 24 });

  it('is 0 with no shadows and 1 when fully covered', () => {
    expect(shadeFraction(bed, [])).toBe(0);
    const everything = rectFootprint({ x: -100, y: -100, length: 400, width: 400 });
    expect(shadeFraction(bed, [everything])).toBe(1);
  });

  it('is partial for a half-covering shadow', () => {
    const halfShadow = rectFootprint({ x: 0, y: 0, length: 24, width: 24 });
    const fraction = shadeFraction(bed, [halfShadow]);
    expect(fraction).toBeGreaterThan(0.3);
    expect(fraction).toBeLessThan(0.7);
  });
});

describe('noon shade conflict', () => {
  // A tall shed due south of a small bed: its noon shadow (pointing
  // north-northwest) falls across the whole bed.
  const bed = makeBed({
    id: 'sunny',
    positionX: 40,
    positionY: 60,
    lengthInches: 48,
    widthInches: 24,
    sunExposure: 'full_sun',
  });
  const shed = makeAnnotation({
    id: 'shed',
    label: 'Tool shed',
    icon: '🏚️',
    shape: 'rect',
    positionX: 0,
    positionY: 88,
    lengthInches: 160,
    widthInches: 96,
  });

  it('measures the fraction of a bed inside other elements’ noon shadows', () => {
    expect(bedNoonShadeFraction(bed, [bed], [shed])).toBeGreaterThan(0.4);
    expect(bedNoonShadeFraction(bed, [bed], [])).toBe(0);
  });

  it('ignores the bed’s own shadow', () => {
    expect(bedNoonShadeFraction(bed, [bed], [])).toBe(0);
  });

  it('flags only full-sun beds past the threshold', () => {
    expect(hasNoonShadeConflict(bed, 0.5)).toBe(true);
    expect(hasNoonShadeConflict(bed, 0.4)).toBe(false);
    expect(
      hasNoonShadeConflict(makeBed({ sunExposure: 'partial_shade' }), 0.9)
    ).toBe(false);
    expect(hasNoonShadeConflict(makeBed({ sunExposure: null }), 0.9)).toBe(false);
  });
});
