/**
 * Date helpers shared by the crop library and the dashboard.
 *
 * Crop dates come from the API as calendar-day ISO strings (YYYY-MM-DD) with
 * no time component, so every parse pins to UTC midnight to avoid the value
 * drifting a day depending on the viewer's timezone.
 */

/** Format a YYYY-MM-DD string as a short localized date, or null when empty. */
export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Whole days from today (UTC) until the given date. Negative when the date is
 * in the past, 0 for today, null when the input is empty or unparseable.
 */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Percent (0–100) of the way from planting to expected harvest, or null when
 * either date is missing or the window is degenerate.
 */
export function harvestProgress(
  plantingDate: string | null,
  harvestDate: string | null
): number | null {
  if (!plantingDate || !harvestDate) return null;
  const start = new Date(`${plantingDate}T00:00:00Z`).getTime();
  const end = new Date(`${harvestDate}T00:00:00Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  const now = Date.now();
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}
