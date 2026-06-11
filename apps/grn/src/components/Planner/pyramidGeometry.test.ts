import { describe, expect, it } from 'vitest';
import { Z_PER_INCH } from '../GardenMasterplan/iso';
import type { PyramidTier } from '../CropPlanner/gardenPyramid';
import {
  LEDGE,
  STEP_HEIGHT,
  TIER_SIDES,
  ledgeAnchors,
  ledgeCapacity,
  pyramidMetrics,
  tierBaseZ,
  tierFootprint,
  tierTopZ,
  tierWalls,
} from './pyramidGeometry';

const ALL_TIERS: PyramidTier[] = [1, 2, 3, 4, 5];

describe('tier dimensions', () => {
  it('shrinks each tier by one ledge per side', () => {
    for (let level = 2 as PyramidTier; level <= 5; level += 1) {
      expect(TIER_SIDES[level as PyramidTier]).toBe(
        TIER_SIDES[(level - 1) as PyramidTier] - LEDGE * 2
      );
    }
  });

  it('stacks tiers one step apart', () => {
    for (const level of ALL_TIERS) {
      expect(tierBaseZ(level)).toBe((level - 1) * STEP_HEIGHT);
      expect(tierTopZ(level)).toBe(level * STEP_HEIGHT);
    }
  });

  it('centers every footprint on the pyramid axis', () => {
    for (const level of ALL_TIERS) {
      const fp = tierFootprint(level);
      const cx = fp.reduce((s, p) => s + p.x, 0) / fp.length;
      const cy = fp.reduce((s, p) => s + p.y, 0) / fp.length;
      expect(cx).toBeCloseTo(0);
      expect(cy).toBeCloseTo(0);
    }
  });
});

describe('tierWalls', () => {
  it('builds two quads spanning exactly one step of height', () => {
    for (const level of ALL_TIERS) {
      const walls = tierWalls(level);
      for (const quad of [walls.right, walls.left]) {
        expect(quad).toHaveLength(4);
        // Top corners sit one step above their base counterparts.
        expect(quad[3].y).toBeCloseTo(quad[0].y - STEP_HEIGHT * Z_PER_INCH);
        expect(quad[2].y).toBeCloseTo(quad[1].y - STEP_HEIGHT * Z_PER_INCH);
      }
    }
  });
});

describe('ledgeAnchors', () => {
  it('returns the requested number of anchors inside the tier footprint', () => {
    for (const level of ALL_TIERS) {
      const half = TIER_SIDES[level] / 2;
      const anchors = ledgeAnchors(level, 5);
      expect(anchors).toHaveLength(5);
      for (const a of anchors) {
        expect(Math.abs(a.x)).toBeLessThanOrEqual(half);
        expect(Math.abs(a.y)).toBeLessThanOrEqual(half);
      }
    }
  });

  it('orders anchors back-to-front for billboard painting', () => {
    const anchors = ledgeAnchors(1, 6);
    for (let i = 1; i < anchors.length; i += 1) {
      expect(anchors[i].x + anchors[i].y).toBeGreaterThanOrEqual(
        anchors[i - 1].x + anchors[i - 1].y
      );
    }
  });

  it('returns nothing for zero crops', () => {
    expect(ledgeAnchors(3, 0)).toEqual([]);
  });
});

describe('ledgeCapacity', () => {
  it('never shrinks below 2 or above 6 and narrows with the tiers', () => {
    let previous = Infinity;
    for (const level of ALL_TIERS) {
      const capacity = ledgeCapacity(level);
      expect(capacity).toBeGreaterThanOrEqual(2);
      expect(capacity).toBeLessThanOrEqual(6);
      expect(capacity).toBeLessThanOrEqual(previous);
      previous = capacity;
    }
  });
});

describe('pyramidMetrics', () => {
  it('produces a viewBox that contains the base footprint', () => {
    const m = pyramidMetrics();
    const [minX, minY, width, height] = m.viewBox.split(' ').map(Number);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    expect(minX).toBeLessThan(0);
    expect(minY).toBeLessThan(0);
    expect(m.labelColumnX).toBeGreaterThan(minX);
  });
});
