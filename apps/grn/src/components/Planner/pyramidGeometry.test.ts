import { describe, expect, it } from 'vitest';
import type { PyramidTier } from '../CropPlanner/gardenPyramid';
import {
  ALL_TIERS,
  BAND_WIDTHS,
  BASE_Y,
  CENTER_X,
  RELIEF,
  SHOULDER_CAPACITY,
  bandRect,
  lawnRing,
  ledgeQuads,
  pyramidMetrics,
  showcaseCapacity,
  sideQuad,
  standPoints,
} from './pyramidGeometry';

describe('bandRect', () => {
  it('keeps every band centered on the pyramid axis', () => {
    for (const level of ALL_TIERS) {
      const band = bandRect(level);
      expect(band.x + band.w / 2).toBeCloseTo(CENTER_X);
      expect(band.w).toBe(BAND_WIDTHS[level]);
    }
  });

  it('stacks bands bottom-up into a triangle silhouette', () => {
    const base = bandRect(1);
    expect(base.y + base.h).toBe(BASE_Y);
    for (let level = 2 as PyramidTier; level <= 5; level += 1) {
      const below = bandRect((level - 1) as PyramidTier);
      const band = bandRect(level as PyramidTier);
      // Each band sits flush on the one beneath it and is narrower.
      expect(band.y + band.h).toBe(below.y);
      expect(band.w).toBeLessThan(below.w);
    }
  });
});

describe('relief quads', () => {
  it('exposes two shoulder ledges on lower bands and one full ledge on top', () => {
    for (const level of ALL_TIERS) {
      const quads = ledgeQuads(level);
      expect(quads).toHaveLength(level === 5 ? 1 : 2);
      for (const quad of quads) {
        expect(quad).toHaveLength(4);
        // The back edge is skewed up-right by the relief offset.
        expect(quad[2].y).toBeCloseTo(quad[1].y - RELIEF.dy);
        expect(quad[2].x).toBeCloseTo(quad[1].x + RELIEF.dx);
      }
    }
  });

  it('builds the side return along the band right edge', () => {
    for (const level of ALL_TIERS) {
      const band = bandRect(level);
      const quad = sideQuad(level);
      expect(quad[0]).toEqual({ x: band.x + band.w, y: band.y });
      expect(quad[3]).toEqual({ x: band.x + band.w, y: band.y + band.h });
    }
  });
});

describe('standPoints', () => {
  it('puts showcased crops along the full band top, inside its width', () => {
    for (const level of ALL_TIERS) {
      const band = bandRect(level);
      const points = standPoints(level, 5, 'full');
      expect(points).toHaveLength(5);
      for (const p of points) {
        expect(p.y).toBe(band.y);
        expect(p.x).toBeGreaterThan(band.x);
        expect(p.x).toBeLessThan(band.x + band.w);
      }
    }
  });

  it('keeps resting crops on the shoulders, clear of the band above', () => {
    for (let level = 1 as PyramidTier; level <= 4; level += 1) {
      const above = bandRect((level + 1) as PyramidTier);
      const points = standPoints(level as PyramidTier, 4, 'shoulders');
      expect(points).toHaveLength(4);
      for (const p of points) {
        const onLeftShoulder = p.x < above.x;
        const onRightShoulder = p.x > above.x + above.w;
        expect(onLeftShoulder || onRightShoulder).toBe(true);
      }
    }
  });

  it('returns nothing for zero crops', () => {
    expect(standPoints(3, 0, 'full')).toEqual([]);
    expect(standPoints(3, 0, 'shoulders')).toEqual([]);
  });
});

describe('capacities', () => {
  it('showcases at least as many crops as the resting shoulders', () => {
    for (const level of ALL_TIERS) {
      // Wider bands hold strictly more; the narrow top band at least
      // matches its resting capacity.
      if (level < 5) {
        expect(showcaseCapacity(level)).toBeGreaterThan(SHOULDER_CAPACITY);
      } else {
        expect(showcaseCapacity(level)).toBeGreaterThanOrEqual(SHOULDER_CAPACITY);
      }
    }
  });

  it('gives wider bands more showcase room', () => {
    expect(showcaseCapacity(1)).toBeGreaterThan(showcaseCapacity(5));
  });
});

describe('scene', () => {
  it('produces a fixed viewBox containing the pyramid and lawn', () => {
    const m = pyramidMetrics();
    const [minX, minY, width, height] = m.viewBox.split(' ').map(Number);
    expect(minX).toBe(0);
    expect(minY).toBe(0);
    const base = bandRect(1);
    expect(width).toBeGreaterThan(base.x + base.w);
    expect(height).toBeGreaterThan(BASE_Y);
  });

  it('draws the lawn wider than the base band', () => {
    const xs = lawnRing().map((p) => p.x);
    const base = bandRect(1);
    expect(Math.min(...xs)).toBeLessThan(base.x);
    expect(Math.max(...xs)).toBeGreaterThan(base.x + base.w);
  });
});
