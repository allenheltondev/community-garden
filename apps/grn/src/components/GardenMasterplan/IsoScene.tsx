import {
  memo,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type {
  GardenAnnotation,
  GardenBed,
  GardenCanvas,
  GrowerCropItem,
} from '../../types/listing';
import type { SelectedItem } from '../../hooks/useGardenDesigner';
import {
  FLAT_KINDS,
  annotationFootprint,
  bedFootprint,
  sceneMetrics,
} from './footprints';
import {
  ISO_COS,
  ISO_SIN,
  PX_PER_INCH,
  boundsOf,
  depthOf,
  project,
  projectFootprint,
  scaleFootprint,
  screenDeltaToWorld,
  smoothClosedPath,
  type ScreenPoint,
  type WorldPoint,
} from './iso';
import { chooseCritters } from './critters';
import { IsoAnnotation } from './IsoAnnotation';
import { IsoBed } from './IsoBed';
import { IsoCritters } from './IsoCritters';
import { KIND_LABELS, SCENE, annotationKind } from './palette';
import type { SeasonMonth } from './season';
import { collectShadowCasters, shadowPolygonsFor, type SunTime } from './shadows';

// Organic ring of world points around the canvas rectangle — the lawn
// plate is a soft blob, not a hard parallelogram, so the plan reads as an
// illustrated property rather than a CAD sheet.
function groundRing(w: number, h: number, margin: number): WorldPoint[] {
  const points: WorldPoint[] = [];
  const step = Math.max(36, Math.min(w, h) / 5);
  const wobble = (i: number) => Math.sin(i * 2.7) * Math.min(9, margin * 0.5);
  for (let x = -margin; x < w + margin; x += step) {
    points.push({ x, y: -margin + wobble(points.length) });
  }
  for (let y = -margin; y < h + margin; y += step) {
    points.push({ x: w + margin + wobble(points.length), y });
  }
  for (let x = w + margin; x > -margin; x -= step) {
    points.push({ x, y: h + margin + wobble(points.length) });
  }
  for (let y = h + margin; y > -margin; y -= step) {
    points.push({ x: -margin + wobble(points.length), y });
  }
  return points;
}

// Past this much pointer travel (in scene units) a press becomes a drag
// rather than a click — mirrors the viewport's own click/pan threshold so
// the two feel consistent.
const DRAG_THRESHOLD = 4;

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  // Inverse of the scene <svg>'s screen CTM captured at grab time, so we
  // can convert client pixels into scene units regardless of pan/zoom.
  toScene: DOMMatrix | null;
  moved: boolean;
  worldX: number;
  worldY: number;
}

interface IsoElementProps {
  label: string;
  isSelected: boolean;
  onSelect: () => void;
  shouldIgnoreClick: () => boolean;
  children: ReactNode;
  // Editing (all optional; the read-only masterplan and shared view leave
  // these unset). When draggable is true and onMove + basePosition are
  // provided, pressing and dragging slides the element across the ground
  // plane and commits the new world position on release.
  draggable?: boolean;
  basePosition?: WorldPoint;
  snapInches?: number;
  onMove?: (x: number, y: number) => void;
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

// Shared interaction shell: focusable, labelled, and class-driven so
// hover/dim/selection styling stays in CSS where it can be GPU-animated.
// When editable, it also owns pointer-drag repositioning; a live screen
// translate gives instant feedback and the committed position only lands
// on release.
function IsoElement({
  label,
  isSelected,
  onSelect,
  shouldIgnoreClick,
  children,
  draggable = false,
  basePosition,
  snapInches = 0,
  onMove,
}: IsoElementProps) {
  const [dragTranslate, setDragTranslate] = useState<ScreenPoint | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const canDrag = draggable && !!onMove && !!basePosition;

  function handleClick(event: MouseEvent) {
    event.stopPropagation();
    if (shouldIgnoreClick()) return;
    // For draggable elements selection already happened on pointerdown;
    // re-selecting here is harmless but skipped to keep intent clear.
    if (!canDrag) onSelect();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect();
    }
  }

  function handlePointerDown(event: ReactPointerEvent<SVGGElement>) {
    if (!canDrag || event.button > 0) return;
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;
    let ctm: DOMMatrix | null = null;
    try {
      ctm = svg?.getScreenCTM() ?? null;
    } catch {
      // Not all environments implement getScreenCTM (e.g. jsdom); fall
      // back to raw client deltas, which are 1:1 with scene units at the
      // default zoom.
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      toScene: ctm ? ctm.inverse() : null,
      moved: false,
      worldX: basePosition!.x,
      worldY: basePosition!.y,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort; some environments reject it.
    }
    // Grab-to-select: dragging an unselected element selects it first.
    onSelect();
  }

  function handlePointerMove(event: ReactPointerEvent<SVGGElement>) {
    const state = dragRef.current;
    if (!state || event.pointerId !== state.pointerId) return;
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;
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
    if (!state.moved && Math.hypot(sceneDx, sceneDy) < DRAG_THRESHOLD) return;
    state.moved = true;
    const delta = screenDeltaToWorld(sceneDx, sceneDy);
    let nextX = Math.max(0, basePosition!.x + delta.x);
    let nextY = Math.max(0, basePosition!.y + delta.y);
    if (snapInches > 0) {
      nextX = Math.round(nextX / snapInches) * snapInches;
      nextY = Math.round(nextY / snapInches) * snapInches;
    }
    state.worldX = nextX;
    state.worldY = nextY;
    // Live feedback: project the committed ground delta back to screen so
    // the whole illustration (walls, crops, shadow) slides as one piece.
    setDragTranslate(project(nextX - basePosition!.x, nextY - basePosition!.y, 0));
  }

  function endDrag(event: ReactPointerEvent<SVGGElement>) {
    const state = dragRef.current;
    if (!state || event.pointerId !== state.pointerId) return;
    event.stopPropagation();
    try {
      event.currentTarget.releasePointerCapture(state.pointerId);
    } catch {
      // Capture may already be gone (e.g. pointercancel); ignore.
    }
    dragRef.current = null;
    if (state.moved && onMove) {
      onMove(Math.round(state.worldX), Math.round(state.worldY));
    }
    setDragTranslate(null);
  }

  const dragProps = canDrag
    ? {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: endDrag,
        onPointerCancel: endDrag,
      }
    : {};

  return (
    <g
      className={`mp-el${isSelected ? ' mp-el--selected' : ''}${
        canDrag ? ' mp-el--draggable' : ''
      }${dragTranslate ? ' mp-el--dragging' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={isSelected}
      transform={dragTranslate ? `translate(${dragTranslate.x} ${dragTranslate.y})` : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...dragProps}
    >
      {children}
    </g>
  );
}

interface IsoSceneProps {
  canvas: GardenCanvas;
  beds: GardenBed[];
  annotations: GardenAnnotation[];
  cropsByBedId: Map<string, GrowerCropItem[]>;
  selected: SelectedItem;
  onSelect: (next: SelectedItem) => void;
  shouldIgnoreClick: () => boolean;
  /** Selected scrubber month (0–11) or null for "All season". Styling only — crop filtering happens upstream. */
  seasonMonth?: SeasonMonth;
  /** Time of day for cast sun shadows, or null to hide the layer. */
  sunTime?: SunTime | null;
  /** When true, elements can be dragged to reposition them on the ground plane. */
  editable?: boolean;
  /** Grid snap for drag repositioning, in inches (0 = free placement). */
  snapInches?: number;
  onMoveBed?: (bedId: string, positionX: number, positionY: number) => void;
  onMoveAnnotation?: (annotationId: string, positionX: number, positionY: number) => void;
}

interface RenderItem {
  key: string;
  layer: number;
  depth: number;
  flat: boolean;
  node: ReactNode;
}

/**
 * The full isometric masterplan as a single SVG: lawn plate, contour
 * accents, depth-sorted garden elements, compass, and scale bar. Pan and
 * zoom are applied by the parent via a CSS transform on the wrapper, so
 * this component is layout-independent and cheap to leave untouched
 * during navigation.
 */
export const IsoScene = memo(function IsoScene({
  canvas,
  beds,
  annotations,
  cropsByBedId,
  selected,
  onSelect,
  shouldIgnoreClick,
  seasonMonth = null,
  sunTime = null,
  editable = false,
  snapInches = 0,
  onMoveBed,
  onMoveAnnotation,
}: IsoSceneProps) {
  const metrics = sceneMetrics(canvas);
  const w = canvas.widthInches;
  const h = canvas.heightInches;
  const northOffsetDeg = canvas.northOffsetDeg;

  // All cast sun shadows joined into one path: with a single fill,
  // overlapping shadows merge into a flat wash instead of stacking darker
  // where two casters overlap.
  const sunShadowPath = useMemo(() => {
    if (!sunTime) return null;
    const casters = collectShadowCasters(beds, annotations);
    if (casters.length === 0) return null;
    return shadowPolygonsFor(casters, sunTime, northOffsetDeg)
      .map((poly) => smoothClosedPath(projectFootprint(poly, 0)))
      .join(' ');
  }, [annotations, beds, northOffsetDeg, sunTime]);

  const ground = useMemo(() => {
    const margin = Math.max(14, Math.min(w, h) * 0.07);
    const ring = groundRing(w, h, margin);
    return {
      shadow: smoothClosedPath(
        projectFootprint(ring, 0).map((p) => ({ x: p.x + 10, y: p.y + 8 }))
      ),
      lawn: smoothClosedPath(projectFootprint(ring, 0)),
      wash: smoothClosedPath(projectFootprint(scaleFootprint(ring, 0.93), 0)),
      contourA: smoothClosedPath(projectFootprint(scaleFootprint(ring, 0.78), 0)),
      contourB: smoothClosedPath(projectFootprint(scaleFootprint(ring, 0.5), 0)),
    };
  }, [w, h]);

  const items = useMemo<RenderItem[]>(() => {
    const list: RenderItem[] = [];
    for (const annotation of annotations) {
      const kind = annotationKind(annotation);
      list.push({
        key: `annotation-${annotation.id}`,
        layer: annotation.sortOrder,
        depth: depthOf(annotationFootprint(annotation)),
        flat: FLAT_KINDS.has(kind),
        node: (
          <IsoElement
            key={`annotation-${annotation.id}`}
            label={`${annotation.label} (${KIND_LABELS[kind]})`}
            isSelected={selected?.kind === 'annotation' && selected.id === annotation.id}
            onSelect={() => onSelect({ kind: 'annotation', id: annotation.id })}
            shouldIgnoreClick={shouldIgnoreClick}
            draggable={editable}
            basePosition={{ x: annotation.positionX ?? 12, y: annotation.positionY ?? 12 }}
            snapInches={snapInches}
            onMove={
              onMoveAnnotation
                ? (x, y) => onMoveAnnotation(annotation.id, x, y)
                : undefined
            }
          >
            <IsoAnnotation
              annotation={annotation}
              isSelected={selected?.kind === 'annotation' && selected.id === annotation.id}
            />
          </IsoElement>
        ),
      });
    }
    for (const bed of beds) {
      const crops = cropsByBedId.get(bed.id) ?? [];
      list.push({
        key: `bed-${bed.id}`,
        layer: bed.sortOrder,
        depth: depthOf(bedFootprint(bed)),
        flat: false,
        node: (
          <IsoElement
            key={`bed-${bed.id}`}
            label={`${bed.name} (${bed.bedType === 'raised' ? 'raised bed' : bed.bedType === 'mound' ? 'mound' : 'in-ground bed'}${crops.length > 0 ? `, ${crops.length} crop${crops.length === 1 ? '' : 's'}` : ''})`}
            isSelected={selected?.kind === 'bed' && selected.id === bed.id}
            onSelect={() => onSelect({ kind: 'bed', id: bed.id })}
            shouldIgnoreClick={shouldIgnoreClick}
            draggable={editable}
            basePosition={{ x: bed.positionX ?? 12, y: bed.positionY ?? 12 }}
            snapInches={snapInches}
            onMove={onMoveBed ? (x, y) => onMoveBed(bed.id, x, y) : undefined}
          >
            <IsoBed
              bed={bed}
              crops={crops}
              isSelected={selected?.kind === 'bed' && selected.id === bed.id}
              seasonMonth={seasonMonth}
            />
          </IsoElement>
        ),
      });
    }
    // Painter's algorithm with a user override: the persisted sortOrder
    // acts as an explicit layer (everything defaults to 0, so untouched
    // gardens keep the pure geometric ordering). Within a layer,
    // ground-level surfaces paint first, then volumes from back
    // (north-west) to front (south-east).
    list.sort(
      (a, b) =>
        a.layer - b.layer || Number(b.flat) - Number(a.flat) || a.depth - b.depth
    );
    return list;
  }, [
    annotations,
    beds,
    cropsByBedId,
    onSelect,
    seasonMonth,
    selected,
    shouldIgnoreClick,
    editable,
    snapInches,
    onMoveBed,
    onMoveAnnotation,
  ]);

  // Ambient critters: deterministic per garden (seeded by the canvas id),
  // purely decorative, free for every IsoScene consumer including the
  // shared public garden page.
  const critters = useMemo(
    () =>
      chooseCritters({
        canvas: { widthInches: w, heightInches: h },
        beds,
        annotations,
        cropsByBedId,
        seed: canvas.id,
      }),
    [annotations, beds, canvas.id, cropsByBedId, h, w]
  );

  // Compass + scale bar live in screen space at the plate corners.
  const plate = boundsOf(
    projectFootprint([
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ])
  );
  const compass = { x: plate.maxX + 38, y: plate.minY + 6 };
  const scaleBar = {
    x: plate.minX + 4,
    y: plate.maxY + 42,
    dx: 48 * ISO_COS * PX_PER_INCH,
    dy: 48 * ISO_SIN * PX_PER_INCH,
  };

  function handleBackgroundClick() {
    if (shouldIgnoreClick()) return;
    onSelect(null);
  }

  return (
    <svg
      className="mp-scene"
      width={metrics.width}
      height={metrics.height}
      viewBox={metrics.viewBox}
      role="group"
      aria-label="Garden masterplan map"
      onClick={handleBackgroundClick}
    >
      <g className="mp-ground" aria-hidden="true">
        <path d={ground.shadow} fill={SCENE.groundShadow} />
        <path d={ground.lawn} fill={SCENE.lawn} />
        <path d={ground.wash} fill={SCENE.lawnLight} opacity={0.65} />
        <path
          d={ground.contourA}
          fill="none"
          stroke={SCENE.contour}
          strokeWidth={1}
          strokeDasharray="2 7"
          strokeLinecap="round"
        />
        <path
          d={ground.contourB}
          fill="none"
          stroke={SCENE.contour}
          strokeWidth={1}
          strokeDasharray="2 9"
          strokeLinecap="round"
        />
      </g>
      {sunShadowPath && (
        <g className="mp-sun-shadows" aria-hidden="true" data-testid="sun-shadows">
          <path d={sunShadowPath} fill={SCENE.elementShadow} fillRule="nonzero" />
        </g>
      )}
      <g className="mp-elements">{items.map((item) => item.node)}</g>
      <IsoCritters critters={critters} />
      <g
        className="mp-compass"
        aria-hidden="true"
        transform={`translate(${compass.x} ${compass.y})`}
      >
        <circle r={15} fill={SCENE.labelHalo} stroke={SCENE.contour} strokeWidth={1} />
        <g transform={`rotate(${canvas.northOffsetDeg})`}>
          <path d="M0 -10 L4 4 L0 1 L-4 4 Z" fill={SCENE.label} />
        </g>
        <text className="mp-compass__n" y={26} textAnchor="middle">
          N
        </text>
      </g>
      <g className="mp-scalebar" aria-hidden="true">
        <line
          x1={scaleBar.x}
          y1={scaleBar.y}
          x2={scaleBar.x + scaleBar.dx}
          y2={scaleBar.y + scaleBar.dy}
          stroke={SCENE.label}
          strokeWidth={1.4}
        />
        <line
          x1={scaleBar.x}
          y1={scaleBar.y - 4}
          x2={scaleBar.x}
          y2={scaleBar.y + 4}
          stroke={SCENE.label}
          strokeWidth={1.4}
        />
        <line
          x1={scaleBar.x + scaleBar.dx}
          y1={scaleBar.y + scaleBar.dy - 4}
          x2={scaleBar.x + scaleBar.dx}
          y2={scaleBar.y + scaleBar.dy + 4}
          stroke={SCENE.label}
          strokeWidth={1.4}
        />
        <text
          className="mp-label"
          x={scaleBar.x + scaleBar.dx / 2 + 10}
          y={scaleBar.y + scaleBar.dy / 2 + 2}
        >
          4 ft
        </text>
      </g>
    </svg>
  );
});
