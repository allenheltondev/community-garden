import { Circle, Group, Line, Rect, Text } from 'react-konva';
import type { BedType, GardenBed, GrowerCropItem } from '../../types/listing';
import { defaultsFor } from './bedDefaults';
import { visualForCrop } from '../CropPlanner/cropVisuals';

interface BedShapeProps {
  bed: GardenBed;
  pxPerInch: number;
  isSelected: boolean;
  isEditable: boolean;
  crops: GrowerCropItem[];
  onSelect: (bedId: string) => void;
  onMove: (bedId: string, positionX: number, positionY: number) => void;
}

const MAX_CHIPS = 6;
const CHIP_SIZE_PX = 22;

function fillForBed(bedType: BedType, color: string | null): string {
  if (color) {
    return `${color}33`; // ~20% alpha hex suffix
  }
  return defaultsFor(bedType).fill;
}

function strokeForBed(bedType: BedType, color: string | null): string {
  return color ?? defaultsFor(bedType).stroke;
}

/**
 * Visual + interactive representation of a single garden bed on the canvas.
 * Renders a shape (rect / circle / polygon) tinted by bed type, the bed
 * name as a label, and up to MAX_CHIPS crop emoji chips inside.
 *
 * Drag updates flow through the parent via onMove(bedId, x, y) so the
 * parent can debounce and persist them.
 */
export function BedShape({
  bed,
  pxPerInch,
  isSelected,
  isEditable,
  crops,
  onSelect,
  onMove,
}: BedShapeProps) {
  const positionX = (bed.positionX ?? 12) * pxPerInch;
  const positionY = (bed.positionY ?? 12) * pxPerInch;
  const widthPx = (bed.lengthInches ?? defaultsFor(bed.bedType).lengthInches) * pxPerInch;
  const heightPx = (bed.widthInches ?? defaultsFor(bed.bedType).widthInches) * pxPerInch;

  const fill = fillForBed(bed.bedType, bed.color);
  const stroke = strokeForBed(bed.bedType, bed.color);
  const strokeWidth = isSelected ? 4 : defaultsFor(bed.bedType).strokeWidth;
  const accent = isSelected ? '#3a7e5a' : stroke;

  const dragProps = isEditable
    ? {
        draggable: true,
        onDragEnd: (event: { target: { x: () => number; y: () => number } }) => {
          const nextX = Math.round(event.target.x() / pxPerInch);
          const nextY = Math.round(event.target.y() / pxPerInch);
          onMove(bed.id, nextX, nextY);
        },
      }
    : { draggable: false };

  function renderShape() {
    if (bed.shape === 'circle') {
      const radius = Math.max(widthPx, heightPx) / 2;
      return (
        <Circle
          x={radius}
          y={radius}
          radius={radius}
          fill={fill}
          stroke={accent}
          strokeWidth={strokeWidth}
          shadowColor="rgba(91, 58, 28, 0.18)"
          shadowBlur={isSelected ? 14 : 6}
          shadowOpacity={0.6}
        />
      );
    }
    if (bed.shape === 'polygon' && bed.points && bed.points.length >= 3) {
      const points = bed.points.flatMap((p) => [p.x * pxPerInch, p.y * pxPerInch]);
      return (
        <Line
          points={points}
          closed
          fill={fill}
          stroke={accent}
          strokeWidth={strokeWidth}
          lineJoin="round"
          shadowColor="rgba(91, 58, 28, 0.18)"
          shadowBlur={isSelected ? 14 : 6}
          shadowOpacity={0.6}
        />
      );
    }
    return (
      <Rect
        width={widthPx}
        height={heightPx}
        fill={fill}
        stroke={accent}
        strokeWidth={strokeWidth}
        cornerRadius={defaultsFor(bed.bedType).cornerRadius}
        shadowColor="rgba(91, 58, 28, 0.18)"
        shadowBlur={isSelected ? 14 : 6}
        shadowOpacity={0.6}
      />
    );
  }

  // Chips fan across the bottom of the bed in a row, wrapping to the next
  // row only when they exceed available width. Cropped at MAX_CHIPS.
  const visibleCrops = crops.slice(0, MAX_CHIPS);
  const overflow = Math.max(0, crops.length - MAX_CHIPS);
  const chipSpacing = CHIP_SIZE_PX + 4;
  const labelY =
    bed.shape === 'circle'
      ? heightPx / 2 - 14
      : Math.max(8, heightPx - CHIP_SIZE_PX - 30);
  const chipY =
    bed.shape === 'circle'
      ? heightPx / 2 + 8
      : Math.max(8, heightPx - CHIP_SIZE_PX - 6);

  return (
    <Group
      x={positionX}
      y={positionY}
      rotation={bed.rotationDeg}
      onMouseDown={() => onSelect(bed.id)}
      onTouchStart={() => onSelect(bed.id)}
      {...dragProps}
    >
      {renderShape()}
      <Text
        x={8}
        y={labelY}
        text={bed.name}
        fontSize={14}
        fontStyle="600"
        fill="#3a2b1a"
        listening={false}
      />
      {visibleCrops.map((crop, idx) => (
        <Text
          key={crop.id}
          x={8 + idx * chipSpacing}
          y={chipY}
          text={visualForCrop(crop.cropName).emoji}
          fontSize={CHIP_SIZE_PX}
          listening={false}
        />
      ))}
      {overflow > 0 && (
        <Text
          x={8 + visibleCrops.length * chipSpacing}
          y={chipY + 4}
          text={`+${overflow}`}
          fontSize={12}
          fill="#5b3a1c"
          listening={false}
        />
      )}
    </Group>
  );
}
