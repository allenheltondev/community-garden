// Color system for the masterplan view.
//
// The palette is deliberately muted — closer to a landscape architect's
// marker rendering than to the saturated chips used in the layout editor.
// Flat shading is derived, not hand-picked: every material starts from a
// base hex and gets a lighter top face, a mid right face, and a darker
// left face, which keeps the whole scene tonally consistent.

import type { BedType, GardenAnnotation } from '../../types/listing';

// --- Color math -------------------------------------------------------------

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => clamp255(c).toString(16).padStart(2, '0')).join('')}`;
}

export function mixHex(hex: string, other: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(hex);
  const [r2, g2, b2] = hexToRgb(other);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

// Shadows mix toward a deep olive-umber rather than black so darkened
// faces stay warm and natural.
const SHADE_TARGET = '#2c2b1f';
const TINT_TARGET = '#fdfaf1';
const MUTE_TARGET = '#b3ac99';

export function shade(hex: string, t: number): string {
  return mixHex(hex, SHADE_TARGET, t);
}

export function tint(hex: string, t: number): string {
  return mixHex(hex, TINT_TARGET, t);
}

// Pulls a saturated user-picked color toward warm grey so custom bed
// colors sit comfortably in the muted scene.
export function mute(hex: string, t = 0.4): string {
  return mixHex(hex, MUTE_TARGET, t);
}

export interface IsoMaterial {
  top: string;
  right: string;
  left: string;
}

export function materialFrom(base: string): IsoMaterial {
  return {
    top: tint(base, 0.1),
    right: shade(base, 0.18),
    left: shade(base, 0.34),
  };
}

// --- Scene palette ----------------------------------------------------------

export const SCENE = {
  paper: '#f7f2e7',
  groundShadow: 'rgba(76, 69, 50, 0.16)',
  lawn: '#c3cda4',
  lawnLight: '#cdd6b0',
  lawnBand: 'rgba(253, 250, 241, 0.25)',
  contour: 'rgba(86, 96, 64, 0.25)',
  elementShadow: 'rgba(58, 54, 38, 0.22)',
  elementShadowSoft: 'rgba(58, 54, 38, 0.1)',
  label: '#3c3527',
  labelHalo: 'rgba(247, 242, 231, 0.9)',
  selection: '#a8632f',

  soil: '#9a7c5c',
  soilDark: '#7c6248',
  wood: '#b1906a',
  woodDark: '#8d6f4e',
  stone: '#d9d3c2',
  stoneEdge: '#b9b09a',
  sand: '#e2d8bd',
  water: '#a7c4cb',
  waterDeep: '#86a9b4',
  waterEdge: '#7d9da9',
  trunk: '#8a6a4d',
  terracotta: '#c08a68',
  glass: '#d5e3da',
  glassFrame: '#9eb3a6',
  compost: '#6f5a40',
  fence: '#a98f6c',
  coop: '#b3826a',
  marker: '#b8aa90',
} as const;

// A small set of muted foliage greens; trees pick one deterministically
// so a row of trees reads as varied planting rather than copy-paste.
export const FOLIAGE: string[] = ['#8aa874', '#7b9c6b', '#9bb182', '#6f9162'];

export const FOLIAGE_FRUIT = '#86a86e';
export const FOLIAGE_BERRY = '#5f7f55';
export const FRUIT_DOT = '#c2674f';
export const BERRY_DOT = '#6d5d94';

// --- Bed materials ----------------------------------------------------------

export interface BedPaletteResult {
  frame: IsoMaterial;
  soilTop: string;
  soilEdge: string;
}

export function bedPalette(bedType: BedType, color: string | null): BedPaletteResult {
  const frameBase = color ? mute(color, 0.45) : bedTypeBase(bedType);
  return {
    frame: materialFrom(frameBase),
    soilTop: SCENE.soil,
    soilEdge: SCENE.soilDark,
  };
}

function bedTypeBase(bedType: BedType): string {
  switch (bedType) {
    case 'raised':
      return SCENE.wood;
    case 'mound':
      return SCENE.soil;
    case 'in_ground':
    default:
      return '#8c9a6e';
  }
}

// --- Annotation kinds ---------------------------------------------------------
// Annotations are generic records (label + icon + geometry); the
// masterplan maps them onto a richer visual vocabulary. The stored icon
// emoji is the primary discriminator, the label a fallback for renamed
// items, and the geometry a last resort.

export type AnnotationKind =
  | 'tree'
  | 'fruitTree'
  | 'berryBush'
  | 'pond'
  | 'shed'
  | 'greenhouse'
  | 'trellis'
  | 'compost'
  | 'fence'
  | 'path'
  | 'coop'
  | 'marker';

const ICON_TO_KIND: Record<string, AnnotationKind> = {
  '🌳': 'tree',
  '🌲': 'tree',
  '🍎': 'fruitTree',
  '🍏': 'fruitTree',
  '🍑': 'fruitTree',
  '🫐': 'berryBush',
  '🍓': 'berryBush',
  '💧': 'pond',
  '⛲': 'pond',
  '🏚️': 'shed',
  '🏠': 'shed',
  '🪴': 'greenhouse',
  '🪜': 'trellis',
  '♻️': 'compost',
  '🚧': 'fence',
  '🛤️': 'path',
  '🐔': 'coop',
  '📍': 'marker',
};

const LABEL_TO_KIND: Array<{ match: RegExp; kind: AnnotationKind }> = [
  { match: /greenhouse|hoop ?house|cold frame/i, kind: 'greenhouse' },
  { match: /trellis|arbor|pergola|arch/i, kind: 'trellis' },
  { match: /compost|worm bin/i, kind: 'compost' },
  { match: /fence|gate/i, kind: 'fence' },
  { match: /path|walk|gravel|trail/i, kind: 'path' },
  { match: /chicken|coop|duck|rabbit|goat|hive|animal|run\b/i, kind: 'coop' },
  { match: /pond|water|fountain|rain barrel|birdbath/i, kind: 'pond' },
  { match: /apple|pear|peach|plum|cherry|citrus|fig|fruit tree|orchard/i, kind: 'fruitTree' },
  { match: /berry|bush|currant|shrub/i, kind: 'berryBush' },
  { match: /tree|maple|oak|willow/i, kind: 'tree' },
  { match: /shed|barn|garage|studio/i, kind: 'shed' },
];

export function annotationKind(annotation: GardenAnnotation): AnnotationKind {
  if (annotation.icon && ICON_TO_KIND[annotation.icon]) {
    return ICON_TO_KIND[annotation.icon];
  }
  for (const { match, kind } of LABEL_TO_KIND) {
    if (match.test(annotation.label)) return kind;
  }
  if (annotation.shape === 'line') return 'path';
  if (annotation.shape === 'circle') return 'tree';
  return 'marker';
}

export const KIND_LABELS: Record<AnnotationKind, string> = {
  tree: 'Tree',
  fruitTree: 'Fruit tree',
  berryBush: 'Berry bush',
  pond: 'Water feature',
  shed: 'Shed',
  greenhouse: 'Greenhouse',
  trellis: 'Trellis',
  compost: 'Compost',
  fence: 'Fence',
  path: 'Path',
  coop: 'Animal enclosure',
  marker: 'Landmark',
};
