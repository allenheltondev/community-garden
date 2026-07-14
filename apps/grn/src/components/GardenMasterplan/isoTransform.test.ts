import { describe, expect, it } from 'vitest';
import { boxCornersWorld, resizeFromCornerDrag, rotateGeometry } from './isoTransform';
import type { ElementGeometry } from './isoTransform';

const rect: ElementGeometry = {
  positionX: 0,
  positionY: 0,
  lengthInches: 100,
  widthInches: 50,
  rotationDeg: 0,
  points: null,
};

describe('resizeFromCornerDrag', () => {
  it('grows from the bottom-right corner while the top-left stays anchored', () => {
    // Corner 2 is bottom-right; anchor is top-left (0,0).
    const next = resizeFromCornerDrag(rect, 2, { x: 20, y: 10 });
    expect(next.positionX).toBe(0);
    expect(next.positionY).toBe(0);
    expect(next.lengthInches).toBe(120);
    expect(next.widthInches).toBe(60);
  });

  it('drags the top-left corner and keeps the bottom-right anchored', () => {
    // Corner 0 is top-left; anchor is bottom-right (100,50).
    const next = resizeFromCornerDrag(rect, 0, { x: -20, y: -10 });
    expect(next.positionX).toBe(-20);
    expect(next.positionY).toBe(-10);
    expect(next.lengthInches).toBe(120);
    expect(next.widthInches).toBe(60);
    // The anchored bottom-right corner is exactly preserved.
    expect(boxCornersWorld(next)[2]).toEqual({ x: 100, y: 50 });
  });

  it('never shrinks a side below the minimum', () => {
    const next = resizeFromCornerDrag(rect, 2, { x: -1000, y: -1000 });
    expect(next.lengthInches).toBeGreaterThanOrEqual(6);
    expect(next.widthInches).toBeGreaterThanOrEqual(6);
  });

  it('snaps new dimensions to the grid when requested', () => {
    const next = resizeFromCornerDrag(rect, 2, { x: 13, y: 7 }, 12);
    // 100+13=113 → snaps to 108 or 120; 50+7=57 → snaps to 60.
    expect(next.lengthInches % 12).toBe(0);
    expect(next.widthInches % 12).toBe(0);
  });

  it('scales custom polygon points alongside the box', () => {
    const poly: ElementGeometry = {
      ...rect,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 50 },
      ],
    };
    const next = resizeFromCornerDrag(poly, 2, { x: 100, y: 50 }); // double each axis
    expect(next.lengthInches).toBe(200);
    expect(next.widthInches).toBe(100);
    expect(next.points).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 100, y: 100 },
    ]);
  });
});

describe('rotateGeometry', () => {
  it('rotates about the box center so the center stays fixed', () => {
    const centerBefore = boxCornersWorld(rect).reduce(
      (acc, p) => ({ x: acc.x + p.x / 4, y: acc.y + p.y / 4 }),
      { x: 0, y: 0 }
    );
    const next = rotateGeometry(rect, 90);
    expect(next.rotationDeg).toBe(90);
    const centerAfter = boxCornersWorld(next).reduce(
      (acc, p) => ({ x: acc.x + p.x / 4, y: acc.y + p.y / 4 }),
      { x: 0, y: 0 }
    );
    expect(centerAfter.x).toBeCloseTo(centerBefore.x, 5);
    expect(centerAfter.y).toBeCloseTo(centerBefore.y, 5);
  });

  it('quantizes the absolute angle when a snap step is given', () => {
    const next = rotateGeometry({ ...rect, rotationDeg: 2 }, 5, 15);
    // 2 + 5 = 7 → snaps to the nearest 15° → 0.
    expect(next.rotationDeg).toBe(0);
  });
});
