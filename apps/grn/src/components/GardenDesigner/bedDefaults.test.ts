import { describe, expect, it } from 'vitest';
import {
  bedAreaSquareInches,
  defaultRectPolygonPoints,
  ellipsePolygonPoints,
  normalizePolygonGeometry,
} from './bedDefaults';

describe('ellipsePolygonPoints', () => {
  it('produces the requested number of vertices inside the bounding box', () => {
    const points = ellipsePolygonPoints(96, 48);
    expect(points).toHaveLength(12);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(96);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(48);
    }
  });

  it('approximates the ellipse area', () => {
    const points = ellipsePolygonPoints(96, 48);
    const polygonArea = bedAreaSquareInches({
      shape: 'polygon',
      lengthInches: 96,
      widthInches: 48,
      points,
    });
    const ellipseArea = Math.PI * 48 * 24;
    // A 12-gon inscribed in an ellipse covers ~95.5% of its area.
    expect(polygonArea).toBeGreaterThan(ellipseArea * 0.9);
    expect(polygonArea).toBeLessThanOrEqual(ellipseArea);
  });
});

describe('normalizePolygonGeometry', () => {
  it('leaves an already-anchored polygon untouched', () => {
    const points = defaultRectPolygonPoints(96, 48);
    const result = normalizePolygonGeometry({
      positionX: 24,
      positionY: 36,
      rotationDeg: 0,
      points,
    });
    expect(result).toEqual({
      positionX: 24,
      positionY: 36,
      lengthInches: 96,
      widthInches: 48,
      points,
    });
  });

  it('re-anchors drifted points into the position when unrotated', () => {
    const result = normalizePolygonGeometry({
      positionX: 100,
      positionY: 100,
      rotationDeg: 0,
      points: [
        { x: -10, y: 5 },
        { x: 50, y: 5 },
        { x: 50, y: 45 },
        { x: -10, y: 45 },
      ],
    });
    expect(result.positionX).toBe(90);
    expect(result.positionY).toBe(105);
    expect(result.lengthInches).toBe(60);
    expect(result.widthInches).toBe(40);
    expect(result.points).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 40 },
      { x: 0, y: 40 },
    ]);
  });

  it('rotates the anchor offset so a rotated bed stays visually put', () => {
    // At 90°, a local offset of (10, 0) points straight "down" in world
    // space, so the position shifts on Y rather than X.
    const result = normalizePolygonGeometry({
      positionX: 100,
      positionY: 100,
      rotationDeg: 90,
      points: [
        { x: 10, y: 0 },
        { x: 70, y: 0 },
        { x: 70, y: 40 },
        { x: 10, y: 40 },
      ],
    });
    expect(result.positionX).toBe(100);
    expect(result.positionY).toBe(110);
    expect(result.points[0]).toEqual({ x: 0, y: 0 });
    expect(result.lengthInches).toBe(60);
    expect(result.widthInches).toBe(40);
  });

  it('clamps the anchored position at the canvas origin', () => {
    const result = normalizePolygonGeometry({
      positionX: 4,
      positionY: 4,
      rotationDeg: 0,
      points: [
        { x: -12, y: -12 },
        { x: 36, y: -12 },
        { x: 36, y: 36 },
        { x: -12, y: 36 },
      ],
    });
    expect(result.positionX).toBe(0);
    expect(result.positionY).toBe(0);
  });
});
