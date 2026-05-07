// Bed-type defaults shared across the toolbar and inspector. Keep these
// in inches so they map directly onto the canvas coordinate system.

import type { BedShape, BedType } from '../../types/listing';

export interface BedDefaults {
  bedType: BedType;
  shape: BedShape;
  lengthInches: number;
  widthInches: number;
  diameterInches?: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
  label: string;
  emoji: string;
}

const DEFAULTS: Record<BedType, BedDefaults> = {
  raised: {
    bedType: 'raised',
    shape: 'rect',
    lengthInches: 96,
    widthInches: 48,
    fill: 'rgba(186, 145, 96, 0.18)',
    stroke: '#8a6230',
    strokeWidth: 6,
    cornerRadius: 4,
    label: 'Raised bed',
    emoji: '🪵',
  },
  mound: {
    bedType: 'mound',
    shape: 'circle',
    lengthInches: 48,
    widthInches: 48,
    diameterInches: 48,
    fill: 'rgba(133, 92, 56, 0.32)',
    stroke: '#5b3a1c',
    strokeWidth: 2,
    cornerRadius: 0,
    label: 'Mound',
    emoji: '⛰️',
  },
  in_ground: {
    bedType: 'in_ground',
    shape: 'polygon',
    lengthInches: 96,
    widthInches: 48,
    fill: 'rgba(96, 134, 73, 0.20)',
    stroke: '#5b8c4a',
    strokeWidth: 2,
    cornerRadius: 0,
    label: 'In-ground bed',
    emoji: '🌱',
  },
};

export function defaultsFor(type: BedType): BedDefaults {
  return DEFAULTS[type];
}

export function defaultRectPolygonPoints(width: number, height: number) {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

// Friendly preset palette the inspector exposes for color tagging.
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

export const BED_TYPE_DESCRIPTIONS: Record<BedType, string> = {
  raised: 'Wood-framed beds, easy to layer with mix and amendments.',
  mound: 'Heaped soil beds, great for squash, melons, and hugelkultur.',
  in_ground: 'Native-soil beds with any outline you can draw.',
};
