import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  projectPoint,
  screenDeltaToWorld,
  unprojectGround,
  worldCentroid,
  type ScreenPoint,
} from './iso';
import {
  angleFromTo,
  boxCornersWorld,
  resizeFromCornerDrag,
  rotateGeometry,
  type ElementGeometry,
} from './isoTransform';

// Finger-sized handles on touch, tighter on a mouse — mirrors the sizing
// rationale in the old Konva VertexEditor.
const TOUCH_DEVICE =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window);
const HANDLE_RADIUS = TOUCH_DEVICE ? 11 : 7;
// How far above the top edge the rotate knob floats, in screen px.
const ROTATE_OFFSET = TOUCH_DEVICE ? 34 : 26;
// Snap rotation to 15° while Shift is held, matching common design tools.
const ROTATE_SNAP_DEG = 15;

interface IsoTransformHandlesProps {
  geometry: ElementGeometry;
  snapInches: number;
  /** Live geometry during a drag — parent renders the element from this. */
  onPreview: (geometry: ElementGeometry) => void;
  /** Final geometry on release — parent persists it once (undoable). */
  onCommit: (geometry: ElementGeometry) => void;
}

interface DragState {
  pointerId: number;
  kind: 'resize' | 'rotate';
  cornerIndex: number;
  startClientX: number;
  startClientY: number;
  toScene: DOMMatrix | null;
  g0: ElementGeometry;
  // Rotate-only: fixed box center + pointer angle at grab time.
  center: { x: number; y: number };
  startAngle: number;
  latest: ElementGeometry;
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

/**
 * Direct-manipulation resize + rotate handles drawn over the selected
 * element's transform box. Corner handles resize (opposite corner stays
 * put); the knob above the top edge rotates about the box center. Motion
 * maps through the same getScreenCTM-inverse path the drag-to-move code
 * uses, so it stays correct under any pan/zoom.
 */
export function IsoTransformHandles({
  geometry,
  snapInches,
  onPreview,
  onCommit,
}: IsoTransformHandlesProps) {
  const dragRef = useRef<DragState | null>(null);

  const corners = boxCornersWorld(geometry);
  const cornersScreen = corners.map((c) => projectPoint(c));
  const topMid: ScreenPoint = {
    x: (cornersScreen[0].x + cornersScreen[1].x) / 2,
    y: (cornersScreen[0].y + cornersScreen[1].y) / 2,
  };
  const rotateKnob: ScreenPoint = { x: topMid.x, y: topMid.y - ROTATE_OFFSET };

  function grab(
    event: ReactPointerEvent<SVGGElement>,
    kind: 'resize' | 'rotate',
    cornerIndex: number
  ) {
    if (event.button > 0) return;
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;
    let toScene: DOMMatrix | null = null;
    try {
      const ctm = svg?.getScreenCTM();
      toScene = ctm ? ctm.inverse() : null;
    } catch {
      // jsdom and some embeds lack getScreenCTM; fall back to raw client
      // deltas (1:1 with scene units at the default zoom), as IsoElement does.
    }
    const center = worldCentroid(boxCornersWorld(geometry));
    let startAngle = 0;
    if (kind === 'rotate' && svg && toScene) {
      const scene = clientToScene(svg, event.clientX, event.clientY, toScene);
      startAngle = angleFromTo(center, unprojectGround(scene));
    }
    dragRef.current = {
      pointerId: event.pointerId,
      kind,
      cornerIndex,
      startClientX: event.clientX,
      startClientY: event.clientY,
      toScene,
      g0: geometry,
      center,
      startAngle,
      latest: geometry,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort.
    }
  }

  function move(event: ReactPointerEvent<SVGGElement>) {
    const state = dragRef.current;
    if (!state || event.pointerId !== state.pointerId) return;
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;

    if (state.kind === 'resize') {
      let sceneDx: number;
      let sceneDy: number;
      if (state.toScene && svg) {
        const from = clientToScene(svg, state.startClientX, state.startClientY, state.toScene);
        const to = clientToScene(svg, event.clientX, event.clientY, state.toScene);
        sceneDx = to.x - from.x;
        sceneDy = to.y - from.y;
      } else {
        sceneDx = event.clientX - state.startClientX;
        sceneDy = event.clientY - state.startClientY;
      }
      const worldDelta = screenDeltaToWorld(sceneDx, sceneDy);
      const next = resizeFromCornerDrag(state.g0, state.cornerIndex, worldDelta, snapInches);
      state.latest = next;
      onPreview(next);
      return;
    }

    // rotate
    if (!state.toScene || !svg) return;
    const scene = clientToScene(svg, event.clientX, event.clientY, state.toScene);
    const angle = angleFromTo(state.center, unprojectGround(scene));
    const deltaDeg = angle - state.startAngle;
    const next = rotateGeometry(state.g0, deltaDeg, event.shiftKey ? ROTATE_SNAP_DEG : 0);
    state.latest = next;
    onPreview(next);
  }

  function end(event: ReactPointerEvent<SVGGElement>) {
    const state = dragRef.current;
    if (!state || event.pointerId !== state.pointerId) return;
    event.stopPropagation();
    try {
      event.currentTarget.releasePointerCapture(state.pointerId);
    } catch {
      // Capture may already be gone (pointercancel); ignore.
    }
    dragRef.current = null;
    onCommit(state.latest);
  }

  const dragHandlers = {
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
  };

  return (
    <g className="mp-transform" aria-hidden="true">
      <path
        className="mp-transform__box"
        d={`M${cornersScreen
          .map((p) => `${p.x} ${p.y}`)
          .join(' L')} Z`}
        fill="none"
      />
      <line
        className="mp-transform__arm"
        x1={topMid.x}
        y1={topMid.y}
        x2={rotateKnob.x}
        y2={rotateKnob.y}
      />
      <g
        className="mp-transform__rotate"
        onPointerDown={(event) => grab(event, 'rotate', 0)}
        {...dragHandlers}
      >
        <circle cx={rotateKnob.x} cy={rotateKnob.y} r={HANDLE_RADIUS} />
      </g>
      {cornersScreen.map((p, index) => (
        <g
          key={index}
          className="mp-transform__resize"
          onPointerDown={(event) => grab(event, 'resize', index)}
          {...dragHandlers}
        >
          <rect
            x={p.x - HANDLE_RADIUS}
            y={p.y - HANDLE_RADIUS}
            width={HANDLE_RADIUS * 2}
            height={HANDLE_RADIUS * 2}
            rx={2}
          />
        </g>
      ))}
    </g>
  );
}
