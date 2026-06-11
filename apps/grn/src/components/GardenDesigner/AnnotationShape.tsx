import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import 'konva/lib/shapes/Circle';
import 'konva/lib/shapes/Line';
import 'konva/lib/shapes/Rect';
import 'konva/lib/shapes/Text';
import 'konva/lib/shapes/Transformer';
import { useEffect, useRef } from 'react';
import {
  Circle,
  Group,
  Line,
  Rect,
  Text,
  Transformer,
} from 'react-konva/lib/ReactKonvaCore';
import type { GardenAnnotation } from '../../types/listing';

interface AnnotationShapeProps {
  annotation: GardenAnnotation;
  pxPerInch: number;
  isSelected: boolean;
  isEditable: boolean;
  onSelect: (annotationId: string) => void;
  onMove: (annotationId: string, positionX: number, positionY: number) => void;
  onResize: (
    annotationId: string,
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

const MIN_INCHES = 4;
const FALLBACK_FILL = 'rgba(255, 255, 255, 0.55)';
const FALLBACK_STROKE = 'rgba(91, 58, 28, 0.55)';

// Bump Transformer anchor size on touch devices so the resize handles
// are actually reachable with a finger. Mirrors BedShape's logic.
const TOUCH_DEVICE =
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);
const ANCHOR_SIZE = TOUCH_DEVICE ? 22 : 12;
const ANCHOR_STROKE_WIDTH = TOUCH_DEVICE ? 2 : 1;

function applyAlpha(hex: string, alpha: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${alpha}` : hex;
}

/**
 * Renders a single non-bed annotation: trees, ponds, sheds, paths, etc.
 * Visually distinct from beds — no crop chips, lighter fill, dashed
 * outline so the eye can tell beds and annotations apart at a glance.
 */
export function AnnotationShape({
  annotation,
  pxPerInch,
  isSelected,
  isEditable,
  onSelect,
  onMove,
  onResize,
}: AnnotationShapeProps) {
  const groupRef = useRef<Konva.Group | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);

  const positionX = (annotation.positionX ?? 12) * pxPerInch;
  const positionY = (annotation.positionY ?? 12) * pxPerInch;
  const widthPx = (annotation.lengthInches ?? 48) * pxPerInch;
  const heightPx = (annotation.widthInches ?? 48) * pxPerInch;

  const fill = annotation.color ? applyAlpha(annotation.color, '22') : FALLBACK_FILL;
  const stroke = annotation.color ?? FALLBACK_STROKE;
  const accent = isSelected ? '#3a7e5a' : stroke;
  const strokeWidth = isSelected ? 3 : 2;
  const dashPattern = annotation.shape === 'line' ? undefined : [6, 4];

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
    onMove(annotation.id, Math.max(0, nextX), Math.max(0, nextY));
  }

  function handleTransformEnd() {
    const node = groupRef.current;
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rotation = node.rotation();
    let nextLength = annotation.lengthInches ?? 48;
    let nextWidth = annotation.widthInches ?? 48;
    let nextPoints = annotation.points;
    if (annotation.shape === 'circle') {
      const uniformScale = (scaleX + scaleY) / 2;
      nextLength = Math.max(MIN_INCHES, Math.round(nextLength * uniformScale));
      nextWidth = nextLength;
    } else {
      nextLength = Math.max(MIN_INCHES, Math.round(nextLength * scaleX));
      nextWidth = Math.max(MIN_INCHES, Math.round(nextWidth * scaleY));
      if ((annotation.shape === 'polygon' || annotation.shape === 'line') && annotation.points) {
        nextPoints = annotation.points.map((p) => ({
          x: Math.round(p.x * scaleX),
          y: Math.round(p.y * scaleY),
        }));
      }
    }
    node.scaleX(1);
    node.scaleY(1);
    onResize(annotation.id, {
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
    if (annotation.shape === 'circle') {
      const radius = Math.max(widthPx, heightPx) / 2;
      return (
        <Circle
          x={radius}
          y={radius}
          radius={radius}
          fill={fill}
          stroke={accent}
          strokeWidth={strokeWidth}
          dash={dashPattern}
        />
      );
    }
    if (
      (annotation.shape === 'polygon' || annotation.shape === 'line') &&
      annotation.points &&
      annotation.points.length >= 2
    ) {
      const points = annotation.points.flatMap((p) => [
        p.x * pxPerInch,
        p.y * pxPerInch,
      ]);
      return (
        <Line
          points={points}
          closed={annotation.shape === 'polygon'}
          fill={annotation.shape === 'polygon' ? fill : undefined}
          stroke={accent}
          strokeWidth={annotation.shape === 'line' ? Math.max(strokeWidth, 4) : strokeWidth}
          lineCap={annotation.shape === 'line' ? 'round' : undefined}
          lineJoin="round"
          dash={dashPattern}
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
        dash={dashPattern}
        cornerRadius={2}
      />
    );
  }

  // Place the icon + label in the top-left of the annotation box. For
  // lines the label sits just above the line midpoint.
  const labelX = annotation.shape === 'line' ? Math.round(widthPx / 2) - 36 : 8;
  const labelY = annotation.shape === 'line' ? -22 : 8;

  return (
    <>
      <Group
        ref={groupRef}
        x={positionX}
        y={positionY}
        rotation={annotation.rotationDeg}
        onMouseDown={() => onSelect(annotation.id)}
        onTouchStart={() => onSelect(annotation.id)}
        onTransformEnd={handleTransformEnd}
        {...dragProps}
      >
        {renderShape()}
        {annotation.icon && (
          <Text
            x={labelX}
            y={labelY}
            text={annotation.icon}
            fontSize={20}
            listening={false}
          />
        )}
        <Text
          x={labelX + (annotation.icon ? 26 : 0)}
          y={labelY + 4}
          text={annotation.label}
          fontSize={12}
          fontStyle="500"
          fill="#3a2b1a"
          listening={false}
        />
      </Group>
      {isEditable && (
        <Transformer
          ref={transformerRef}
          rotateEnabled
          keepRatio={annotation.shape === 'circle'}
          enabledAnchors={
            annotation.shape === 'circle'
              ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
              : ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']
          }
          boundBoxFunc={(oldBox, newBox) => {
            const minPx = MIN_INCHES * pxPerInch;
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
