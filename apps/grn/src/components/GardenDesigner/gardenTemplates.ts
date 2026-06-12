// Starter garden templates: small, opinionated layouts a new grower can
// drop onto an empty canvas instead of facing a blank map. Templates are
// pure data — each `build` call returns fresh bed/annotation payloads for
// the existing create endpoints, centered on the caller's canvas.
//
// Layouts are authored in a 360×240-inch "design frame" (the default
// canvas size). `build` centers the layout's bounding box on the actual
// canvas and clamps positions to >= 0 so a smaller canvas degrades to a
// top-left-anchored layout rather than negative coordinates.

import type {
  UpsertGardenAnnotationRequest,
  UpsertGardenBedRequest,
} from '../../services/api';
import { presetById } from './annotationPresets';
import { BED_COLOR_PALETTE } from './bedDefaults';

export interface TemplateCanvasSize {
  widthInches: number;
  heightInches: number;
}

export interface TemplateLayout {
  beds: UpsertGardenBedRequest[];
  annotations: UpsertGardenAnnotationRequest[];
}

export interface GardenTemplate {
  id: string;
  name: string;
  description: string;
  stats: { bedCount: number; annotationCount: number };
  build: (canvas: TemplateCanvasSize) => TemplateLayout;
}

// Named palette entries (bedDefaults.BED_COLOR_PALETTE) so template colors
// stay in lockstep with the inspector swatches.
function paletteColor(label: string): string {
  const entry = BED_COLOR_PALETTE.find((c) => c.label === label);
  return entry ? entry.value : BED_COLOR_PALETTE[0].value;
}

const CEDAR = paletteColor('Cedar');
const MOSS = paletteColor('Moss');
const SOIL = paletteColor('Soil');
const BLOOM = paletteColor('Bloom');

// Pulls label/icon/shape/color from the annotation preset (the icon is the
// discriminator the masterplan uses to pick an illustration), then layers
// on template-specific geometry.
function annotationFromPreset(
  presetId: string,
  overrides: Partial<UpsertGardenAnnotationRequest>
): UpsertGardenAnnotationRequest {
  const preset = presetById(presetId);
  if (!preset) {
    throw new Error(`Unknown annotation preset: ${presetId}`);
  }
  return {
    label: preset.label,
    icon: preset.icon,
    shape: preset.shape,
    color: preset.defaultColor,
    rotationDeg: 0,
    ...overrides,
  };
}

// Bounding extent of one element in the design frame. Polygon/line
// geometry lives in `points` (anchored at the element position); rects
// and circles use length × width.
function elementExtent(el: {
  positionX?: number | null;
  positionY?: number | null;
  lengthInches?: number | null;
  widthInches?: number | null;
  points?: Array<{ x: number; y: number }> | null;
}): { minX: number; minY: number; maxX: number; maxY: number } {
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

function layoutBounds(layout: TemplateLayout) {
  const extents = [...layout.beds, ...layout.annotations].map(elementExtent);
  return {
    minX: Math.min(...extents.map((e) => e.minX)),
    minY: Math.min(...extents.map((e) => e.minY)),
    maxX: Math.max(...extents.map((e) => e.maxX)),
    maxY: Math.max(...extents.map((e) => e.maxY)),
  };
}

// Translate every element so the layout's bounding box is centered on the
// canvas. Positions clamp to >= 0; on a canvas smaller than the layout the
// result anchors at the top-left rather than going negative.
function centerLayout(layout: TemplateLayout, canvas: TemplateCanvasSize): TemplateLayout {
  const b = layoutBounds(layout);
  const dx = Math.round((canvas.widthInches - (b.maxX - b.minX)) / 2 - b.minX);
  const dy = Math.round((canvas.heightInches - (b.maxY - b.minY)) / 2 - b.minY);
  const shift = <T extends { positionX?: number | null; positionY?: number | null }>(
    el: T
  ): T => ({
    ...el,
    positionX: Math.max(0, (el.positionX ?? 0) + dx),
    positionY: Math.max(0, (el.positionY ?? 0) + dy),
  });
  return {
    beds: layout.beds.map(shift),
    annotations: layout.annotations.map(shift),
  };
}

function raisedBed(
  name: string,
  positionX: number,
  positionY: number,
  lengthInches = 96,
  widthInches = 48
): UpsertGardenBedRequest {
  return {
    name,
    bedType: 'raised',
    shape: 'rect',
    lengthInches,
    widthInches,
    positionX,
    positionY,
    rotationDeg: 0,
    points: null,
    color: CEDAR,
  };
}

// --- Layout factories ------------------------------------------------------

// Two 96×48 raised beds side by side with a 36" walking gap, a compost
// bin tucked beside them, and a stone path running along the front.
function twoRaisedBedsLayout(): TemplateLayout {
  return {
    beds: [
      raisedBed('Raised bed 1', 60, 60),
      raisedBed('Raised bed 2', 192, 60), // 60 + 96 + 36" gap
    ],
    annotations: [
      annotationFromPreset('compost', {
        positionX: 300,
        positionY: 66,
        lengthInches: 36,
        widthInches: 36,
      }),
      annotationFromPreset('path', {
        label: 'Stone path',
        positionX: 60,
        positionY: 132,
        lengthInches: 276,
        widthInches: 12,
        points: [
          { x: 0, y: 0 },
          { x: 276, y: 0 },
        ],
      }),
    ],
  };
}

// Four raised beds in a 2×2 grid with cross paths through the aisles, a
// trellis along the north edge, and a round in-ground herb bed off to
// the east.
function kitchenGardenLayout(): TemplateLayout {
  return {
    beds: [
      raisedBed('Raised bed 1', 48, 48),
      raisedBed('Raised bed 2', 180, 48),
      raisedBed('Raised bed 3', 48, 132),
      raisedBed('Raised bed 4', 180, 132),
      {
        name: 'Herb bed',
        bedType: 'in_ground',
        shape: 'circle',
        lengthInches: 48,
        widthInches: 48,
        positionX: 294,
        positionY: 90,
        rotationDeg: 0,
        points: null,
        color: MOSS,
      },
    ],
    annotations: [
      annotationFromPreset('path', {
        positionX: 48,
        positionY: 114, // the horizontal aisle between bed rows
        lengthInches: 228,
        widthInches: 12,
        points: [
          { x: 0, y: 0 },
          { x: 228, y: 0 },
        ],
      }),
      annotationFromPreset('path', {
        positionX: 162, // the vertical aisle between bed columns
        positionY: 48,
        lengthInches: 12,
        widthInches: 132,
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 132 },
        ],
      }),
      annotationFromPreset('trellis', {
        positionX: 114,
        positionY: 24,
        lengthInches: 96,
        widthInches: 12,
      }),
    ],
  };
}

// A working corner: greenhouse, two long mound rows, fence along the
// north and west edges, and a fruit tree by the greenhouse.
function homesteadCornerLayout(): TemplateLayout {
  return {
    beds: [
      {
        name: 'Mound row 1',
        bedType: 'mound',
        shape: 'rect',
        lengthInches: 240,
        widthInches: 24,
        positionX: 60,
        positionY: 138,
        rotationDeg: 0,
        points: null,
        color: SOIL,
      },
      {
        name: 'Mound row 2',
        bedType: 'mound',
        shape: 'rect',
        lengthInches: 240,
        widthInches: 24,
        positionX: 60,
        positionY: 186,
        rotationDeg: 0,
        points: null,
        color: SOIL,
      },
    ],
    annotations: [
      annotationFromPreset('greenhouse', {
        positionX: 24,
        positionY: 24,
        lengthInches: 120,
        widthInches: 84,
      }),
      annotationFromPreset('fence', {
        label: 'North fence',
        positionX: 12,
        positionY: 12,
        lengthInches: 336,
        widthInches: 4,
        points: [
          { x: 0, y: 0 },
          { x: 336, y: 0 },
        ],
      }),
      annotationFromPreset('fence', {
        label: 'West fence',
        positionX: 12,
        positionY: 12,
        lengthInches: 4,
        widthInches: 216,
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 216 },
        ],
      }),
      annotationFromPreset('fruit-tree', {
        positionX: 228,
        positionY: 36,
        lengthInches: 48,
        widthInches: 48,
      }),
    ],
  };
}

// A soft corner for pollinators: a kidney-shaped in-ground bed, two berry
// bushes, a small pond, and a meandering path leading in.
function pollinatorCornerLayout(): TemplateLayout {
  // Gentle kidney silhouette, anchored at (0,0), bbox 138×94.
  const kidneyPoints = [
    { x: 0, y: 36 },
    { x: 10, y: 14 },
    { x: 34, y: 2 },
    { x: 66, y: 0 },
    { x: 102, y: 8 },
    { x: 128, y: 26 },
    { x: 138, y: 52 },
    { x: 130, y: 78 },
    { x: 104, y: 92 },
    { x: 72, y: 94 },
    { x: 48, y: 84 },
    { x: 36, y: 62 },
    { x: 20, y: 56 },
    { x: 6, y: 50 },
  ];
  // Irregular pool, anchored at (0,0), bbox 72×54.
  const pondPoints = [
    { x: 18, y: 0 },
    { x: 54, y: 4 },
    { x: 72, y: 24 },
    { x: 66, y: 46 },
    { x: 36, y: 54 },
    { x: 8, y: 44 },
    { x: 0, y: 20 },
  ];
  return {
    beds: [
      {
        name: 'Pollinator bed',
        bedType: 'in_ground',
        shape: 'polygon',
        lengthInches: 138,
        widthInches: 94,
        positionX: 48,
        positionY: 60,
        rotationDeg: 0,
        points: kidneyPoints,
        color: BLOOM,
      },
    ],
    annotations: [
      annotationFromPreset('berry-bush', {
        positionX: 216,
        positionY: 48,
        lengthInches: 36,
        widthInches: 36,
      }),
      annotationFromPreset('berry-bush', {
        positionX: 258,
        positionY: 84,
        lengthInches: 36,
        widthInches: 36,
      }),
      annotationFromPreset('pond', {
        label: 'Small pond',
        positionX: 216,
        positionY: 144,
        lengthInches: 72,
        widthInches: 54,
        points: pondPoints,
      }),
      annotationFromPreset('path', {
        label: 'Meadow path',
        positionX: 48,
        positionY: 168,
        lengthInches: 192,
        widthInches: 60,
        points: [
          { x: 0, y: 60 },
          { x: 48, y: 36 },
          { x: 120, y: 18 },
          { x: 192, y: 0 },
        ],
      }),
    ],
  };
}

// --- Public catalog ---------------------------------------------------------

interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  layout: () => TemplateLayout;
}

const DEFINITIONS: TemplateDefinition[] = [
  {
    id: 'two-raised-beds',
    name: 'Two raised beds + compost',
    description: 'A classic starter: two raised beds, a compost bin, and a path.',
    layout: twoRaisedBedsLayout,
  },
  {
    id: 'kitchen-garden',
    name: 'Kitchen garden',
    description: 'Four beds around cross paths, a trellis, and a round herb bed.',
    layout: kitchenGardenLayout,
  },
  {
    id: 'homestead-corner',
    name: 'Homestead corner',
    description: 'Greenhouse, two long mound rows, a fenced corner, and a fruit tree.',
    layout: homesteadCornerLayout,
  },
  {
    id: 'pollinator-corner',
    name: 'Pollinator corner',
    description: 'A curved wildflower bed with berry bushes, a pond, and a path.',
    layout: pollinatorCornerLayout,
  },
];

export const GARDEN_TEMPLATES: GardenTemplate[] = DEFINITIONS.map((def) => {
  const sample = def.layout();
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    stats: {
      bedCount: sample.beds.length,
      annotationCount: sample.annotations.length,
    },
    build: (canvas: TemplateCanvasSize) => centerLayout(def.layout(), canvas),
  };
});

export function templateById(id: string): GardenTemplate | undefined {
  return GARDEN_TEMPLATES.find((t) => t.id === id);
}
