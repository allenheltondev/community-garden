import { describe, expect, it } from 'vitest';
import { snapToNeighbors } from './alignment';

const neighbor = { left: 100, top: 50, right: 196, bottom: 98 }; // 96×48 at (100,50)

describe('snapToNeighbors', () => {
  it('snaps a left edge to a neighbor left edge within tolerance', () => {
    const result = snapToNeighbors({
      x: 101.5,
      y: 200,
      width: 96,
      height: 48,
      neighbors: [neighbor],
    });
    expect(result.x).toBe(100);
    expect(result.y).toBe(200);
    expect(result.guides).toEqual([{ orientation: 'vertical', position: 100 }]);
  });

  it('snaps centers to centers', () => {
    // Neighbor centerX = 148. Dragged width 40 -> center at x+20.
    const result = snapToNeighbors({
      x: 127,
      y: 300,
      width: 40,
      height: 40,
      neighbors: [neighbor],
    });
    expect(result.x).toBe(128);
    expect(result.guides[0]).toEqual({ orientation: 'vertical', position: 148 });
  });

  it('snaps both axes independently', () => {
    const result = snapToNeighbors({
      x: 197.4, // right-edge adjacency: dragged left to neighbor right (196)
      y: 49,
      width: 96,
      height: 48,
      neighbors: [neighbor],
    });
    expect(result.x).toBe(196);
    expect(result.y).toBe(50);
    expect(result.guides).toHaveLength(2);
  });

  it('leaves position untouched outside tolerance', () => {
    const result = snapToNeighbors({
      x: 110,
      y: 200,
      width: 96,
      height: 48,
      neighbors: [neighbor],
    });
    expect(result.x).toBe(110);
    expect(result.guides).toHaveLength(0);
  });

  it('prefers the closest line when several are in range', () => {
    const result = snapToNeighbors({
      x: 99,
      y: 200,
      width: 96,
      height: 48,
      neighbors: [neighbor, { left: 97, top: 0, right: 145, bottom: 20 }],
    });
    // 97 is 2 away, 100 is 1 away -> 100 wins.
    expect(result.x).toBe(100);
    expect(result.guides[0].position).toBe(100);
  });

  it('handles no neighbors', () => {
    const result = snapToNeighbors({
      x: 10,
      y: 10,
      width: 96,
      height: 48,
      neighbors: [],
    });
    expect(result).toEqual({ x: 10, y: 10, guides: [] });
  });
});

import { marqueeIntersects } from './alignment';

describe('marqueeIntersects', () => {
  const bounds = { left: 100, top: 50, right: 196, bottom: 98 };

  it('hits overlapping rects and respects negative drag direction', () => {
    expect(marqueeIntersects({ x: 90, y: 40, width: 50, height: 20 }, bounds)).toBe(true);
    expect(marqueeIntersects({ x: 140, y: 60, width: -50, height: -20 }, bounds)).toBe(true);
  });

  it('misses disjoint rects and edge-touching rects', () => {
    expect(marqueeIntersects({ x: 0, y: 0, width: 50, height: 20 }, bounds)).toBe(false);
    expect(marqueeIntersects({ x: 0, y: 0, width: 100, height: 50 }, bounds)).toBe(false);
  });
});
