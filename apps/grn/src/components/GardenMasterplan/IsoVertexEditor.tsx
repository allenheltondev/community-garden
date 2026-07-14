import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { BedPolygonPoint, GardenBed } from '../../types/listing';
import {
  distanceInches,
  formatInchesAsFeetInches,
} from '../GardenDesigner/measure';
import {
  polygonFootprint,
  projectPoint,
  rotateWorld,
  unprojectGround,
  type ScreenPoint,
} from './iso';

const MIN_POINTS = 3;

const TOUCH_DEVICE =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);
const HANDLE_RADIUS = TOUCH_DEVICE ? 11 : 7;
const MIDPOINT_RADIUS = TOUCH_DEVICE ? 8 : 5;
// Finger-friendly invisible grab zone around each drawn handle.
const HIT_RADIUS = HANDLE_RADIUS + (TOUCH_DEVICE ? 12 : 6);

interface IsoVertexEditorProps {
  bed: GardenBed;
  snapInches: number;
  onCommit: (points: BedPolygonPoint[]) => void;
}

interface DragState {
  pointerId: number;
  index: number;
  toScene: DOMMatrix | null;
}

function clientToScene(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  inverse: DOMMatrix
): ScreenPoint {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const mapped = point.matrixTransform(inverse);
  return { x: mapped.x, y: mapped.y };
}

function snap(value: number, snapInches: number): number {
  if (snapInches <= 0) return Math.round(value);
  return Math.round(value / snapInches) * snapInches;
}

/**
 * Per-vertex reshaping overlay for a selected custom-shape (polygon) bed,
 * drawn directly in the isometric scene. It mirrors the old top-down
 * VertexEditor's gestures:
 *
 * - drag a solid handle to move that vertex (snapped)
 * - press a hollow midpoint to split the edge with a new vertex
 * - double-click/tap a handle to remove it (min 3 remain)
 *
 * Handles live in projected screen space (the iso projection isn't a plain
 * SVG transform), so each committed gesture ships the full point list up to
 * `onCommit`, where the hook re-anchors and persists it.
 */
export function IsoVertexEditor({ bed, snapInches, onCommit }: IsoVertexEditorProps) {
  const [draft, setDraft] = useState<BedPolygonPoint[] | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const points = draft ?? bed.points ?? [];
  if (points.length < MIN_POINTS) return null;

  const posX = bed.positionX ?? 12;
  const posY = bed.positionY ?? 12;

  // Local (un-rotated, position-relative) point → projected screen point.
  const worldPoints = polygonFootprint({
    x: posX,
    y: posY,
    points,
    rotationDeg: bed.rotationDeg,
  });
  const screenPoints = worldPoints.map(projectPoint);

  // Screen point → local polygon coordinates: unproject to the ground
  // plane, undo the bed rotation about its origin, then drop the origin.
  function sceneToLocal(scene: ScreenPoint): BedPolygonPoint {
    const world = unprojectGround(scene);
    const unrotated = rotateWorld([world], posX, posY, -bed.rotationDeg)[0];
    return { x: unrotated.x - posX, y: unrotated.y - posY };
  }

  function replacePoint(index: number, next: BedPolygonPoint): BedPolygonPoint[] {
    return points.map((p, i) => (i === index ? next : p));
  }

  function handleDown(index: number, event: ReactPointerEvent<SVGGElement>) {
    if (event.button > 0) return;
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;
    let toScene: DOMMatrix | null = null;
    try {
      const ctm = svg?.getScreenCTM();
      toScene = ctm ? ctm.inverse() : null;
    } catch {
      // No getScreenCTM (jsdom): drag mapping is unavailable; taps still work.
    }
    dragRef.current = { pointerId: event.pointerId, index, toScene };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // best-effort
    }
  }

  function handleMove(event: ReactPointerEvent<SVGGElement>) {
    const state = dragRef.current;
    if (!state || event.pointerId !== state.pointerId) return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!state.toScene || !svg) return;
    event.stopPropagation();
    const scene = clientToScene(svg, event.clientX, event.clientY, state.toScene);
    const local = sceneToLocal(scene);
    setDraft(replacePoint(state.index, { x: Math.round(local.x), y: Math.round(local.y) }));
  }

  function handleUp(event: ReactPointerEvent<SVGGElement>) {
    const state = dragRef.current;
    if (!state || event.pointerId !== state.pointerId) return;
    event.stopPropagation();
    try {
      event.currentTarget.releasePointerCapture(state.pointerId);
    } catch {
      // best-effort
    }
    dragRef.current = null;
    const current = draft ?? bed.points ?? [];
    const raw = current[state.index];
    if (!raw) {
      setDraft(null);
      return;
    }
    const snapped = { x: snap(raw.x, snapInches), y: snap(raw.y, snapInches) };
    setDraft(null);
    onCommit(replacePoint(state.index, snapped));
  }

  function insertAfter(index: number) {
    const next = points[(index + 1) % points.length];
    const point = points[index];
    const midpoint = {
      x: Math.round((point.x + next.x) / 2),
      y: Math.round((point.y + next.y) / 2),
    };
    const updated = [...points];
    updated.splice(index + 1, 0, midpoint);
    setDraft(null);
    onCommit(updated);
  }

  function removeVertex(index: number) {
    if (points.length <= MIN_POINTS) return;
    setDraft(null);
    onCommit(points.filter((_, i) => i !== index));
  }

  const dragHandlers = {
    onPointerMove: handleMove,
    onPointerUp: handleUp,
    onPointerCancel: handleUp,
  };

  return (
    <g className="mp-vertex">
      <path
        className="mp-vertex__outline"
        d={`M${screenPoints.map((p) => `${p.x} ${p.y}`).join(' L')} Z`}
        fill="none"
      />
      {screenPoints.map((p, idx) => {
        const next = screenPoints[(idx + 1) % screenPoints.length];
        const mid = { x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 };
        const edgeLength = distanceInches(points[idx], points[(idx + 1) % points.length]);
        return (
          <g key={`edge-${idx}`}>
            <circle
              className="mp-vertex__hit"
              cx={mid.x}
              cy={mid.y}
              r={HIT_RADIUS}
              onPointerDown={(event) => {
                event.stopPropagation();
                insertAfter(idx);
              }}
            />
            <circle
              className="mp-vertex__midpoint"
              cx={mid.x}
              cy={mid.y}
              r={MIDPOINT_RADIUS}
              onPointerDown={(event) => {
                event.stopPropagation();
                insertAfter(idx);
              }}
            />
            {edgeLength >= 12 && (
              <text className="mp-vertex__edge-label" x={mid.x} y={mid.y - 10}>
                {formatInchesAsFeetInches(edgeLength)}
              </text>
            )}
          </g>
        );
      })}
      {screenPoints.map((p, idx) => (
        <g
          key={`vertex-${idx}`}
          className="mp-vertex__handle"
          onPointerDown={(event) => handleDown(idx, event)}
          onDoubleClick={(event) => {
            event.stopPropagation();
            removeVertex(idx);
          }}
          {...dragHandlers}
        >
          <circle className="mp-vertex__hit" cx={p.x} cy={p.y} r={HIT_RADIUS} />
          <circle cx={p.x} cy={p.y} r={HANDLE_RADIUS} />
        </g>
      ))}
    </g>
  );
}
