// Pure helpers for background-image scale calibration.
//
// The user draws a reference line over the background photo (in canvas
// inches), tells us how long that line is in real life, and we rescale
// the canvas — and optionally every bed/annotation — by the ratio so
// the drawing's inches match the world's inches.

import type {
  BedPolygonPoint,
  GardenAnnotation,
  GardenBed,
  GardenCanvas,
} from '../../types/listing';
import type {
  UpsertGardenAnnotationRequest,
  UpsertGardenBedRequest,
} from '../../services/api';

/** Smallest canvas side we'll calibrate down to (5 ft). */
export const MIN_CANVAS_INCHES = 60;
/** Largest canvas side we'll calibrate up to (500 ft). */
export const MAX_CANVAS_INCHES = 6000;
/** Beds smaller than this aren't usable — keep dimensions at least 6". */
export const MIN_BED_DIMENSION_INCHES = 6;
/** Annotations can be slim (paths, fences) but never zero-sized. */
export const MIN_ANNOTATION_DIMENSION_INCHES = 1;

/**
 * Ratio that converts drawn (canvas) inches into real-world inches.
 * Returns null when either length is non-positive or non-finite, so
 * callers can bail instead of multiplying by Infinity/NaN.
 */
export function calibrationFactor(
  drawnInches: number,
  realInches: number
): number | null {
  if (!Number.isFinite(drawnInches) || !Number.isFinite(realInches)) return null;
  if (drawnInches <= 0 || realInches <= 0) return null;
  return realInches / drawnInches;
}

export interface RescaledCanvasResult {
  widthInches: number;
  heightInches: number;
  /**
   * The factor actually applied after clamping. Elements must be scaled
   * by this (not the requested factor) so they keep their position
   * relative to the photo.
   */
  effectiveFactor: number;
  /** True when the requested factor had to be limited to keep the canvas in range. */
  clamped: boolean;
}

/**
 * Applies a calibration factor to the canvas dimensions, rounding to
 * whole inches and clamping each side to [MIN_CANVAS_INCHES, MAX_CANVAS_INCHES].
 * Clamping adjusts the factor itself (both sides keep their aspect ratio)
 * rather than squashing one side independently.
 */
export function rescaledCanvas(
  canvas: Pick<GardenCanvas, 'widthInches' | 'heightInches'>,
  factor: number
): RescaledCanvasResult {
  const { widthInches, heightInches } = canvas;
  // The smallest factor keeping both sides >= MIN, and the largest
  // keeping both <= MAX.
  const minFactor = Math.max(
    MIN_CANVAS_INCHES / widthInches,
    MIN_CANVAS_INCHES / heightInches
  );
  const maxFactor = Math.min(
    MAX_CANVAS_INCHES / widthInches,
    MAX_CANVAS_INCHES / heightInches
  );
  let effectiveFactor = factor;
  if (minFactor <= maxFactor) {
    effectiveFactor = Math.min(Math.max(factor, minFactor), maxFactor);
  }
  // Per-side clamp is a safety net for degenerate aspect ratios where no
  // single factor can satisfy both sides at once.
  const nextWidth = Math.min(
    MAX_CANVAS_INCHES,
    Math.max(MIN_CANVAS_INCHES, Math.round(widthInches * effectiveFactor))
  );
  const nextHeight = Math.min(
    MAX_CANVAS_INCHES,
    Math.max(MIN_CANVAS_INCHES, Math.round(heightInches * effectiveFactor))
  );
  const clamped =
    effectiveFactor !== factor ||
    nextWidth !== Math.round(widthInches * factor) ||
    nextHeight !== Math.round(heightInches * factor);
  return {
    widthInches: nextWidth,
    heightInches: nextHeight,
    effectiveFactor,
    clamped,
  };
}

function scalePosition(value: number | null, factor: number): number | null {
  if (value === null) return null;
  return Math.max(0, Math.round(value * factor));
}

function scaleDimension(
  value: number | null,
  factor: number,
  minimum: number
): number | null {
  if (value === null) return null;
  return Math.max(minimum, Math.round(value * factor));
}

function scalePoints(
  points: BedPolygonPoint[] | null,
  factor: number
): BedPolygonPoint[] | null {
  if (!points) return null;
  return points.map((p) => ({
    x: Math.round(p.x * factor),
    y: Math.round(p.y * factor),
  }));
}

/**
 * Full upsert payload for a bed with its geometry multiplied by the
 * calibration factor. Non-geometric fields pass through untouched so the
 * payload can go straight into the existing update mutation.
 */
export function rescaledBedPayload(
  bed: GardenBed,
  factor: number
): UpsertGardenBedRequest {
  return {
    name: bed.name,
    description: bed.description,
    sunExposure: bed.sunExposure,
    soilType: bed.soilType,
    lengthInches: scaleDimension(bed.lengthInches, factor, MIN_BED_DIMENSION_INCHES),
    widthInches: scaleDimension(bed.widthInches, factor, MIN_BED_DIMENSION_INCHES),
    locationNotes: bed.locationNotes,
    sortOrder: bed.sortOrder,
    bedType: bed.bedType,
    shape: bed.shape,
    positionX: scalePosition(bed.positionX, factor),
    positionY: scalePosition(bed.positionY, factor),
    rotationDeg: bed.rotationDeg,
    points: scalePoints(bed.points, factor),
    color: bed.color,
  };
}

/**
 * Full upsert payload for an annotation with scaled geometry. Annotations
 * use a slimmer 1" floor — fences and paths are legitimately narrow.
 */
export function rescaledAnnotationPayload(
  annotation: GardenAnnotation,
  factor: number
): UpsertGardenAnnotationRequest {
  return {
    label: annotation.label,
    icon: annotation.icon,
    shape: annotation.shape,
    positionX: scalePosition(annotation.positionX, factor),
    positionY: scalePosition(annotation.positionY, factor),
    lengthInches: scaleDimension(
      annotation.lengthInches,
      factor,
      MIN_ANNOTATION_DIMENSION_INCHES
    ),
    widthInches: scaleDimension(
      annotation.widthInches,
      factor,
      MIN_ANNOTATION_DIMENSION_INCHES
    ),
    rotationDeg: annotation.rotationDeg,
    points: scalePoints(annotation.points, factor),
    color: annotation.color,
    sortOrder: annotation.sortOrder,
  };
}

/**
 * Human-readable feet-and-inches readout for the live calibration line,
 * e.g. 150 → "12 ft 6 in", 24 → "2 ft", 7 → "7 in".
 */
export function formatInchesAsFeet(inches: number): string {
  const totalInches = Math.max(0, Math.round(inches));
  const feet = Math.floor(totalInches / 12);
  const remainder = totalInches % 12;
  if (feet === 0) return `${remainder} in`;
  if (remainder === 0) return `${feet} ft`;
  return `${feet} ft ${remainder} in`;
}
