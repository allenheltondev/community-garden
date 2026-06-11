import type { KonvaEventObject } from 'konva/lib/Node';
import 'konva/lib/shapes/Circle';
import 'konva/lib/shapes/Line';
import { useState } from 'react';
import { Circle, Group, Line } from 'react-konva/lib/ReactKonvaCore';
import type { BedPolygonPoint, GardenBed } from '../../types/listing';
import type { GridSnap } from './Toolbar';

interface VertexEditorProps {
  bed: GardenBed;
  pxPerInch: number;
  snap: GridSnap;
  onCommit: (points: BedPolygonPoint[]) => void;
}

const MIN_POINTS = 3;

// Like Transformer anchors, vertex handles need to be finger-sized on
// touch devices (see BedShape's ANCHOR_SIZE rationale).
const TOUCH_DEVICE =
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);
const HANDLE_RADIUS = TOUCH_DEVICE ? 11 : 7;
const MIDPOINT_RADIUS = TOUCH_DEVICE ? 8 : 5;

function snapInches(value: number, snap: GridSnap): number {
  if (snap === 'off') return Math.round(value);
  const step = snap === '6' ? 6 : 12;
  return Math.round(value / step) * step;
}

/**
 * Per-vertex reshaping overlay for a selected polygon bed. Rendered in
 * the bed's local frame (same position/rotation as its BedShape group) so
 * handle drags map 1:1 onto the stored point list:
 *
 * - drag a solid handle to move that vertex (snapped on release)
 * - press a hollow midpoint handle to split the edge with a new vertex
 * - double-click/double-tap a handle to remove it (min 3 remain)
 *
 * A local draft keeps the dashed outline live during a drag; every
 * completed gesture commits the full point list upward, where the hook
 * re-anchors the geometry and persists it.
 */
export function VertexEditor({ bed, pxPerInch, snap, onCommit }: VertexEditorProps) {
  const [draft, setDraft] = useState<BedPolygonPoint[] | null>(null);

  const points = draft ?? bed.points ?? [];
  if (points.length < MIN_POINTS) return null;

  const positionX = (bed.positionX ?? 12) * pxPerInch;
  const positionY = (bed.positionY ?? 12) * pxPerInch;

  function replacePoint(index: number, next: BedPolygonPoint): BedPolygonPoint[] {
    return points.map((p, i) => (i === index ? next : p));
  }

  function handleDragMove(index: number, event: KonvaEventObject<DragEvent>) {
    const node = event.target;
    setDraft(
      replacePoint(index, { x: node.x() / pxPerInch, y: node.y() / pxPerInch })
    );
  }

  function handleDragEnd(index: number, event: KonvaEventObject<DragEvent>) {
    const node = event.target;
    const snapped = {
      x: snapInches(node.x() / pxPerInch, snap),
      y: snapInches(node.y() / pxPerInch, snap),
    };
    // Park the node on the snapped spot so it doesn't flash at the raw
    // drop position while the optimistic update round-trips.
    node.position({ x: snapped.x * pxPerInch, y: snapped.y * pxPerInch });
    setDraft(null);
    onCommit(replacePoint(index, snapped));
  }

  function handleRemove(index: number) {
    if (points.length <= MIN_POINTS) return;
    setDraft(null);
    onCommit(points.filter((_, i) => i !== index));
  }

  function handleInsertAfter(index: number, midpoint: BedPolygonPoint) {
    const next = [...points];
    next.splice(index + 1, 0, {
      x: Math.round(midpoint.x),
      y: Math.round(midpoint.y),
    });
    setDraft(null);
    onCommit(next);
  }

  const outline = points.flatMap((p) => [p.x * pxPerInch, p.y * pxPerInch]);

  return (
    <Group x={positionX} y={positionY} rotation={bed.rotationDeg}>
      <Line
        points={outline}
        closed
        stroke="#3a7e5a"
        strokeWidth={1.5}
        dash={[6, 4]}
        listening={false}
      />
      {points.map((point, idx) => {
        const next = points[(idx + 1) % points.length];
        const midpoint = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
        return (
          <Circle
            key={`mid-${idx}`}
            x={midpoint.x * pxPerInch}
            y={midpoint.y * pxPerInch}
            radius={MIDPOINT_RADIUS}
            fill="rgba(255, 255, 255, 0.9)"
            stroke="#3a7e5a"
            strokeWidth={1.5}
            onMouseDown={(event) => {
              event.cancelBubble = true;
              handleInsertAfter(idx, midpoint);
            }}
            onTouchStart={(event) => {
              event.cancelBubble = true;
              handleInsertAfter(idx, midpoint);
            }}
          />
        );
      })}
      {points.map((point, idx) => (
        <Circle
          key={`vertex-${idx}`}
          x={point.x * pxPerInch}
          y={point.y * pxPerInch}
          radius={HANDLE_RADIUS}
          fill="#3a7e5a"
          stroke="#fff"
          strokeWidth={2}
          draggable
          onMouseDown={(event) => {
            event.cancelBubble = true;
          }}
          onTouchStart={(event) => {
            event.cancelBubble = true;
          }}
          onDragMove={(event) => handleDragMove(idx, event)}
          onDragEnd={(event) => handleDragEnd(idx, event)}
          onDblClick={(event) => {
            event.cancelBubble = true;
            handleRemove(idx);
          }}
          onDblTap={(event) => {
            event.cancelBubble = true;
            handleRemove(idx);
          }}
        />
      ))}
    </Group>
  );
}
