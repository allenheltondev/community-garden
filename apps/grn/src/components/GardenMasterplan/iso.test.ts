import { describe, expect, it } from 'vitest';
import {
  ISO_COS,
  ISO_SIN,
  PX_PER_INCH,
  Z_PER_INCH,
  boundsOf,
  depthOf,
  ellipseFootprint,
  extrude,
  hashSeed,
  insetFootprint,
  polygonFootprint,
  project,
  rectFootprint,
  scaleFootprint,
  screenDeltaToWorld,
  smoothClosedPath,
  toPath,
  unprojectGround,
  worldCentroid,
} from './iso';

describe('unprojectGround', () => {
  it('round-trips any ground-plane point through project()', () => {
    for (const [x, y] of [
      [0, 0],
      [96, 48],
      [12, 240],
      [333, 7],
    ]) {
      const back = unprojectGround(project(x, y, 0));
      expect(back.x).toBeCloseTo(x);
      expect(back.y).toBeCloseTo(y);
    }
  });

  it('inverts the screen origin to the world origin', () => {
    const back = unprojectGround({ x: 0, y: 0 });
    expect(back.x).toBeCloseTo(0);
    expect(back.y).toBeCloseTo(0);
  });
});

describe('screenDeltaToWorld', () => {
  it('maps a screen-space delta to the world delta project() would undo', () => {
    const world = screenDeltaToWorld(...(() => {
      const p = project(30, -18, 0);
      return [p.x, p.y] as const;
    })());
    expect(world.x).toBeCloseTo(30);
    expect(world.y).toBeCloseTo(-18);
  });

  it('is origin-independent (a delta is a delta)', () => {
    const a = project(50, 50, 0);
    const b = project(70, 35, 0);
    const world = screenDeltaToWorld(b.x - a.x, b.y - a.y);
    expect(world.x).toBeCloseTo(20);
    expect(world.y).toBeCloseTo(-15);
  });
});

describe('project', () => {
  it('maps the world origin to the screen origin', () => {
    expect(project(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('projects +x down-right and +y down-left symmetrically', () => {
    const px = project(10, 0);
    const py = project(0, 10);
    expect(px.x).toBeCloseTo(10 * ISO_COS * PX_PER_INCH);
    expect(px.y).toBeCloseTo(10 * ISO_SIN * PX_PER_INCH);
    expect(py.x).toBeCloseTo(-px.x);
    expect(py.y).toBeCloseTo(px.y);
  });

  it('moves points straight up with height', () => {
    const ground = project(24, 36, 0);
    const raised = project(24, 36, 10);
    expect(raised.x).toBeCloseTo(ground.x);
    expect(raised.y).toBeCloseTo(ground.y - 10 * Z_PER_INCH);
  });
});

describe('footprints', () => {
  it('builds rect corners in order', () => {
    const fp = rectFootprint({ x: 10, y: 20, length: 40, width: 30 });
    expect(fp).toEqual([
      { x: 10, y: 20 },
      { x: 50, y: 20 },
      { x: 50, y: 50 },
      { x: 10, y: 50 },
    ]);
  });

  it('rotates rects about their position origin like the layout editor', () => {
    const fp = rectFootprint({ x: 10, y: 10, length: 20, width: 10, rotationDeg: 90 });
    expect(fp[0].x).toBeCloseTo(10);
    expect(fp[0].y).toBeCloseTo(10);
    // (30, 10) rotated 90° about (10, 10) -> (10, 30)
    expect(fp[1].x).toBeCloseTo(10);
    expect(fp[1].y).toBeCloseTo(30);
  });

  it('approximates ellipses with the requested segment count, centered in their box', () => {
    const fp = ellipseFootprint({ x: 0, y: 0, length: 48, width: 24, segments: 16 });
    expect(fp).toHaveLength(16);
    const c = worldCentroid(fp);
    expect(c.x).toBeCloseTo(24);
    expect(c.y).toBeCloseTo(12);
    for (const p of fp) {
      // Points satisfy the ellipse equation for semi-axes 24 and 12.
      const e = ((p.x - 24) / 24) ** 2 + ((p.y - 12) / 12) ** 2;
      expect(e).toBeCloseTo(1);
    }
  });

  it('translates polygon points by the element position', () => {
    const fp = polygonFootprint({
      x: 5,
      y: 7,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
      ],
    });
    expect(fp).toEqual([
      { x: 5, y: 7 },
      { x: 15, y: 7 },
      { x: 5, y: 17 },
    ]);
  });

  it('insets vertices toward the centroid', () => {
    const fp = rectFootprint({ x: 0, y: 0, length: 20, width: 20 });
    const inset = insetFootprint(fp, 5);
    const c = worldCentroid(fp);
    for (let i = 0; i < fp.length; i += 1) {
      const before = Math.hypot(fp[i].x - c.x, fp[i].y - c.y);
      const after = Math.hypot(inset[i].x - c.x, inset[i].y - c.y);
      expect(after).toBeLessThan(before);
    }
  });

  it('scales about the centroid without moving it', () => {
    const fp = rectFootprint({ x: 0, y: 0, length: 30, width: 10 });
    const scaled = scaleFootprint(fp, 0.5);
    expect(worldCentroid(scaled)).toEqual(worldCentroid(fp));
    expect(scaled[0].x).toBeCloseTo(7.5);
  });
});

describe('depth sorting', () => {
  it('orders north-west elements before south-east ones', () => {
    const back = rectFootprint({ x: 0, y: 0, length: 10, width: 10 });
    const front = rectFootprint({ x: 100, y: 100, length: 10, width: 10 });
    expect(depthOf(back)).toBeLessThan(depthOf(front));
  });
});

describe('extrude', () => {
  it('shows exactly the two camera-facing walls of an axis-aligned rect', () => {
    const fp = rectFootprint({ x: 0, y: 0, length: 40, width: 20 });
    const solid = extrude(fp, 12);
    expect(solid.walls).toHaveLength(2);
    const facings = solid.walls.map((w) => w.facing).sort();
    expect(facings).toEqual(['left', 'right']);
  });

  it('lifts the top face by the extrusion height', () => {
    const fp = rectFootprint({ x: 0, y: 0, length: 40, width: 20 });
    const solid = extrude(fp, 12);
    for (let i = 0; i < fp.length; i += 1) {
      expect(solid.top[i].x).toBeCloseTo(solid.base[i].x);
      expect(solid.top[i].y).toBeCloseTo(solid.base[i].y - 12 * Z_PER_INCH);
    }
  });

  it('builds walls as quads from base to top', () => {
    const fp = rectFootprint({ x: 0, y: 0, length: 40, width: 20 });
    const solid = extrude(fp, 12);
    for (const wall of solid.walls) {
      expect(wall.points).toHaveLength(4);
      expect(wall.points[3].y).toBeCloseTo(wall.points[0].y - 12 * Z_PER_INCH);
    }
  });
});

describe('svg path helpers', () => {
  it('emits closed paths with rounded coordinates', () => {
    const d = toPath([
      { x: 0.111111, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(d).toBe('M0.11 0 L10 0 L10 10 Z');
  });

  it('smooths closed rings into quadratic segments', () => {
    const d = smoothClosedPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
    expect(d.startsWith('M')).toBe(true);
    expect(d).toContain('Q');
    expect(d.endsWith('Z')).toBe(true);
  });

  it('computes bounds across points', () => {
    const b = boundsOf([
      { x: -5, y: 2 },
      { x: 9, y: -3 },
    ]);
    expect(b).toEqual({ minX: -5, minY: -3, maxX: 9, maxY: 2 });
  });
});

describe('hashSeed', () => {
  it('is deterministic and within [0, 1)', () => {
    expect(hashSeed('bed-1')).toBe(hashSeed('bed-1'));
    expect(hashSeed('bed-1')).not.toBe(hashSeed('bed-2'));
    const v = hashSeed('anything');
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});
