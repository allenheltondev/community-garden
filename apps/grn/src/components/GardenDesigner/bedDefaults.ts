// Type, shape, soil, and color vocabularies shared across the designer.
// Keep dimensions in inches so they map directly onto the canvas grid.

import type { BedPolygonPoint, BedShape, BedType } from '../../types/listing';

export interface BedTypeMeta {
  value: BedType;
  label: string;
  emoji: string;
  description: string;
}

// Bed *type* describes how the bed is constructed (raised vs mound vs
// in-ground). Type is independent of the shape: a raised bed can be a
// rectangle, circle, or polygon.
export const BED_TYPES: BedTypeMeta[] = [
  {
    value: 'raised',
    label: 'Raised bed',
    emoji: '🪵',
    description: 'Wood-framed beds, easy to layer with mix and amendments.',
  },
  {
    value: 'mound',
    label: 'Mound',
    emoji: '⛰️',
    description: 'Heaped soil beds, great for squash, melons, and hugelkultur.',
  },
  {
    value: 'in_ground',
    label: 'In-ground bed',
    emoji: '🌱',
    description: 'Native-soil beds planted directly into existing ground.',
  },
];

export function bedTypeMeta(value: BedType): BedTypeMeta {
  return BED_TYPES.find((t) => t.value === value) ?? BED_TYPES[0];
}

export interface BedShapeMeta {
  value: BedShape;
  label: string;
  emoji: string;
  hint: string;
}

// Bed *shape* is geometry. Each toolbar button picks a shape and
// drops a default-sized bed of that geometry onto the canvas.
//
// Only Rectangle and Circle are presets — a "polygon preset" would be
// indistinguishable from a rectangle until per-vertex editing lands.
// Custom polygons come from the "Draw shape" tool, which is wired up
// separately in the toolbar.
export const BED_SHAPES: BedShapeMeta[] = [
  { value: 'rect', label: 'Rectangle', emoji: '▭', hint: 'Add a rectangular bed' },
  { value: 'circle', label: 'Circle', emoji: '◯', hint: 'Add a circular bed' },
];

export function bedShapeMeta(value: BedShape): BedShapeMeta {
  return BED_SHAPES.find((s) => s.value === value) ?? BED_SHAPES[0];
}

export interface ShapeDefaults {
  shape: BedShape;
  lengthInches: number;
  widthInches: number;
}

const SHAPE_DEFAULTS: Record<BedShape, ShapeDefaults> = {
  rect: { shape: 'rect', lengthInches: 96, widthInches: 48 },
  circle: { shape: 'circle', lengthInches: 48, widthInches: 48 },
  polygon: { shape: 'polygon', lengthInches: 96, widthInches: 48 },
};

export function shapeDefaults(shape: BedShape): ShapeDefaults {
  return SHAPE_DEFAULTS[shape];
}

export function defaultRectPolygonPoints(width: number, height: number): BedPolygonPoint[] {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

// --- Soil ----------------------------------------------------------------
// IMPORTANT: these values are an immutable LLM-input enum. The labels are
// human-friendly and can be tweaked, but the `value` strings are passed
// directly to LLM prompts for soil-specific gardening advice. Don't add,
// remove, or rename a value without updating the relevant prompts.

export interface SoilOption {
  value: string;
  label: string;
}

export const SOIL_OPTIONS: ReadonlyArray<SoilOption> = [
  { value: 'sandy_loam', label: 'Sandy loam' },
  { value: 'clay', label: 'Clay' },
  { value: 'loam', label: 'Loam' },
  { value: 'silty', label: 'Silty' },
  { value: 'chalky', label: 'Chalky' },
  { value: 'peat', label: 'Peat' },
  { value: 'raised_bed_mix', label: 'Raised bed mix' },
  { value: 'compost_amended', label: 'Compost-amended' },
  { value: 'native_soil', label: 'Native soil' },
];

const SOIL_VALUES = new Set(SOIL_OPTIONS.map((o) => o.value));

export function parseSoilField(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((token) => token.trim())
    .filter((token) => SOIL_VALUES.has(token));
}

export function serializeSoilField(values: readonly string[]): string | null {
  const filtered = values.filter((v) => SOIL_VALUES.has(v));
  if (filtered.length === 0) return null;
  // Preserve canonical order so the same selection always serializes the
  // same way (better for LLM caching downstream).
  return SOIL_OPTIONS.filter((o) => filtered.includes(o.value))
    .map((o) => o.value)
    .join(',');
}

export function soilLabel(value: string): string {
  return SOIL_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

// --- Color palette --------------------------------------------------------

export const BED_COLOR_PALETTE: Array<{ value: string; label: string }> = [
  { value: '#8a6230', label: 'Cedar' },
  { value: '#5b8c4a', label: 'Moss' },
  { value: '#446e3b', label: 'Forest' },
  { value: '#5b3a1c', label: 'Soil' },
  { value: '#c97aab', label: 'Bloom' },
  { value: '#d6a52c', label: 'Sun' },
  { value: '#5e4ea3', label: 'Iris' },
  { value: '#7a8c3b', label: 'Olive' },
];

// --- Area calculations ----------------------------------------------------
// Returns square inches for the given bed geometry. Polygon uses the
// shoelace formula on the absolute (untranslated) point set.

export function bedAreaSquareInches(args: {
  shape: BedShape;
  lengthInches: number | null;
  widthInches: number | null;
  points: BedPolygonPoint[] | null;
}): number {
  const { shape, lengthInches, widthInches, points } = args;
  if (shape === 'circle') {
    // Ellipse area: π · a · b where a, b are the semi-axes. Equals
    // π · r² when the bed is a perfect circle (length === width).
    const semiA = (lengthInches ?? 0) / 2;
    const semiB = (widthInches ?? lengthInches ?? 0) / 2;
    return Math.PI * semiA * semiB;
  }
  if (shape === 'polygon' && points && points.length >= 3) {
    // Shoelace formula on the polygon's vertex list.
    let sum = 0;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum) / 2;
  }
  return Math.max(0, (lengthInches ?? 0) * (widthInches ?? 0));
}

export function formatArea(squareInches: number): string {
  if (squareInches <= 0) return '0 sq ft';
  const squareFeet = squareInches / 144;
  if (squareFeet < 1) {
    return `${Math.round(squareInches)} sq in`;
  }
  if (squareFeet < 10) {
    return `${squareFeet.toFixed(1)} sq ft`;
  }
  return `${Math.round(squareFeet)} sq ft`;
}

// Style tokens used by BedShape, keyed by bed type + shape so type can
// affect the look (raised = framed) without forcing the shape.
export interface BedStyleTokens {
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
}

export function bedStyleFor(bedType: BedType): BedStyleTokens {
  switch (bedType) {
    case 'raised':
      return {
        fill: 'rgba(186, 145, 96, 0.18)',
        stroke: '#8a6230',
        strokeWidth: 6,
        cornerRadius: 4,
      };
    case 'mound':
      return {
        fill: 'rgba(133, 92, 56, 0.32)',
        stroke: '#5b3a1c',
        strokeWidth: 2,
        cornerRadius: 0,
      };
    case 'in_ground':
    default:
      return {
        fill: 'rgba(96, 134, 73, 0.20)',
        stroke: '#5b8c4a',
        strokeWidth: 2,
        cornerRadius: 0,
      };
  }
}
