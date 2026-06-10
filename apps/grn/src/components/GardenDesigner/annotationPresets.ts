import type { AnnotationShape, BedPolygonPoint } from '../../types/listing';
import { defaultRectPolygonPoints } from './bedDefaults';

export interface AnnotationPreset {
  id: string;
  label: string;
  icon: string;
  shape: AnnotationShape;
  defaultLength: number;
  defaultWidth: number;
  defaultColor: string | null;
  description: string;
  buildPoints?: (length: number, width: number) => BedPolygonPoint[];
}

// Picked to keep designer scope sane: visual context only, no soil, no
// crops, no LLM input. The user can rename freely after creation.
//
// The `icon` emoji doubles as the discriminator the masterplan view uses
// to choose an illustrated 3D form (see GardenMasterplan/palette.ts), so
// each preset keeps a distinct icon.
export const ANNOTATION_PRESETS: AnnotationPreset[] = [
  {
    id: 'tree',
    label: 'Tree',
    icon: '🌳',
    shape: 'circle',
    defaultLength: 60,
    defaultWidth: 60,
    defaultColor: '#3a7e5a',
    description: 'A shade tree, shrub, or other circular landmark.',
  },
  {
    id: 'fruit-tree',
    label: 'Fruit tree',
    icon: '🍎',
    shape: 'circle',
    defaultLength: 48,
    defaultWidth: 48,
    defaultColor: '#3a7e5a',
    description: 'An apple, pear, stone-fruit, or citrus tree.',
  },
  {
    id: 'berry-bush',
    label: 'Berry bush',
    icon: '🫐',
    shape: 'circle',
    defaultLength: 36,
    defaultWidth: 36,
    defaultColor: '#446e3b',
    description: 'A blueberry, raspberry, currant, or other fruiting shrub.',
  },
  {
    id: 'pond',
    label: 'Pond',
    icon: '💧',
    shape: 'polygon',
    defaultLength: 96,
    defaultWidth: 72,
    defaultColor: '#4a86c5',
    description: 'A pond, water feature, or other irregular pool.',
    buildPoints: (length, width) => defaultRectPolygonPoints(length, width),
  },
  {
    id: 'path',
    label: 'Path',
    icon: '🛤️',
    shape: 'line',
    defaultLength: 240,
    defaultWidth: 12,
    defaultColor: '#8a6230',
    description: 'A walkway or other linear surface.',
    buildPoints: (length) => [
      { x: 0, y: 0 },
      { x: length, y: 0 },
    ],
  },
  {
    id: 'fence',
    label: 'Fence',
    icon: '🚧',
    shape: 'line',
    defaultLength: 240,
    defaultWidth: 4,
    defaultColor: '#8a6230',
    description: 'A fence line or garden boundary.',
    buildPoints: (length) => [
      { x: 0, y: 0 },
      { x: length, y: 0 },
    ],
  },
  {
    id: 'shed',
    label: 'Shed',
    icon: '🏚️',
    shape: 'rect',
    defaultLength: 96,
    defaultWidth: 72,
    defaultColor: '#5b3a1c',
    description: 'A shed, barn, or other solid structure.',
  },
  {
    id: 'greenhouse',
    label: 'Greenhouse',
    icon: '🪴',
    shape: 'rect',
    defaultLength: 120,
    defaultWidth: 84,
    defaultColor: '#7aa18f',
    description: 'A greenhouse, hoop house, or cold frame.',
  },
  {
    id: 'trellis',
    label: 'Trellis',
    icon: '🪜',
    shape: 'rect',
    defaultLength: 72,
    defaultWidth: 12,
    defaultColor: '#8a6230',
    description: 'A trellis, arbor, or other climbing support.',
  },
  {
    id: 'compost',
    label: 'Compost',
    icon: '♻️',
    shape: 'rect',
    defaultLength: 36,
    defaultWidth: 36,
    defaultColor: '#5b3a1c',
    description: 'A compost bin or pile.',
  },
  {
    id: 'coop',
    label: 'Animal enclosure',
    icon: '🐔',
    shape: 'rect',
    defaultLength: 96,
    defaultWidth: 72,
    defaultColor: '#8a6230',
    description: 'A chicken coop, run, hutch, or other animal enclosure.',
  },
  {
    id: 'custom',
    label: 'Other',
    icon: '📍',
    shape: 'rect',
    defaultLength: 48,
    defaultWidth: 48,
    defaultColor: null,
    description: 'A generic landmark — name it whatever you like.',
  },
];

export function presetById(id: string): AnnotationPreset | undefined {
  return ANNOTATION_PRESETS.find((p) => p.id === id);
}
