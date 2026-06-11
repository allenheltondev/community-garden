import { describe, expect, it } from 'vitest';
import {
  MONTH_LABELS_FULL,
  MONTH_LABELS_SHORT,
  cropVisibleInMonth,
  filterCropsForMonth,
  harvestCountForMonth,
  isHarvestMonth,
  monthOfDate,
} from './season';

function dates(plantingDate: string | null, expectedHarvestDate: string | null) {
  return { plantingDate, expectedHarvestDate };
}

const MAY = 4;
const OCTOBER = 9;

describe('monthOfDate', () => {
  it('extracts the 0-based month from ISO date strings', () => {
    expect(monthOfDate('2026-01-15')).toBe(0);
    expect(monthOfDate('2026-12-31')).toBe(11);
  });

  it('handles full ISO timestamps', () => {
    expect(monthOfDate('2026-04-15T10:30:00Z')).toBe(3);
  });

  it('never shifts across month boundaries from timezone math', () => {
    // new Date('2026-06-01') is UTC midnight, which is still May in
    // negative-offset timezones; string parsing must not care.
    expect(monthOfDate('2026-06-01')).toBe(5);
  });

  it('returns null for missing or malformed input', () => {
    expect(monthOfDate(null)).toBeNull();
    expect(monthOfDate(undefined)).toBeNull();
    expect(monthOfDate('')).toBeNull();
    expect(monthOfDate('not a date')).toBeNull();
    expect(monthOfDate('2026-13-01')).toBeNull();
  });
});

describe('cropVisibleInMonth', () => {
  it('shows every crop when no month is selected ("All season")', () => {
    expect(cropVisibleInMonth(dates('2026-05-01', '2026-07-15'), null)).toBe(true);
    expect(cropVisibleInMonth(dates(null, null), null)).toBe(true);
  });

  it('shows crops with no dates in every month', () => {
    for (let m = 0; m < 12; m += 1) {
      expect(cropVisibleInMonth(dates(null, null), m)).toBe(true);
    }
  });

  it('shows a crop from its planting month through its harvest month, inclusive', () => {
    const tomato = dates('2026-05-10', '2026-09-20');
    expect(cropVisibleInMonth(tomato, 3)).toBe(false); // April
    expect(cropVisibleInMonth(tomato, 4)).toBe(true); // May (planting month)
    expect(cropVisibleInMonth(tomato, 6)).toBe(true); // July
    expect(cropVisibleInMonth(tomato, 8)).toBe(true); // September (harvest month)
    expect(cropVisibleInMonth(tomato, 9)).toBe(false); // October
  });

  it('wraps the year end when the planting month is after the harvest month', () => {
    const garlic = dates('2025-10-15', '2026-03-01'); // overwinters Oct → Mar
    expect(cropVisibleInMonth(garlic, 9)).toBe(true); // October
    expect(cropVisibleInMonth(garlic, 11)).toBe(true); // December
    expect(cropVisibleInMonth(garlic, 0)).toBe(true); // January
    expect(cropVisibleInMonth(garlic, 2)).toBe(true); // March
    expect(cropVisibleInMonth(garlic, 3)).toBe(false); // April
    expect(cropVisibleInMonth(garlic, 5)).toBe(false); // June
  });

  it('treats a missing harvest date as open-ended after planting', () => {
    const crop = dates('2026-05-01', null);
    expect(cropVisibleInMonth(crop, 3)).toBe(false);
    expect(cropVisibleInMonth(crop, MAY)).toBe(true);
    expect(cropVisibleInMonth(crop, 11)).toBe(true);
  });

  it('treats a missing planting date as growing until harvest', () => {
    const crop = dates(null, '2026-05-31');
    expect(cropVisibleInMonth(crop, 0)).toBe(true);
    expect(cropVisibleInMonth(crop, MAY)).toBe(true);
    expect(cropVisibleInMonth(crop, 5)).toBe(false);
  });

  it('shows a same-month crop only in that month', () => {
    const radish = dates('2026-05-02', '2026-05-30');
    expect(cropVisibleInMonth(radish, MAY)).toBe(true);
    expect(cropVisibleInMonth(radish, 3)).toBe(false);
    expect(cropVisibleInMonth(radish, 5)).toBe(false);
  });
});

describe('isHarvestMonth', () => {
  it('is true exactly in the expected harvest month', () => {
    const crop = dates('2026-05-10', '2026-10-04');
    expect(isHarvestMonth(crop, OCTOBER)).toBe(true);
    expect(isHarvestMonth(crop, 8)).toBe(false);
  });

  it('is false with no month selected or no harvest date', () => {
    expect(isHarvestMonth(dates('2026-05-10', '2026-10-04'), null)).toBe(false);
    expect(isHarvestMonth(dates('2026-05-10', null), OCTOBER)).toBe(false);
  });
});

describe('filterCropsForMonth', () => {
  const crops = [
    dates('2026-05-01', '2026-09-15'), // summer
    dates('2025-10-01', '2026-03-15'), // overwinter
    dates(null, null), // undated
  ];

  it('returns everything unchanged for "All season"', () => {
    expect(filterCropsForMonth(crops, null)).toEqual(crops);
  });

  it('keeps only crops standing in the selected month', () => {
    expect(filterCropsForMonth(crops, 6)).toEqual([crops[0], crops[2]]); // July
    expect(filterCropsForMonth(crops, 0)).toEqual([crops[1], crops[2]]); // January
    expect(filterCropsForMonth(crops, 3)).toEqual([crops[2]]); // April
  });
});

describe('harvestCountForMonth', () => {
  it('counts crops whose harvest month matches', () => {
    const crops = [
      dates('2026-05-01', '2026-10-15'),
      dates('2026-06-01', '2026-10-02'),
      dates('2026-06-01', '2026-08-02'),
      dates(null, null),
    ];
    expect(harvestCountForMonth(crops, OCTOBER)).toBe(2);
    expect(harvestCountForMonth(crops, 7)).toBe(1);
    expect(harvestCountForMonth(crops, 1)).toBe(0);
    expect(harvestCountForMonth(crops, null)).toBe(0);
  });
});

describe('month labels', () => {
  it('covers all twelve months in both lengths', () => {
    expect(MONTH_LABELS_SHORT).toHaveLength(12);
    expect(MONTH_LABELS_FULL).toHaveLength(12);
    expect(MONTH_LABELS_SHORT[9]).toBe('Oct');
    expect(MONTH_LABELS_FULL[9]).toBe('October');
  });
});
