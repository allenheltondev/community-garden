import { describe, expect, it } from 'vitest';
import { preserveWorldPointAfterOriginChange } from './useMapViewport';

describe('preserveWorldPointAfterOriginChange', () => {
  it('keeps a projected garden point at the same screen position', () => {
    const transform = { scale: 1.4, x: -210, y: 85 };
    const previousOrigin = { x: -80, y: -160 };
    const nextOrigin = { x: -320, y: -40 };
    const worldPoint = { x: 125, y: 340 };
    const before = {
      x: transform.x + (worldPoint.x - previousOrigin.x) * transform.scale,
      y: transform.y + (worldPoint.y - previousOrigin.y) * transform.scale,
    };

    const next = preserveWorldPointAfterOriginChange(
      transform,
      previousOrigin,
      nextOrigin
    );
    const after = {
      x: next.x + (worldPoint.x - nextOrigin.x) * next.scale,
      y: next.y + (worldPoint.y - nextOrigin.y) * next.scale,
    };

    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(next.scale).toBe(transform.scale);
  });
});
