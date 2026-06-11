// World-space footprint builders and scene sizing shared by the
// masterplan components. These live apart from the Iso* component files
// so those stay component-only modules (react-refresh requires it) while
// the scene, the bed/annotation illustrations, and tests can all reason
// about the same geometry.

import type { GardenAnnotation, GardenBed, GardenCanvas } from '../../types/listing';
import {
  boundsOf,
  ellipseFootprint,
  polygonFootprint,
  projectFootprint,
  rectFootprint,
  type WorldPoint,
} from './iso';
import type { AnnotationKind } from './palette';

// Kinds that sit flush with the ground; the scene paints these before any
// extruded volume regardless of depth so beds and structures always sit
// on top of paths and water.
export const FLAT_KINDS: ReadonlySet<AnnotationKind> = new Set(['path', 'pond']);

export function annotationGeometry(a: GardenAnnotation) {
  return {
    x: a.positionX ?? 12,
    y: a.positionY ?? 12,
    length: a.lengthInches ?? 48,
    width: a.widthInches ?? 48,
    rotationDeg: a.rotationDeg,
  };
}

export function annotationFootprint(a: GardenAnnotation): WorldPoint[] {
  const g = annotationGeometry(a);
  if (a.shape === 'line' && a.points && a.points.length >= 2) {
    return polygonFootprint({ x: g.x, y: g.y, points: a.points, rotationDeg: g.rotationDeg });
  }
  if (a.shape === 'circle') {
    return ellipseFootprint(g);
  }
  if (a.shape === 'polygon' && a.points && a.points.length >= 3) {
    return polygonFootprint({ x: g.x, y: g.y, points: a.points, rotationDeg: g.rotationDeg });
  }
  return rectFootprint(g);
}

export function bedFootprint(bed: GardenBed): WorldPoint[] {
  const x = bed.positionX ?? 12;
  const y = bed.positionY ?? 12;
  const length = bed.lengthInches ?? 96;
  const width = bed.widthInches ?? 48;
  if (bed.shape === 'circle') {
    return ellipseFootprint({ x, y, length, width, rotationDeg: bed.rotationDeg });
  }
  if (bed.shape === 'polygon' && bed.points && bed.points.length >= 3) {
    return polygonFootprint({ x, y, points: bed.points, rotationDeg: bed.rotationDeg });
  }
  return rectFootprint({ x, y, length, width, rotationDeg: bed.rotationDeg });
}

// Extra svg space above the ground plate so tall objects (trees, sheds)
// and crop silhouettes near the north edge never clip.
const PAD_X = 80;
const PAD_TOP = 160;
const PAD_BOTTOM = 90;

export interface SceneMetrics {
  width: number;
  height: number;
  viewBox: string;
}

export function sceneMetrics(canvas: GardenCanvas): SceneMetrics {
  const w = canvas.widthInches;
  const h = canvas.heightInches;
  const corners = projectFootprint([
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ]);
  const b = boundsOf(corners);
  const width = b.maxX - b.minX + PAD_X * 2;
  const height = b.maxY - b.minY + PAD_TOP + PAD_BOTTOM;
  return {
    width,
    height,
    viewBox: `${b.minX - PAD_X} ${b.minY - PAD_TOP} ${width} ${height}`,
  };
}
