import { describe, expect, it } from 'vitest';
import type { GardenAnnotation } from '../../types/listing';
import { annotationKind, materialFrom, mixHex, mute, shade, tint } from './palette';

function makeAnnotation(overrides: Partial<GardenAnnotation>): GardenAnnotation {
  return {
    id: 'a1',
    userId: 'u1',
    label: 'Thing',
    icon: null,
    shape: 'rect',
    positionX: 0,
    positionY: 0,
    lengthInches: 48,
    widthInches: 48,
    rotationDeg: 0,
    points: null,
    color: null,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('color math', () => {
  it('mixes two hex colors linearly', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#ff0000', '#00ff00', 0)).toBe('#ff0000');
    expect(mixHex('#ff0000', '#00ff00', 1)).toBe('#00ff00');
  });

  it('supports shorthand hex', () => {
    expect(mixHex('#fff', '#fff', 0.5)).toBe('#ffffff');
  });

  it('shade darkens and tint lightens', () => {
    const base = '#8aa874';
    const darker = shade(base, 0.3);
    const lighter = tint(base, 0.3);
    const [r] = [parseInt(base.slice(1, 3), 16)];
    expect(parseInt(darker.slice(1, 3), 16)).toBeLessThan(r);
    expect(parseInt(lighter.slice(1, 3), 16)).toBeGreaterThan(r);
  });

  it('mute pulls saturated colors toward warm grey', () => {
    const muted = mute('#ff0000', 0.5);
    expect(muted).not.toBe('#ff0000');
    // Red channel drops, green/blue rise.
    expect(parseInt(muted.slice(1, 3), 16)).toBeLessThan(255);
    expect(parseInt(muted.slice(3, 5), 16)).toBeGreaterThan(0);
  });

  it('builds a material with top lighter than left', () => {
    const m = materialFrom('#b1906a');
    expect(parseInt(m.top.slice(1, 3), 16)).toBeGreaterThan(
      parseInt(m.left.slice(1, 3), 16)
    );
  });
});

describe('annotationKind', () => {
  it('maps preset icons to kinds', () => {
    expect(annotationKind(makeAnnotation({ icon: '🌳' }))).toBe('tree');
    expect(annotationKind(makeAnnotation({ icon: '🍎' }))).toBe('fruitTree');
    expect(annotationKind(makeAnnotation({ icon: '🫐' }))).toBe('berryBush');
    expect(annotationKind(makeAnnotation({ icon: '💧' }))).toBe('pond');
    expect(annotationKind(makeAnnotation({ icon: '🏚️' }))).toBe('shed');
    expect(annotationKind(makeAnnotation({ icon: '🪴' }))).toBe('greenhouse');
    expect(annotationKind(makeAnnotation({ icon: '🪜' }))).toBe('trellis');
    expect(annotationKind(makeAnnotation({ icon: '♻️' }))).toBe('compost');
    expect(annotationKind(makeAnnotation({ icon: '🚧' }))).toBe('fence');
    expect(annotationKind(makeAnnotation({ icon: '🛤️' }))).toBe('path');
    expect(annotationKind(makeAnnotation({ icon: '🐔' }))).toBe('coop');
    expect(annotationKind(makeAnnotation({ icon: '📍' }))).toBe('marker');
  });

  it('falls back to label matching when the icon is unknown', () => {
    expect(annotationKind(makeAnnotation({ label: 'Back greenhouse' }))).toBe('greenhouse');
    expect(annotationKind(makeAnnotation({ label: 'Chicken coop' }))).toBe('coop');
    expect(annotationKind(makeAnnotation({ label: 'Peach tree' }))).toBe('fruitTree');
    expect(annotationKind(makeAnnotation({ label: 'Rain barrel' }))).toBe('pond');
  });

  it('falls back to geometry when nothing else matches', () => {
    expect(annotationKind(makeAnnotation({ label: 'Mystery', shape: 'line' }))).toBe('path');
    expect(annotationKind(makeAnnotation({ label: 'Mystery', shape: 'circle' }))).toBe('tree');
    expect(annotationKind(makeAnnotation({ label: 'Mystery', shape: 'rect' }))).toBe('marker');
  });
});
