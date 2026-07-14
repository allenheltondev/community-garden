// Distance math + display formatting for dimension labels (e.g. the
// masterplan vertex editor's edge lengths). World units are inches.

export interface MeasurePoint {
  x: number;
  y: number;
}

export function distanceInches(a: MeasurePoint, b: MeasurePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// 100 -> 8' 4", 96 -> 8', 7 -> 7". Rounded to the nearest inch — finer
// precision is noise at garden scale.
export function formatInchesAsFeetInches(value: number): string {
  const inches = Math.max(0, Math.round(value));
  const feet = Math.floor(inches / 12);
  const rest = inches % 12;
  if (feet === 0) return `${rest}"`;
  if (rest === 0) return `${feet}'`;
  return `${feet}' ${rest}"`;
}

export function formatDimensions(lengthInches: number, widthInches: number): string {
  return `${formatInchesAsFeetInches(lengthInches)} × ${formatInchesAsFeetInches(widthInches)}`;
}

// Total length along an open polyline (fences, paths).
export function polylineLengthInches(points: MeasurePoint[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    total += distanceInches(points[i], points[i + 1]);
  }
  return total;
}
