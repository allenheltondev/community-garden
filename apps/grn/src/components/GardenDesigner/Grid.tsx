import 'konva/lib/shapes/Line';
import 'konva/lib/shapes/Rect';
import { Group, Line, Rect } from 'react-konva/lib/ReactKonvaCore';

interface GridProps {
  widthInches: number;
  heightInches: number;
  pxPerInch: number;
  majorEvery?: number; // inches between major lines (default 12 = 1 foot)
  minorEvery?: number; // inches between minor lines (default 6)
  showMinor?: boolean;
}

const MAJOR_COLOR = 'rgba(91, 58, 28, 0.18)';
const MINOR_COLOR = 'rgba(91, 58, 28, 0.08)';
const BORDER_COLOR = 'rgba(91, 58, 28, 0.42)';
const CANVAS_FILL = 'rgba(255, 250, 239, 0.55)';

/**
 * Renders the canvas backdrop, the inch/foot grid lines, and the canvas
 * boundary. Pure presentation — accepts world dimensions in inches and a
 * pixel-per-inch scale.
 */
export function Grid({
  widthInches,
  heightInches,
  pxPerInch,
  majorEvery = 12,
  minorEvery = 6,
  showMinor = true,
}: GridProps) {
  const widthPx = widthInches * pxPerInch;
  const heightPx = heightInches * pxPerInch;

  const minorLines: Array<{ x?: number; y?: number }> = [];
  if (showMinor) {
    for (let i = minorEvery; i < widthInches; i += minorEvery) {
      if (i % majorEvery === 0) continue;
      minorLines.push({ x: i });
    }
    for (let i = minorEvery; i < heightInches; i += minorEvery) {
      if (i % majorEvery === 0) continue;
      minorLines.push({ y: i });
    }
  }

  const majorLines: Array<{ x?: number; y?: number }> = [];
  for (let i = majorEvery; i < widthInches; i += majorEvery) {
    majorLines.push({ x: i });
  }
  for (let i = majorEvery; i < heightInches; i += majorEvery) {
    majorLines.push({ y: i });
  }

  return (
    <Group listening={false}>
      <Rect
        x={0}
        y={0}
        width={widthPx}
        height={heightPx}
        fill={CANVAS_FILL}
        stroke={BORDER_COLOR}
        strokeWidth={1.5}
        cornerRadius={6}
        shadowColor="rgba(91, 58, 28, 0.18)"
        shadowBlur={18}
        shadowOffset={{ x: 0, y: 4 }}
        shadowOpacity={0.5}
      />
      {minorLines.map((line, idx) =>
        line.x !== undefined ? (
          <Line
            key={`minor-x-${idx}`}
            points={[line.x * pxPerInch, 0, line.x * pxPerInch, heightPx]}
            stroke={MINOR_COLOR}
            strokeWidth={1}
          />
        ) : (
          <Line
            key={`minor-y-${idx}`}
            points={[0, (line.y ?? 0) * pxPerInch, widthPx, (line.y ?? 0) * pxPerInch]}
            stroke={MINOR_COLOR}
            strokeWidth={1}
          />
        )
      )}
      {majorLines.map((line, idx) =>
        line.x !== undefined ? (
          <Line
            key={`major-x-${idx}`}
            points={[line.x * pxPerInch, 0, line.x * pxPerInch, heightPx]}
            stroke={MAJOR_COLOR}
            strokeWidth={1}
          />
        ) : (
          <Line
            key={`major-y-${idx}`}
            points={[0, (line.y ?? 0) * pxPerInch, widthPx, (line.y ?? 0) * pxPerInch]}
            stroke={MAJOR_COLOR}
            strokeWidth={1}
          />
        )
      )}
    </Group>
  );
}
