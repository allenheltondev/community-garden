// Planting-capacity math for garden beds. Pure functions only — no React,
// no Konva — so both the designer and the masterplan can share them and
// they stay trivially unit-testable.

import type { GardenBed, GrowerCropItem } from '../../types/listing';
import { bedAreaSquareInches } from './bedDefaults';

// Fraction of a bed's geometric area we treat as plantable. The remaining
// 10% is a deliberate margin for access, edge effects, and irrigation —
// plants right against a frame or rim rarely get their full spacing, and
// growers need somewhere to reach in from.
export const USABLE_AREA_FRACTION = 0.9;

// Utilization thresholds for capacityLabel. Below LOW the bed clearly has
// room; between LOW and FULL it's healthily planted; above FULL (100% of
// usable area) it's overplanted.
const UTILIZATION_LOW = 0.7;
const UTILIZATION_FULL = 1.0;

type BedGeometry = Pick<GardenBed, 'shape' | 'lengthInches' | 'widthInches' | 'points'>;
type CropSpacing = Pick<GrowerCropItem, 'plantCount' | 'spacingInches'>;

/**
 * Square inches a single plant of this crop occupies, using the square
 * spacing model (a plant spaced N inches apart claims an N×N cell).
 * Returns null when the crop has no spacing data — unknown, not zero.
 */
export function cropFootprintSquareInches(crop: CropSpacing): number | null {
  if (crop.spacingInches === null || crop.spacingInches <= 0) return null;
  return crop.spacingInches * crop.spacingInches;
}

export interface BedCapacitySummary {
  /** Σ plantCount × spacing² over crops with spacing data (null plantCount counts as 1 plant). */
  usedSquareInches: number;
  /** Bed area × USABLE_AREA_FRACTION. */
  usableSquareInches: number;
  /**
   * usedSquareInches / usableSquareInches. Can exceed 1 (overplanted).
   * Null when no crop in the bed has spacing data, or when the bed has
   * no usable area to divide by.
   */
  utilization: number | null;
  /** Crops with spacing data — the ones counted in usedSquareInches. */
  knownCrops: number;
  /** Crops without spacing data — present but uncounted. */
  unknownCrops: number;
}

/**
 * How full a bed is, given its geometry and the crops planted in it.
 * Crops without spacing data can't be sized, so they're tallied in
 * unknownCrops instead of silently counting as zero area.
 */
export function bedCapacitySummary(
  bed: BedGeometry,
  crops: readonly CropSpacing[]
): BedCapacitySummary {
  const usableSquareInches =
    bedAreaSquareInches({
      shape: bed.shape,
      lengthInches: bed.lengthInches,
      widthInches: bed.widthInches,
      points: bed.points,
    }) * USABLE_AREA_FRACTION;

  let usedSquareInches = 0;
  let knownCrops = 0;
  let unknownCrops = 0;
  for (const crop of crops) {
    const footprint = cropFootprintSquareInches(crop);
    if (footprint === null) {
      unknownCrops += 1;
      continue;
    }
    knownCrops += 1;
    usedSquareInches += (crop.plantCount ?? 1) * footprint;
  }

  const utilization =
    knownCrops > 0 && usableSquareInches > 0
      ? usedSquareInches / usableSquareInches
      : null;

  return { usedSquareInches, usableSquareInches, utilization, knownCrops, unknownCrops };
}

/**
 * Human-friendly read on a bed's utilization. Returns null when
 * utilization is unknown so callers can simply skip rendering.
 */
export function capacityLabel(summary: BedCapacitySummary): string | null {
  if (summary.utilization === null) return null;
  if (summary.utilization > UTILIZATION_FULL) return 'Overplanted';
  if (summary.utilization >= UTILIZATION_LOW) return 'Nicely full';
  return 'Room for more';
}

/**
 * How many plants at the given spacing fit in the bed's usable area,
 * ignoring anything already planted. Returns 0 for non-positive spacing.
 */
export function estimatePlantsThatFit(bed: BedGeometry, spacingInches: number): number {
  if (spacingInches <= 0) return 0;
  const usable =
    bedAreaSquareInches({
      shape: bed.shape,
      lengthInches: bed.lengthInches,
      widthInches: bed.widthInches,
      points: bed.points,
    }) * USABLE_AREA_FRACTION;
  return Math.floor(usable / (spacingInches * spacingInches));
}
