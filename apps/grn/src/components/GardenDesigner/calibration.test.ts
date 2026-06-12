import { describe, expect, it } from 'vitest';
import type { GardenAnnotation, GardenBed } from '../../types/listing';
import {
  MAX_CANVAS_INCHES,
  MIN_ANNOTATION_DIMENSION_INCHES,
  MIN_BED_DIMENSION_INCHES,
  MIN_CANVAS_INCHES,
  calibrationFactor,
  formatInchesAsFeet,
  rescaledAnnotationPayload,
  rescaledBedPayload,
  rescaledCanvas,
} from './calibration';

function makeBed(overrides: Partial<GardenBed> = {}): GardenBed {
  return {
    id: 'bed-1',
    userId: 'user-1',
    name: 'Tomato bed',
    description: 'South facing',
    sunExposure: 'full_sun' as GardenBed['sunExposure'],
    soilType: 'loam',
    lengthInches: 96,
    widthInches: 48,
    locationNotes: 'By the fence',
    sortOrder: 3,
    bedType: 'raised',
    shape: 'rect',
    positionX: 120,
    positionY: 60,
    rotationDeg: 15,
    points: null,
    color: '#8a6230',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeAnnotation(overrides: Partial<GardenAnnotation> = {}): GardenAnnotation {
  return {
    id: 'ann-1',
    userId: 'user-1',
    label: 'Shed',
    icon: '🏠',
    shape: 'rect',
    positionX: 200,
    positionY: 100,
    lengthInches: 120,
    widthInches: 96,
    rotationDeg: 0,
    points: null,
    color: '#5e4ea3',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('calibrationFactor', () => {
  it('returns real / drawn for positive inputs', () => {
    expect(calibrationFactor(100, 200)).toBe(2);
    expect(calibrationFactor(200, 100)).toBe(0.5);
    expect(calibrationFactor(96, 96)).toBe(1);
  });

  it('handles fractional drawn lengths from unsnapped clicks', () => {
    expect(calibrationFactor(33.5, 120)).toBeCloseTo(120 / 33.5, 10);
  });

  it('rejects zero, negative, and non-finite inputs', () => {
    expect(calibrationFactor(0, 100)).toBeNull();
    expect(calibrationFactor(100, 0)).toBeNull();
    expect(calibrationFactor(-10, 100)).toBeNull();
    expect(calibrationFactor(100, -10)).toBeNull();
    expect(calibrationFactor(Number.NaN, 100)).toBeNull();
    expect(calibrationFactor(100, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('rescaledCanvas', () => {
  it('multiplies both sides by the factor and rounds to whole inches', () => {
    const result = rescaledCanvas({ widthInches: 480, heightInches: 360 }, 1.5);
    expect(result).toEqual({
      widthInches: 720,
      heightInches: 540,
      effectiveFactor: 1.5,
      clamped: false,
    });
  });

  it('rounds fractional results to the nearest inch', () => {
    const result = rescaledCanvas({ widthInches: 333, heightInches: 251 }, 1.25);
    expect(result.widthInches).toBe(416); // 416.25 -> 416
    expect(result.heightInches).toBe(314); // 313.75 -> 314
    expect(result.clamped).toBe(false);
  });

  it('clamps the factor up so neither side drops below the minimum', () => {
    const result = rescaledCanvas({ widthInches: 480, heightInches: 240 }, 0.1);
    // Requested would be 48 x 24; min side forces factor up to 60/240 = 0.25.
    expect(result.effectiveFactor).toBeCloseTo(0.25, 10);
    expect(result.widthInches).toBe(120);
    expect(result.heightInches).toBe(MIN_CANVAS_INCHES);
    expect(result.clamped).toBe(true);
  });

  it('clamps the factor down so neither side exceeds the maximum', () => {
    const result = rescaledCanvas({ widthInches: 1200, heightInches: 600 }, 10);
    // Requested would be 12000 x 6000; max side forces factor to 6000/1200 = 5.
    expect(result.effectiveFactor).toBe(5);
    expect(result.widthInches).toBe(MAX_CANVAS_INCHES);
    expect(result.heightInches).toBe(3000);
    expect(result.clamped).toBe(true);
  });

  it('preserves the aspect ratio when clamping engages', () => {
    const result = rescaledCanvas({ widthInches: 1000, heightInches: 500 }, 100);
    expect(result.widthInches / result.heightInches).toBeCloseTo(2, 5);
  });

  it('reports clamped=false and effectiveFactor=factor when in range', () => {
    const result = rescaledCanvas({ widthInches: 600, heightInches: 600 }, 2);
    expect(result.effectiveFactor).toBe(2);
    expect(result.clamped).toBe(false);
  });

  it('clamps each side independently when no single factor can satisfy both', () => {
    // Degenerate aspect: 12000 x 24 cannot fit [60, 6000] with one factor.
    const result = rescaledCanvas({ widthInches: 12_000, heightInches: 24 }, 1);
    expect(result.widthInches).toBeLessThanOrEqual(MAX_CANVAS_INCHES);
    expect(result.heightInches).toBeGreaterThanOrEqual(MIN_CANVAS_INCHES);
    expect(result.clamped).toBe(true);
  });
});

describe('rescaledBedPayload', () => {
  it('scales position and dimensions, rounding to whole inches', () => {
    const payload = rescaledBedPayload(makeBed(), 1.5);
    expect(payload.positionX).toBe(180);
    expect(payload.positionY).toBe(90);
    expect(payload.lengthInches).toBe(144);
    expect(payload.widthInches).toBe(72);
  });

  it('rounds fractional scaled values', () => {
    const payload = rescaledBedPayload(
      makeBed({ positionX: 33, lengthInches: 97 }),
      1.1
    );
    expect(payload.positionX).toBe(36); // 36.3 -> 36
    expect(payload.lengthInches).toBe(107); // 106.7 -> 107
  });

  it('scales polygon points by the same factor', () => {
    const payload = rescaledBedPayload(
      makeBed({
        shape: 'polygon',
        points: [
          { x: 0, y: 0 },
          { x: 96, y: 0 },
          { x: 96, y: 48 },
          { x: 33, y: 47 },
        ],
      }),
      0.5
    );
    expect(payload.points).toEqual([
      { x: 0, y: 0 },
      { x: 48, y: 0 },
      { x: 48, y: 24 },
      { x: 17, y: 24 }, // 16.5 -> 17, 23.5 -> 24
    ]);
  });

  it('enforces the 6-inch minimum bed dimension when scaling down hard', () => {
    const payload = rescaledBedPayload(
      makeBed({ lengthInches: 96, widthInches: 48 }),
      0.01
    );
    expect(payload.lengthInches).toBe(MIN_BED_DIMENSION_INCHES);
    expect(payload.widthInches).toBe(MIN_BED_DIMENSION_INCHES);
  });

  it('keeps positions non-negative and preserves null geometry', () => {
    const payload = rescaledBedPayload(
      makeBed({ positionX: null, positionY: 0, lengthInches: null, points: null }),
      2
    );
    expect(payload.positionX).toBeNull();
    expect(payload.positionY).toBe(0);
    expect(payload.lengthInches).toBeNull();
    expect(payload.points).toBeNull();
  });

  it('passes non-geometric fields through untouched', () => {
    const bed = makeBed();
    const payload = rescaledBedPayload(bed, 2);
    expect(payload.name).toBe(bed.name);
    expect(payload.description).toBe(bed.description);
    expect(payload.sunExposure).toBe(bed.sunExposure);
    expect(payload.soilType).toBe(bed.soilType);
    expect(payload.locationNotes).toBe(bed.locationNotes);
    expect(payload.sortOrder).toBe(bed.sortOrder);
    expect(payload.bedType).toBe(bed.bedType);
    expect(payload.shape).toBe(bed.shape);
    expect(payload.rotationDeg).toBe(bed.rotationDeg);
    expect(payload.color).toBe(bed.color);
  });
});

describe('rescaledAnnotationPayload', () => {
  it('scales position, dimensions, and points', () => {
    const payload = rescaledAnnotationPayload(
      makeAnnotation({
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 21 },
        ],
      }),
      2
    );
    expect(payload.positionX).toBe(400);
    expect(payload.positionY).toBe(200);
    expect(payload.lengthInches).toBe(240);
    expect(payload.widthInches).toBe(192);
    expect(payload.points).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 42 },
    ]);
  });

  it('enforces a 1-inch minimum so annotations never collapse to zero', () => {
    const payload = rescaledAnnotationPayload(
      makeAnnotation({ lengthInches: 120, widthInches: 4 }),
      0.001
    );
    expect(payload.lengthInches).toBe(MIN_ANNOTATION_DIMENSION_INCHES);
    expect(payload.widthInches).toBe(MIN_ANNOTATION_DIMENSION_INCHES);
  });

  it('preserves nulls and pass-through fields', () => {
    const annotation = makeAnnotation({ positionX: null, points: null });
    const payload = rescaledAnnotationPayload(annotation, 3);
    expect(payload.positionX).toBeNull();
    expect(payload.points).toBeNull();
    expect(payload.label).toBe(annotation.label);
    expect(payload.icon).toBe(annotation.icon);
    expect(payload.shape).toBe(annotation.shape);
    expect(payload.rotationDeg).toBe(annotation.rotationDeg);
    expect(payload.color).toBe(annotation.color);
    expect(payload.sortOrder).toBe(annotation.sortOrder);
  });
});

describe('formatInchesAsFeet', () => {
  it('formats whole feet without an inches part', () => {
    expect(formatInchesAsFeet(24)).toBe('2 ft');
    expect(formatInchesAsFeet(12)).toBe('1 ft');
  });

  it('formats feet and inches', () => {
    expect(formatInchesAsFeet(150)).toBe('12 ft 6 in');
    expect(formatInchesAsFeet(13)).toBe('1 ft 1 in');
  });

  it('formats sub-foot lengths as inches only', () => {
    expect(formatInchesAsFeet(7)).toBe('7 in');
    expect(formatInchesAsFeet(0)).toBe('0 in');
  });

  it('rounds fractional inches before formatting', () => {
    expect(formatInchesAsFeet(11.6)).toBe('1 ft');
    expect(formatInchesAsFeet(11.4)).toBe('11 in');
    expect(formatInchesAsFeet(23.5)).toBe('2 ft');
  });

  it('treats negative input as zero', () => {
    expect(formatInchesAsFeet(-5)).toBe('0 in');
  });
});
