import { describe, expect, it } from 'vitest';
import { GARDEN_TEMPLATES, templateById, type TemplateLayout } from './gardenTemplates';

const REFERENCE = { widthInches: 360, heightInches: 240 };

interface Extent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// Mirrors how the canvas interprets geometry: rects/circles span
// length × width from their position; polygon/line geometry spans its
// (0,0)-anchored point set.
function extentOf(el: {
  positionX?: number | null;
  positionY?: number | null;
  lengthInches?: number | null;
  widthInches?: number | null;
  points?: Array<{ x: number; y: number }> | null;
}): Extent {
  const x = el.positionX ?? 0;
  const y = el.positionY ?? 0;
  let spanX = el.lengthInches ?? 0;
  let spanY = el.widthInches ?? 0;
  if (el.points && el.points.length > 0) {
    spanX = Math.max(...el.points.map((p) => p.x));
    spanY = Math.max(...el.points.map((p) => p.y));
  }
  return { minX: x, minY: y, maxX: x + spanX, maxY: y + spanY };
}

function allExtents(layout: TemplateLayout): Extent[] {
  return [...layout.beds, ...layout.annotations].map(extentOf);
}

describe('gardenTemplates', () => {
  it('exposes four templates with names, descriptions, and honest stats', () => {
    expect(GARDEN_TEMPLATES).toHaveLength(4);
    for (const template of GARDEN_TEMPLATES) {
      expect(template.id).toBeTruthy();
      expect(template.name).toBeTruthy();
      expect(template.description).toBeTruthy();
      const layout = template.build(REFERENCE);
      expect(layout.beds).toHaveLength(template.stats.bedCount);
      expect(layout.annotations).toHaveLength(template.stats.annotationCount);
    }
  });

  it('builds every template fully inside the reference 360×240 canvas', () => {
    for (const template of GARDEN_TEMPLATES) {
      const layout = template.build(REFERENCE);
      for (const extent of allExtents(layout)) {
        expect(extent.minX).toBeGreaterThanOrEqual(0);
        expect(extent.minY).toBeGreaterThanOrEqual(0);
        expect(extent.maxX).toBeLessThanOrEqual(REFERENCE.widthInches);
        expect(extent.maxY).toBeLessThanOrEqual(REFERENCE.heightInches);
      }
    }
  });

  it('builds at least three elements per template', () => {
    for (const template of GARDEN_TEMPLATES) {
      const layout = template.build(REFERENCE);
      expect(layout.beds.length + layout.annotations.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('centers the layout on a larger canvas', () => {
    const large = { widthInches: 720, heightInches: 480 };
    for (const template of GARDEN_TEMPLATES) {
      const extents = allExtents(template.build(large));
      const minX = Math.min(...extents.map((e) => e.minX));
      const minY = Math.min(...extents.map((e) => e.minY));
      const maxX = Math.max(...extents.map((e) => e.maxX));
      const maxY = Math.max(...extents.map((e) => e.maxY));
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      // Within a half-inch of dead center (positions round to integers).
      expect(Math.abs(centerX - large.widthInches / 2)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(centerY - large.heightInches / 2)).toBeLessThanOrEqual(0.5);
      // And still inside the canvas.
      expect(minX).toBeGreaterThanOrEqual(0);
      expect(minY).toBeGreaterThanOrEqual(0);
      expect(maxX).toBeLessThanOrEqual(large.widthInches);
      expect(maxY).toBeLessThanOrEqual(large.heightInches);
    }
  });

  it('clamps positions to >= 0 on a canvas smaller than the layout', () => {
    const tiny = { widthInches: 120, heightInches: 96 };
    for (const template of GARDEN_TEMPLATES) {
      const layout = template.build(tiny);
      for (const el of [...layout.beds, ...layout.annotations]) {
        expect(el.positionX ?? 0).toBeGreaterThanOrEqual(0);
        expect(el.positionY ?? 0).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('gives every bed a name, a bed type, and a palette color', () => {
    for (const template of GARDEN_TEMPLATES) {
      const layout = template.build(REFERENCE);
      for (const bed of layout.beds) {
        expect(bed.name?.trim()).toBeTruthy();
        expect(bed.bedType).toBeTruthy();
        expect(bed.color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('uses known annotation preset icons so the masterplan can illustrate them', () => {
    const knownIcons = new Set([
      '🌳',
      '🍎',
      '🫐',
      '💧',
      '🛤️',
      '🚧',
      '🏚️',
      '🪴',
      '🪜',
      '♻️',
      '🐔',
    ]);
    for (const template of GARDEN_TEMPLATES) {
      const layout = template.build(REFERENCE);
      for (const annotation of layout.annotations) {
        expect(annotation.label?.trim()).toBeTruthy();
        expect(knownIcons.has(annotation.icon ?? '')).toBe(true);
      }
    }
  });

  it('anchors polygon and line point sets at the origin', () => {
    for (const template of GARDEN_TEMPLATES) {
      const layout = template.build(REFERENCE);
      for (const el of [...layout.beds, ...layout.annotations]) {
        if (!el.points || el.points.length === 0) continue;
        expect(Math.min(...el.points.map((p) => p.x))).toBe(0);
        expect(Math.min(...el.points.map((p) => p.y))).toBe(0);
      }
    }
  });

  it('returns fresh payload objects on every build', () => {
    const template = GARDEN_TEMPLATES[0];
    const first = template.build(REFERENCE);
    const second = template.build(REFERENCE);
    expect(first.beds[0]).not.toBe(second.beds[0]);
    expect(first.beds[0]).toEqual(second.beds[0]);
  });

  it('looks templates up by id', () => {
    expect(templateById('kitchen-garden')?.name).toBe('Kitchen garden');
    expect(templateById('nope')).toBeUndefined();
  });
});
