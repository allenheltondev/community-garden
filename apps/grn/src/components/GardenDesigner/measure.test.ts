import { describe, expect, it } from 'vitest';
import {
  distanceInches,
  formatDimensions,
  formatInchesAsFeetInches,
  polylineLengthInches,
} from './measure';

describe('distanceInches', () => {
  it('measures straight and diagonal distances', () => {
    expect(distanceInches({ x: 0, y: 0 }, { x: 36, y: 0 })).toBe(36);
    expect(distanceInches({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('formatInchesAsFeetInches', () => {
  it('formats inches under a foot', () => {
    expect(formatInchesAsFeetInches(7)).toBe('7"');
    expect(formatInchesAsFeetInches(0)).toBe('0"');
  });

  it('formats whole feet without an inch part', () => {
    expect(formatInchesAsFeetInches(96)).toBe("8'");
    expect(formatInchesAsFeetInches(12)).toBe("1'");
  });

  it('formats mixed feet and inches, rounding to the nearest inch', () => {
    expect(formatInchesAsFeetInches(100)).toBe('8\' 4"');
    expect(formatInchesAsFeetInches(100.4)).toBe('8\' 4"');
    expect(formatInchesAsFeetInches(100.6)).toBe('8\' 5"');
  });

  it('clamps negatives to zero', () => {
    expect(formatInchesAsFeetInches(-3)).toBe('0"');
  });
});

describe('formatDimensions', () => {
  it('joins both axes', () => {
    expect(formatDimensions(96, 48)).toBe("8' × 4'");
    expect(formatDimensions(100, 7)).toBe('8\' 4" × 7"');
  });
});

describe('polylineLengthInches', () => {
  it('sums segment lengths and handles degenerate inputs', () => {
    expect(
      polylineLengthInches([
        { x: 0, y: 0 },
        { x: 36, y: 0 },
        { x: 36, y: 48 },
      ])
    ).toBe(84);
    expect(polylineLengthInches([{ x: 5, y: 5 }])).toBe(0);
    expect(polylineLengthInches([])).toBe(0);
  });
});
