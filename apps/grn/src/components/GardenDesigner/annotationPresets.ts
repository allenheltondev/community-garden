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
export const ANNOTATION_PRESETS: AnnotationPreset[] = [
  {
    id: 'tree',
    label: 'Tree',
    icon: '🌳',
    shape: 'circle',
    defaultLength: 60,
    defaultWidth: 60,
    defaultColor: '#3a7e5a',
    description: 'A tree, shrub, or other circular landmark.',
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
    id: 'shed',
    label: 'Shed',
    icon: '🏚️',
    shape: 'rect',
    defaultLength: 96,
    defaultWidth: 72,
    defaultColor: '#5b3a1c',
    description: 'A shed, greenhouse, or other rectangular structure.',
  },
  {
    id: 'path',
    label: 'Path',
    icon: '🛤️',
    shape: 'line',
    defaultLength: 240,
    defaultWidth: 12,
    defaultColor: '#8a6230',
    description: 'A pathway, fence, or other linear feature.',
    buildPoints: (length) => [
      { x: 0, y: 0 },
      { x: length, y: 0 },
    ],
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
