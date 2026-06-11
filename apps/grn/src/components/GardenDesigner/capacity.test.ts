import { describe, expect, it } from 'vitest';
import type { GardenBed, GrowerCropItem } from '../../types/listing';
import {
  bedCapacitySummary,
  capacityLabel,
  cropFootprintSquareInches,
  estimatePlantsThatFit,
  USABLE_AREA_FRACTION,
} from './capacity';

type BedGeometry = Pick<GardenBed, 'shape' | 'lengthInches' | 'widthInches' | 'points'>;
type CropSpacing = Pick<GrowerCropItem, 'plantCount' | 'spacingInches'>;

// 96×48 rect = 4608 sq in; usable = 4147.2 sq in at the 10% margin.
const rectBed: BedGeometry = {
  shape: 'rect',
  lengthInches: 96,
  widthInches: 48,
  points: null,
};

function crop(overrides: Partial<CropSpacing>): CropSpacing {
  return { plantCount: null, spacingInches: null, ...overrides };
}

describe('cropFootprintSquareInches', () => {
  it('returns spacing squared per plant', () => {
    expect(cropFootprintSquareInches(crop({ spacingInches: 12 }))).toBe(144);
    expect(cropFootprintSquareInches(crop({ spacingInches: 1 }))).toBe(1);
  });

  it('returns null when spacing is unknown', () => {
    expect(cropFootprintSquareInches(crop({ spacingInches: null }))).toBeNull();
  });

  it('treats non-positive spacing as unknown rather than zero-area', () => {
    expect(cropFootprintSquareInches(crop({ spacingInches: 0 }))).toBeNull();
    expect(cropFootprintSquareInches(crop({ spacingInches: -3 }))).toBeNull();
  });
});

describe('bedCapacitySummary', () => {
  it('sums plantCount × spacing² for crops with spacing data', () => {
    const summary = bedCapacitySummary(rectBed, [
      crop({ plantCount: 4, spacingInches: 12 }), // 4 × 144 = 576
      crop({ plantCount: 10, spacingInches: 6 }), // 10 × 36 = 360
    ]);
    expect(summary.usedSquareInches).toBe(936);
    expect(summary.usableSquareInches).toBeCloseTo(4608 * USABLE_AREA_FRACTION);
    expect(summary.utilization).toBeCloseTo(936 / 4147.2);
    expect(summary.knownCrops).toBe(2);
    expect(summary.unknownCrops).toBe(0);
  });

  it('treats a null plantCount as a single plant', () => {
    const summary = bedCapacitySummary(rectBed, [
      crop({ plantCount: null, spacingInches: 24 }),
    ]);
    expect(summary.usedSquareInches).toBe(576);
    expect(summary.knownCrops).toBe(1);
  });

  it('tallies crops without spacing data separately and excludes them from used area', () => {
    const summary = bedCapacitySummary(rectBed, [
      crop({ plantCount: 4, spacingInches: 12 }),
      crop({ plantCount: 9, spacingInches: null }),
      crop({ plantCount: null, spacingInches: null }),
    ]);
    expect(summary.usedSquareInches).toBe(576);
    expect(summary.knownCrops).toBe(1);
    expect(summary.unknownCrops).toBe(2);
    expect(summary.utilization).toBeCloseTo(576 / 4147.2);
  });

  it('returns null utilization when no crop has spacing data', () => {
    const summary = bedCapacitySummary(rectBed, [
      crop({ plantCount: 5, spacingInches: null }),
    ]);
    expect(summary.utilization).toBeNull();
    expect(summary.usedSquareInches).toBe(0);
    expect(summary.knownCrops).toBe(0);
    expect(summary.unknownCrops).toBe(1);
  });

  it('returns null utilization for an empty bed', () => {
    const summary = bedCapacitySummary(rectBed, []);
    expect(summary.utilization).toBeNull();
    expect(summary.usedSquareInches).toBe(0);
  });

  it('returns null utilization when the bed has no usable area', () => {
    const summary = bedCapacitySummary(
      { shape: 'rect', lengthInches: 0, widthInches: 0, points: null },
      [crop({ plantCount: 2, spacingInches: 12 })]
    );
    expect(summary.utilization).toBeNull();
    expect(summary.usableSquareInches).toBe(0);
  });

  it('lets utilization exceed 1 when overplanted', () => {
    const summary = bedCapacitySummary(rectBed, [
      crop({ plantCount: 40, spacingInches: 12 }), // 5760 > 4147.2 usable
    ]);
    expect(summary.utilization).toBeGreaterThan(1);
  });

  it('uses the ellipse formula for circle beds', () => {
    const summary = bedCapacitySummary(
      { shape: 'circle', lengthInches: 48, widthInches: 48, points: null },
      [crop({ plantCount: 1, spacingInches: 12 })]
    );
    const circleArea = Math.PI * 24 * 24;
    expect(summary.usableSquareInches).toBeCloseTo(circleArea * USABLE_AREA_FRACTION);
    expect(summary.utilization).toBeCloseTo(144 / (circleArea * USABLE_AREA_FRACTION));
  });

  it('uses the shoelace area for polygon beds', () => {
    // Right triangle with legs 96 and 48 → area 2304.
    const summary = bedCapacitySummary(
      {
        shape: 'polygon',
        lengthInches: 96,
        widthInches: 48,
        points: [
          { x: 0, y: 0 },
          { x: 96, y: 0 },
          { x: 0, y: 48 },
        ],
      },
      [crop({ plantCount: 1, spacingInches: 12 })]
    );
    expect(summary.usableSquareInches).toBeCloseTo(2304 * USABLE_AREA_FRACTION);
  });
});

describe('capacityLabel', () => {
  function summaryAt(utilization: number | null) {
    return {
      usedSquareInches: 0,
      usableSquareInches: 100,
      utilization,
      knownCrops: utilization === null ? 0 : 1,
      unknownCrops: 0,
    };
  }

  it('maps utilization bands to friendly labels', () => {
    expect(capacityLabel(summaryAt(0))).toBe('Room for more');
    expect(capacityLabel(summaryAt(0.69))).toBe('Room for more');
    expect(capacityLabel(summaryAt(0.7))).toBe('Nicely full');
    expect(capacityLabel(summaryAt(1.0))).toBe('Nicely full');
    expect(capacityLabel(summaryAt(1.01))).toBe('Overplanted');
    expect(capacityLabel(summaryAt(2.5))).toBe('Overplanted');
  });

  it('returns null when utilization is unknown', () => {
    expect(capacityLabel(summaryAt(null))).toBeNull();
  });
});

describe('estimatePlantsThatFit', () => {
  it('floors usable area divided by the spacing footprint', () => {
    // 4147.2 usable / 144 = 28.8 → 28 plants.
    expect(estimatePlantsThatFit(rectBed, 12)).toBe(28);
  });

  it('returns 0 for non-positive spacing', () => {
    expect(estimatePlantsThatFit(rectBed, 0)).toBe(0);
    expect(estimatePlantsThatFit(rectBed, -6)).toBe(0);
  });

  it('returns 0 when the bed has no area', () => {
    expect(
      estimatePlantsThatFit(
        { shape: 'rect', lengthInches: 0, widthInches: 0, points: null },
        12
      )
    ).toBe(0);
  });
});
