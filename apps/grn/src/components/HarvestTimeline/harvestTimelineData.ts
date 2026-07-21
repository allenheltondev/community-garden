import type { GrowerCropItem } from '../../types/listing';

const DAY_MS = 24 * 60 * 60 * 1000;

export type HarvestHorizon = 'ready' | 'week' | 'month' | 'later';

export interface HarvestTimelineItem {
  crop: GrowerCropItem;
  dayOffset: number;
  expectedHarvestDate: string;
  horizon: HarvestHorizon;
}

export interface HarvestTimelineData {
  groups: Record<HarvestHorizon, HarvestTimelineItem[]>;
  scheduledCount: number;
  missingTiming: GrowerCropItem[];
}

function parseCalendarDay(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = new Date(`${value}T00:00:00Z`).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function horizonFor(dayOffset: number): HarvestHorizon {
  if (dayOffset <= 0) return 'ready';
  if (dayOffset <= 7) return 'week';
  if (dayOffset <= 30) return 'month';
  return 'later';
}

export function cropDisplayName(crop: GrowerCropItem): string {
  return crop.nickname?.trim() || crop.cropName;
}

export function buildHarvestTimeline(
  crops: GrowerCropItem[],
  now: Date = new Date()
): HarvestTimelineData {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const groups: HarvestTimelineData['groups'] = {
    ready: [],
    week: [],
    month: [],
    later: [],
  };
  const missingTiming: GrowerCropItem[] = [];

  for (const crop of crops) {
    if (crop.status !== 'growing') continue;
    const target = parseCalendarDay(crop.expectedHarvestDate);
    if (target === null) {
      missingTiming.push(crop);
      continue;
    }

    const dayOffset = Math.round((target - today) / DAY_MS);
    const horizon = horizonFor(dayOffset);
    groups[horizon].push({
      crop,
      dayOffset,
      expectedHarvestDate: crop.expectedHarvestDate as string,
      horizon,
    });
  }

  for (const group of Object.values(groups)) {
    group.sort(
      (left, right) =>
        left.dayOffset - right.dayOffset ||
        cropDisplayName(left.crop).localeCompare(cropDisplayName(right.crop))
    );
  }
  missingTiming.sort((left, right) => cropDisplayName(left).localeCompare(cropDisplayName(right)));

  return {
    groups,
    scheduledCount: Object.values(groups).reduce((total, group) => total + group.length, 0),
    missingTiming,
  };
}

export function harvestDateLabel(item: HarvestTimelineItem, locale?: string): string {
  const date = new Date(`${item.expectedHarvestDate}T00:00:00Z`);
  const formatted = date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

  if (item.dayOffset < 0) {
    const daysPast = Math.abs(item.dayOffset);
    return `${daysPast} day${daysPast === 1 ? '' : 's'} past estimate · ${formatted}`;
  }
  if (item.dayOffset === 0) return `Estimated today · ${formatted}`;
  if (item.dayOffset === 1) return `Tomorrow · ${formatted}`;
  return `In ${item.dayOffset} days · ${formatted}`;
}
