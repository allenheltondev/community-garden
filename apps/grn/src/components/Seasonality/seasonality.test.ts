import { describe, expect, it } from 'vitest';
import { buildSeasonalGuide, parseHardinessZone } from './seasonality';

describe('seasonality guidance', () => {
  it('builds warm-zone midsummer guidance from a saved hardiness zone', () => {
    const guide = buildSeasonalGuide({
      homeZone: '8b',
      lat: 33.2,
      locale: 'en-US',
      date: new Date(2026, 6, 15),
    });

    expect(guide).toMatchObject({
      season: 'summer',
      climateBand: 'warm',
      zone: '8b',
      monthName: 'July',
      title: 'High summer in Zone 8b',
    });
    expect(guide?.suggestions.map((suggestion) => suggestion.cropName)).toEqual([
      'Okra',
      'Southern peas',
      'Broccoli',
    ]);
  });

  it('shifts the season and planting month in the southern hemisphere', () => {
    const guide = buildSeasonalGuide({
      homeZone: '10a',
      lat: -27.5,
      locale: 'en-AU',
      date: new Date(2026, 6, 15),
    });

    expect(guide).toMatchObject({
      season: 'winter',
      climateBand: 'hot',
      monthName: 'July',
      title: 'Deep winter in Zone 10a',
    });
    expect(guide?.suggestions[0].cropName).toBe('Tomatoes');
  });

  it('returns three distinct suggestions for every month and climate band', () => {
    const representativeZones = ['4a', '6b', '8b', '11a'];

    for (const homeZone of representativeZones) {
      for (let month = 0; month < 12; month += 1) {
        const guide = buildSeasonalGuide({
          homeZone,
          lat: 33,
          date: new Date(2026, month, 15),
        });
        const cropNames = guide?.suggestions.map((suggestion) => suggestion.cropName) ?? [];
        expect(cropNames).toHaveLength(3);
        expect(new Set(cropNames).size).toBe(3);
      }
    }
  });

  it('accepts valid USDA half-zones and rejects unusable values', () => {
    expect(parseHardinessZone(' 8B ')).toEqual({ number: 8, label: '8b' });
    expect(parseHardinessZone('13')).toEqual({ number: 13, label: '13' });
    expect(parseHardinessZone('0a')).toBeNull();
    expect(parseHardinessZone('14')).toBeNull();
    expect(parseHardinessZone('warm')).toBeNull();
  });
});
