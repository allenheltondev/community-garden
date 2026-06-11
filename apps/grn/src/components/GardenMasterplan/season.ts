// Season filtering for the masterplan's month scrubber.
//
// All logic works at year-month granularity: a crop "stands" in its bed
// for every month from its planting month through its expected harvest
// month, inclusive. Months are 0-based (0 = January) to match
// Date#getMonth; `null` means "All season" and disables filtering.
//
// Pure and component-free on purpose — the scrubber UI lives in
// GardenMasterplan.tsx, this module owns every visibility decision so it
// can be unit-tested without rendering.

import type { GrowerCropItem } from '../../types/listing';

export type SeasonMonth = number | null;

export const MONTH_LABELS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export const MONTH_LABELS_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

type CropDates = Pick<GrowerCropItem, 'plantingDate' | 'expectedHarvestDate'>;

/**
 * Month index (0–11) of an ISO date string ("2026-04-15" or a full
 * timestamp). Parsed from the string directly rather than via `new Date`
 * so local-timezone offsets can never shift a date across a month
 * boundary. Returns null for missing or malformed input.
 */
export function monthOfDate(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const match = /^\d{4}-(\d{2})/.exec(iso);
  if (!match) return null;
  const month = Number(match[1]) - 1;
  return month >= 0 && month <= 11 ? month : null;
}

/**
 * Whether a crop is standing in its bed during the given month.
 *
 * - month null ("All season") → always visible, matching the unfiltered map.
 * - no dates at all → always visible (we can't say when it isn't there).
 * - only a planting date → visible from that month onward (open-ended).
 * - only a harvest date → visible through that month (open-started).
 * - planting month > harvest month → the crop overwinters, so the window
 *   wraps the year end (e.g. Oct→Mar covers Oct, Nov, Dec, Jan, Feb, Mar).
 */
export function cropVisibleInMonth(crop: CropDates, month: SeasonMonth): boolean {
  if (month == null) return true;
  const start = monthOfDate(crop.plantingDate);
  const end = monthOfDate(crop.expectedHarvestDate);
  if (start == null && end == null) return true;
  if (start == null) return month <= (end as number);
  if (end == null) return month >= start;
  if (start <= end) return month >= start && month <= end;
  return month >= start || month <= end;
}

/** Whether the given month is the crop's expected harvest month. */
export function isHarvestMonth(crop: CropDates, month: SeasonMonth): boolean {
  if (month == null) return false;
  const end = monthOfDate(crop.expectedHarvestDate);
  return end != null && end === month;
}

/** The crops standing in a bed during the given month. */
export function filterCropsForMonth<T extends CropDates>(
  crops: T[],
  month: SeasonMonth
): T[] {
  if (month == null) return crops;
  return crops.filter((crop) => cropVisibleInMonth(crop, month));
}

/** How many of these crops come ready to harvest in the given month. */
export function harvestCountForMonth(crops: CropDates[], month: SeasonMonth): number {
  if (month == null) return 0;
  return crops.reduce((count, crop) => count + (isHarvestMonth(crop, month) ? 1 : 0), 0);
}
