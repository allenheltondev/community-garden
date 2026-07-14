import { describe, expect, it } from 'vitest';
import { boundsOfWorld, resolveAlignment, type WorldBounds } from './alignment';

const box = (minX: number, minY: number, maxX: number, maxY: number): WorldBounds => ({
  minX,
  minY,
  maxX,
  maxY,
});

describe('boundsOfWorld', () => {
  it('reduces a footprint to its axis-aligned world bounds', () => {
    expect(
      boundsOfWorld([
        { x: 10, y: 5 },
        { x: 40, y: 5 },
        { x: 40, y: 25 },
        { x: 10, y: 25 },
      ])
    ).toEqual({ minX: 10, minY: 5, maxX: 40, maxY: 25 });
  });
});

describe('resolveAlignment', () => {
  it('snaps a left edge onto a neighbor’s left edge within the threshold', () => {
    // Moving left edge at 12; target left edge at 10 → nudge left by 2.
    const moving = box(12, 100, 60, 140);
    const target = box(10, 0, 70, 40);
    const { dx, dy, guides } = resolveAlignment(moving, [target]);
    expect(dx).toBe(-2);
    expect(dy).toBe(0);
    expect(guides).toHaveLength(1);
    expect(guides[0].axis).toBe('x');
    expect(guides[0].x1).toBe(10);
    expect(guides[0].x2).toBe(10);
  });

  it('snaps centers on both axes and emits a guide per axis', () => {
    // Moving center (30,30); target center (33,33) → nudge (+3,+3).
    const moving = box(10, 10, 50, 50);
    const target = box(13, 13, 53, 53);
    const { dx, dy, guides } = resolveAlignment(moving, [target]);
    expect(dx).toBe(3);
    expect(dy).toBe(3);
    expect(guides.map((g) => g.axis).sort()).toEqual(['x', 'y']);
  });

  it('ignores edges beyond the threshold', () => {
    const moving = box(0, 0, 40, 40);
    const target = box(100, 100, 140, 140);
    const { dx, dy, guides } = resolveAlignment(moving, [target]);
    expect(dx).toBe(0);
    expect(dy).toBe(0);
    expect(guides).toHaveLength(0);
  });

  it('prefers the closest of several candidate edges', () => {
    const moving = box(20, 0, 60, 40);
    // Two targets: one 5 away, one 1 away → the 1-away wins.
    const near = box(21, 0, 61, 40);
    const far = box(25, 0, 65, 40);
    const { dx } = resolveAlignment(moving, [far, near]);
    expect(dx).toBe(1);
  });
});
