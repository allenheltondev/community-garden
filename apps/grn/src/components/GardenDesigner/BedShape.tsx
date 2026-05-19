import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useRef } from 'react';
import { Ellipse, Group, Line, Path, Rect, Text, Transformer } from 'react-konva';
import type { BedType, GardenBed, GrowerCropItem } from '../../types/listing';
import { bedStyleFor } from './bedDefaults';
import { visualForCrop } from '../CropPlanner/cropVisuals';
import { CROP_ICON_PATHS } from '../CropPlanner/cropIconPaths';

interface BedShapeProps {
  bed: GardenBed;
  pxPerInch: number;
  isSelected: boolean;
  isEditable: boolean;
  crops: GrowerCropItem[];
  onSelect: (bedId: string) => void;
  onMove: (bedId: string, positionX: number, positionY: number) => void;
  onResize: (
    bedId: string,
    next: {
      positionX: number;
      positionY: number;
      lengthInches: number;
      widthInches: number;
      rotationDeg: number;
      points: Array<{ x: number; y: number }> | null;
    }
  ) => void;
}

const MAX_CHIPS = 6;
const CHIP_SIZE_PX = 22;
const MIN_BED_INCHES = 6;

// Konva's default Transformer anchor is ~12px wide. That's hard to hit on
// touch (Apple HIG recommends 44px minimum). When the device looks like
// it primarily uses touch we bump the anchor up so resize is reliable.
const TOUCH_DEVICE =
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);
const ANCHOR_SIZE = TOUCH_DEVICE ? 22 : 12;
const ANCHOR_STROKE_WIDTH = TOUCH_DEVICE ? 2 : 1;

function fillForBed(bedType: BedType, color: string | null): string {
  if (color) {
    return `${color}33`; // ~20% alpha hex suffix
  }
  return bedStyleFor(bedType).fill;
}

function strokeForBed(bedType: BedType, color: string | null): string {
  return color ?? bedStyleFor(bedType).stroke;
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
  onResize,
}: BedShapeProps) {
  const groupRef = useRef<Konva.Group | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);

  const positionX = (bed.positionX ?? 12) * pxPerInch;
  const positionY = (bed.positionY ?? 12) * pxPerInch;
  const widthPx = (bed.lengthInches ?? 96) * pxPerInch;
  const heightPx = (bed.widthInches ?? 48) * pxPerInch;

  const style = bedStyleFor(bed.bedType);
  const fill = fillForBed(bed.bedType, bed.color);
  const stroke = strokeForBed(bed.bedType, bed.color);
  const strokeWidth = isSelected ? 4 : style.strokeWidth;
  const accent = isSelected ? '#3a7e5a' : stroke;

  // Wire up the Transformer to the group whenever this bed becomes the
  // selection. Detach it when not selected or not editable so we don't
  // leave handles painted on a non-active bed.
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    if (isSelected && isEditable && groupRef.current) {
      transformer.nodes([groupRef.current]);
    } else {
      transformer.nodes([]);
    }
    transformer.getLayer()?.batchDraw();
  }, [isSelected, isEditable]);

  function handleDragEnd(event: KonvaEventObject<DragEvent>) {
    const node = event.target;
    if (node !== groupRef.current) return;
    const nextX = Math.round(node.x() / pxPerInch);
    const nextY = Math.round(node.y() / pxPerInch);
    onMove(bed.id, nextX, nextY);
  }

  function handleTransformEnd() {
    const node = groupRef.current;
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rotation = node.rotation();
    // Konva's Transformer applies a scale to the group. We translate that
    // back into real bed dimensions, then reset the scale on the node so
    // children render at the new natural size on the next pass.
    let nextLength = bed.lengthInches ?? 96;
    let nextWidth = bed.widthInches ?? 48;
    let nextPoints: Array<{ x: number; y: number }> | null = bed.points;
    nextLength = Math.max(MIN_BED_INCHES, Math.round(nextLength * scaleX));
    nextWidth = Math.max(MIN_BED_INCHES, Math.round(nextWidth * scaleY));
    // Polygons store geometry in the `points` array, so we have to bake
    // the resize into the points themselves — otherwise the polygon
    // would still render at its original size despite the new bounds.
    if (bed.shape === 'polygon' && bed.points) {
      nextPoints = bed.points.map((p) => ({
        x: Math.round(p.x * scaleX),
        y: Math.round(p.y * scaleY),
      }));
    }
    node.scaleX(1);
    node.scaleY(1);
    onResize(bed.id, {
      positionX: Math.max(0, Math.round(node.x() / pxPerInch)),
      positionY: Math.max(0, Math.round(node.y() / pxPerInch)),
      lengthInches: nextLength,
      widthInches: nextWidth,
      rotationDeg: Math.round(rotation),
      points: nextPoints,
    });
  }

  const dragProps = isEditable
    ? { draggable: true, onDragEnd: handleDragEnd }
    : { draggable: false };

  function renderShape() {
    if (bed.shape === 'circle') {
      // Konva.Ellipse with separate radiusX/radiusY so circles can be
      // oblong. When length === width the ellipse is a perfect circle.
      const radiusX = widthPx / 2;
      const radiusY = heightPx / 2;
      return (
        <Ellipse
          x={radiusX}
          y={radiusY}
          radiusX={radiusX}
          radiusY={radiusY}
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
        cornerRadius={style.cornerRadius}
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
    <>
    <Group
      ref={groupRef}
      x={positionX}
      y={positionY}
      rotation={bed.rotationDeg}
      onMouseDown={() => onSelect(bed.id)}
      onTouchStart={() => onSelect(bed.id)}
      onTransformEnd={handleTransformEnd}
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
      {visibleCrops.map((crop, idx) => {
        const visual = visualForCrop(crop.cropName);
        // CROP_ICON_PATHS are authored against a 24-unit viewBox, so scale
        // them down to the chip size. Icons are filled silhouettes.
        const scale = CHIP_SIZE_PX / 24;
        return (
          <Path
            key={crop.id}
            x={8 + idx * chipSpacing}
            y={chipY}
            data={CROP_ICON_PATHS[visual.iconKey]}
            fill={visual.accent}
            scaleX={scale}
            scaleY={scale}
            listening={false}
          />
        );
      })}
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
    {isEditable && (
      <Transformer
        ref={transformerRef}
        rotateEnabled
        keepRatio={false}
        enabledAnchors={[
          'top-left',
          'top-right',
          'bottom-left',
          'bottom-right',
          'middle-left',
          'middle-right',
          'top-center',
          'bottom-center',
        ]}
        boundBoxFunc={(oldBox, newBox) => {
          // Don't let users shrink a bed below the minimum visible size.
          const minPx = MIN_BED_INCHES * pxPerInch;
          if (Math.abs(newBox.width) < minPx || Math.abs(newBox.height) < minPx) {
            return oldBox;
          }
          return newBox;
        }}
        anchorStroke="#3a7e5a"
        anchorFill="#fff"
        anchorSize={ANCHOR_SIZE}
        anchorStrokeWidth={ANCHOR_STROKE_WIDTH}
        borderStroke="#3a7e5a"
        borderDash={[4, 4]}
      />
    )}
    </>
  );
}
