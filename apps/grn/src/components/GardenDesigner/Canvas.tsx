// The designer imports Konva's core plus only the shapes it renders
// (react-konva's "minimal bundle" pattern) — the full konva build carries
// every shape and filter and blows the app's JS performance budget.
import Konva from 'konva/lib/Core';
import 'konva/lib/shapes/Circle';
import 'konva/lib/shapes/Line';
import 'konva/lib/shapes/Rect';
import 'konva/lib/shapes/Text';
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useImperativeHandle } from 'react';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Stage as KonvaStage } from 'konva/lib/Stage';
import { Circle, Layer, Line, Rect, Stage, Text } from 'react-konva/lib/ReactKonvaCore';

// Tighten Konva's click-vs-drag detection. The default of 0px means any
// pointer jitter on a draggable Group fires a drag instead of a click,
// which made bed selection flaky: the inspector would briefly appear
// then disappear because Konva fired both a drag-end (committing a
// 1-pixel "move") AND a click on the stage, and the latter target ended
// up being the stage itself rather than the bed.
Konva.dragDistance = 4;
import type {
  BedPolygonPoint,
  GardenAnnotation,
  GardenBed,
  GardenCanvas,
  GrowerCropItem,
} from '../../types/listing';
import { AnnotationShape } from './AnnotationShape';
import { BackgroundLayer } from './BackgroundLayer';
import { BedShape } from './BedShape';
import { Grid } from './Grid';
import { VertexEditor } from './VertexEditor';
import { distanceInches, formatInchesAsFeetInches } from './measure';
import type { SelectedItem } from '../../hooks/useGardenDesigner';
import type { DesignerMode, GridSnap } from './Toolbar';

interface DesignerCanvasProps {
  canvas: GardenCanvas;
  beds: GardenBed[];
  annotations: GardenAnnotation[];
  cropsByBedId: Map<string, GrowerCropItem[]>;
  selected: SelectedItem;
  isEditable: boolean;
  mode: DesignerMode;
  snap: GridSnap;
  backgroundImageUrl: string | null;
  onSelect: (next: SelectedItem) => void;
  onMoveBed: (bedId: string, positionX: number, positionY: number) => void;
  onResizeBed: (
    bedId: string,
    next: {
      positionX: number;
      positionY: number;
      lengthInches: number;
      widthInches: number;
      rotationDeg: number;
      points: BedPolygonPoint[] | null;
    }
  ) => void;
  onMoveAnnotation: (annotationId: string, positionX: number, positionY: number) => void;
  onResizeAnnotation: (
    annotationId: string,
    next: {
      positionX: number;
      positionY: number;
      lengthInches: number;
      widthInches: number;
      rotationDeg: number;
      points: BedPolygonPoint[] | null;
    }
  ) => void;
  onCommitPolygon: (points: BedPolygonPoint[]) => void;
  onCancelPolygon: () => void;
  onUpdateBedPoints: (bedId: string, points: BedPolygonPoint[]) => void;
}

export interface DesignerCanvasHandle {
  fitToScreen: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

const PX_PER_INCH = 4;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.05;
const BUTTON_ZOOM_STEP = 1.25;

function snapValue(value: number, snap: GridSnap): number {
  if (snap === 'off') return value;
  const step = snap === '6' ? 6 : 12;
  return Math.round(value / step) * step;
}

function clampScale(scale: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

/**
 * The core react-konva surface. Owns viewport/pan/zoom state, hosts the
 * background image, grid, beds, and the in-progress polygon being drawn.
 *
 * Coordinates throughout are in inches in the world; we multiply by
 * PX_PER_INCH at render time. Stage scale/position handles user-driven
 * pan/zoom on top of that.
 */
export const DesignerCanvas = forwardRef<DesignerCanvasHandle, DesignerCanvasProps>(
  function DesignerCanvas(
    {
      canvas,
      beds,
      annotations,
      cropsByBedId,
      selected,
      isEditable,
      mode,
      snap,
      backgroundImageUrl,
      onSelect,
      onMoveBed,
      onResizeBed,
      onMoveAnnotation,
      onResizeAnnotation,
      onCommitPolygon,
      onCancelPolygon,
      onUpdateBedPoints,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const stageRef = useRef<KonvaStage | null>(null);
    // Seed with non-zero defaults so the Konva Stage mounts on first render.
    // The grid + min-height CSS guarantees the container will have at least
    // these dimensions; the ResizeObserver below replaces them with the real
    // measurement as soon as layout settles.
    const [viewport, setViewport] = useState<{ width: number; height: number }>({
      width: 800,
      height: 520,
    });
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [draftPoints, setDraftPoints] = useState<BedPolygonPoint[]>([]);
    const [hoverPoint, setHoverPoint] = useState<BedPolygonPoint | null>(null);
    // Tape measure: A is set on first click, B on the second (frozen
    // segment); a third click starts a fresh measurement.
    const [measureA, setMeasureA] = useState<BedPolygonPoint | null>(null);
    const [measureB, setMeasureB] = useState<BedPolygonPoint | null>(null);

    // Refs used during touch gestures so handlers don't need to be
    // re-bound on every render. The pinch handler in particular runs
    // many times per second.
    const scaleRef = useRef(scale);
    const positionRef = useRef(position);
    scaleRef.current = scale;
    positionRef.current = position;

    const widthPx = canvas.widthInches * PX_PER_INCH;
    const heightPx = canvas.heightInches * PX_PER_INCH;

    const fitToScreen = useCallback(() => {
      if (viewport.width === 0 || viewport.height === 0) return;
      const padding = 48;
      const availableWidth = viewport.width - padding * 2;
      const availableHeight = viewport.height - padding * 2;
      const fit = Math.min(availableWidth / widthPx, availableHeight / heightPx);
      const nextScale = clampScale(fit);
      const offsetX = (viewport.width - widthPx * nextScale) / 2;
      const offsetY = (viewport.height - heightPx * nextScale) / 2;
      setScale(nextScale);
      setPosition({ x: offsetX, y: offsetY });
    }, [viewport.width, viewport.height, widthPx, heightPx]);

    // Zoom around the centre of the viewport so on-screen +/- buttons
    // (especially mobile) keep the user's focus visually anchored.
    const zoomBy = useCallback(
      (factor: number) => {
        if (viewport.width === 0 || viewport.height === 0) return;
        const currentScale = scaleRef.current;
        const nextScale = clampScale(currentScale * factor);
        if (nextScale === currentScale) return;
        const cx = viewport.width / 2;
        const cy = viewport.height / 2;
        const stageX = (cx - positionRef.current.x) / currentScale;
        const stageY = (cy - positionRef.current.y) / currentScale;
        setScale(nextScale);
        setPosition({
          x: cx - stageX * nextScale,
          y: cy - stageY * nextScale,
        });
      },
      [viewport.width, viewport.height]
    );

    useImperativeHandle(
      ref,
      () => ({
        fitToScreen,
        zoomIn: () => zoomBy(BUTTON_ZOOM_STEP),
        zoomOut: () => zoomBy(1 / BUTTON_ZOOM_STEP),
      }),
      [fitToScreen, zoomBy]
    );

    // Track the container size so the stage matches available space.
    useEffect(() => {
      const node = containerRef.current;
      if (!node) return;
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        setViewport({ width: Math.floor(width), height: Math.floor(height) });
      });
      observer.observe(node);
      return () => observer.disconnect();
    }, []);

    // Center the canvas in the viewport on first measurement and any time
    // the world dimensions change. Subsequent user pans/zooms are preserved
    // because the deps only fire when viewport or canvas size changes.
    useEffect(() => {
      if (viewport.width > 0 && viewport.height > 0) {
        fitToScreen();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewport.width, viewport.height, widthPx, heightPx]);

    // Reset draft state whenever we leave drawing mode.
    useEffect(() => {
      if (mode !== 'drawing-polygon') {
        setDraftPoints([]);
        setHoverPoint(null);
      }
      if (mode !== 'measuring') {
        setMeasureA(null);
        setMeasureB(null);
      }
    }, [mode]);

    // Esc cancels in-progress drawing.
    useEffect(() => {
      function onKeyDown(event: KeyboardEvent) {
        if (event.key === 'Escape' && mode === 'drawing-polygon') {
          onCancelPolygon();
        }
      }
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    }, [mode, onCancelPolygon]);

    const drawing = mode === 'drawing-polygon';
    const measuring = mode === 'measuring';

    // The bed whose vertices are being reshaped, if any. Its own
    // drag/Transformer interactions are suspended while the handles own
    // the gesture space.
    const vertexEditBed =
      mode === 'editing-vertices' && selected?.kind === 'bed'
        ? beds.find(
            (b) =>
              b.id === selected.id &&
              b.shape === 'polygon' &&
              (b.points?.length ?? 0) >= 3
          )
        : undefined;

    // Beds and annotations stack by their persisted sortOrder (the same
    // value the masterplan uses for paint order). At equal sortOrder,
    // annotations keep their historical place under beds.
    const stacked: Array<
      | { kind: 'bed'; sortOrder: number; tier: number; index: number; bed: GardenBed }
      | {
          kind: 'annotation';
          sortOrder: number;
          tier: number;
          index: number;
          annotation: GardenAnnotation;
        }
    > = [
      ...annotations.map((annotation, index) => ({
        kind: 'annotation' as const,
        sortOrder: annotation.sortOrder,
        tier: 0,
        index,
        annotation,
      })),
      ...beds.map((bed, index) => ({
        kind: 'bed' as const,
        sortOrder: bed.sortOrder,
        tier: 1,
        index,
        bed,
      })),
    ].sort((a, b) => a.sortOrder - b.sortOrder || a.tier - b.tier || a.index - b.index);

    // --- Touch pinch-to-zoom + two-finger pan ------------------------------
    //
    // Konva ships single-finger drag, but multi-touch pinch isn't built in.
    // We wire native touch listeners to the container so we can intercept
    // two-finger gestures before Konva's internal drag kicks in: a
    // ref-based snapshot captures the starting distance/midpoint, and each
    // touchmove updates scale/position around the gesture midpoint.
    //
    // While a pinch is active we suspend Konva's stage drag (via
    // pinchActive) so the canvas doesn't jump when fingers lift one-by-one.
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      let pinchActive = false;
      let startDistance = 0;
      let startScale = scaleRef.current;
      let startMid = { x: 0, y: 0 };
      let startPosition = { ...positionRef.current };

      function pointFromTouches(touches: TouchList) {
        const a = touches.item(0);
        const b = touches.item(1);
        if (!a || !b) return null;
        const rect = container?.getBoundingClientRect();
        if (!rect) return null;
        const ax = a.clientX - rect.left;
        const ay = a.clientY - rect.top;
        const bx = b.clientX - rect.left;
        const by = b.clientY - rect.top;
        return {
          mid: { x: (ax + bx) / 2, y: (ay + by) / 2 },
          dist: Math.hypot(bx - ax, by - ay),
        };
      }

      function onTouchStart(event: TouchEvent) {
        if (event.touches.length !== 2) return;
        const point = pointFromTouches(event.touches);
        if (!point) return;
        pinchActive = true;
        startDistance = point.dist;
        startMid = point.mid;
        startScale = scaleRef.current;
        startPosition = { ...positionRef.current };
        // Cancel Konva's in-progress drag so the second finger doesn't
        // leave the stage halfway between two states.
        const stage = stageRef.current;
        if (stage?.isDragging()) {
          stage.stopDrag();
        }
        event.preventDefault();
      }

      function onTouchMove(event: TouchEvent) {
        if (!pinchActive || event.touches.length !== 2) return;
        const point = pointFromTouches(event.touches);
        if (!point) return;
        const ratio = startDistance > 0 ? point.dist / startDistance : 1;
        const nextScale = clampScale(startScale * ratio);

        // Anchor the zoom on the midpoint where the gesture began so
        // the world stays under the user's fingers even when the
        // midpoint drifts (which is also how we get two-finger pan).
        const stageX = (startMid.x - startPosition.x) / startScale;
        const stageY = (startMid.y - startPosition.y) / startScale;
        const nextX = point.mid.x - stageX * nextScale;
        const nextY = point.mid.y - stageY * nextScale;

        setScale(nextScale);
        setPosition({ x: nextX, y: nextY });
        event.preventDefault();
      }

      function onTouchEnd(event: TouchEvent) {
        if (!pinchActive) return;
        if (event.touches.length < 2) {
          pinchActive = false;
        }
      }

      // `passive: false` is required so we can call preventDefault and
      // stop the browser from triggering page-level zoom.
      container.addEventListener('touchstart', onTouchStart, { passive: false });
      container.addEventListener('touchmove', onTouchMove, { passive: false });
      container.addEventListener('touchend', onTouchEnd, { passive: false });
      container.addEventListener('touchcancel', onTouchEnd, { passive: false });
      return () => {
        container.removeEventListener('touchstart', onTouchStart);
        container.removeEventListener('touchmove', onTouchMove);
        container.removeEventListener('touchend', onTouchEnd);
        container.removeEventListener('touchcancel', onTouchEnd);
      };
    }, []);

    function relativePointer(stage: KonvaStage): { x: number; y: number } | null {
      const pos = stage.getRelativePointerPosition();
      if (!pos) return null;
      return { x: pos.x, y: pos.y };
    }

    function handleEmptyClick(event: KonvaEventObject<MouseEvent | TouchEvent>) {
      // Fired only when the user clicks the explicit deselect-target rect
      // (or empty stage). In drawing-polygon mode we add a point;
      // otherwise we deselect. We deliberately don't gate this on
      // event.target === stage anymore — a separate transparent Rect at
      // the bottom of the layer is the deselect target now, which makes
      // the behaviour deterministic regardless of bubbling order.
      const stage = event.target.getStage();
      if (!stage) return;
      if (!drawing) {
        onSelect(null);
        return;
      }
      const pointer = relativePointer(stage);
      if (!pointer) return;
      const inchX = snapValue(Math.round(pointer.x / PX_PER_INCH), snap);
      const inchY = snapValue(Math.round(pointer.y / PX_PER_INCH), snap);
      setDraftPoints((prev) => [...prev, { x: inchX, y: inchY }]);
    }

    function handleStageDblClick(event: KonvaEventObject<MouseEvent | TouchEvent>) {
      if (!drawing) return;
      event.evt.preventDefault();
      if (draftPoints.length >= 3) {
        onCommitPolygon(draftPoints);
        setDraftPoints([]);
        setHoverPoint(null);
      }
    }

    function handleStageMouseMove(event: KonvaEventObject<MouseEvent>) {
      if (!drawing && !measuring) return;
      const stage = event.target.getStage();
      if (!stage) return;
      const pointer = relativePointer(stage);
      if (!pointer) return;
      const inchX = snapValue(Math.round(pointer.x / PX_PER_INCH), snap);
      const inchY = snapValue(Math.round(pointer.y / PX_PER_INCH), snap);
      setHoverPoint({ x: inchX, y: inchY });
    }

    function handleMeasureClick(event: KonvaEventObject<MouseEvent | TouchEvent>) {
      event.cancelBubble = true;
      const stage = event.target.getStage();
      if (!stage) return;
      const pointer = relativePointer(stage);
      if (!pointer) return;
      const point = {
        x: snapValue(Math.round(pointer.x / PX_PER_INCH), snap),
        y: snapValue(Math.round(pointer.y / PX_PER_INCH), snap),
      };
      if (!measureA || measureB) {
        setMeasureA(point);
        setMeasureB(null);
      } else {
        setMeasureB(point);
      }
    }

    function handleStageWheel(event: KonvaEventObject<WheelEvent>) {
      event.evt.preventDefault();
      const stage = event.target.getStage();
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const direction = event.evt.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      const nextScale = clampScale(scale * direction);
      const stageX = (pointer.x - position.x) / scale;
      const stageY = (pointer.y - position.y) / scale;
      setScale(nextScale);
      setPosition({
        x: pointer.x - stageX * nextScale,
        y: pointer.y - stageY * nextScale,
      });
    }

    function handleStageDragEnd(event: KonvaEventObject<DragEvent>) {
      // Stage-level drag = pan. Sync local state so the controlled
      // x/y/scale values reflect Konva's internal positioning.
      const target = event.target as KonvaStage;
      if (target === stageRef.current) {
        setPosition({ x: target.x(), y: target.y() });
      }
    }

    function handleBedMove(bedId: string, x: number, y: number) {
      const snappedX = snapValue(x, snap);
      const snappedY = snapValue(y, snap);
      onMoveBed(bedId, Math.max(0, snappedX), Math.max(0, snappedY));
    }

    const draftLinePoints = draftPoints.flatMap((p) => [
      p.x * PX_PER_INCH,
      p.y * PX_PER_INCH,
    ]);
    if (drawing && hoverPoint && draftPoints.length > 0) {
      draftLinePoints.push(hoverPoint.x * PX_PER_INCH, hoverPoint.y * PX_PER_INCH);
    }

    return (
      <div ref={containerRef} className="grn-designer-canvas">
        <Stage
            ref={stageRef}
            width={viewport.width}
            height={viewport.height}
            scaleX={scale}
            scaleY={scale}
            x={position.x}
            y={position.y}
            draggable={!drawing}
            onClick={(event) => {
              // Fallback for clicks outside the world (the gray area
              // around the canvas). The transparent Rect handles
              // clicks inside the world.
              const stage = event.target.getStage();
              if (stage && event.target === stage) handleEmptyClick(event);
            }}
            onTap={(event) => {
              const stage = event.target.getStage();
              if (stage && event.target === stage) handleEmptyClick(event);
            }}
            onDblClick={handleStageDblClick}
            onDblTap={handleStageDblClick}
            onMouseMove={handleStageMouseMove}
            onWheel={handleStageWheel}
            onDragEnd={handleStageDragEnd}
          >
            <Layer listening>
              <Grid
                widthInches={canvas.widthInches}
                heightInches={canvas.heightInches}
                pxPerInch={PX_PER_INCH}
              />
              <BackgroundLayer
                src={backgroundImageUrl}
                widthInches={canvas.widthInches}
                heightInches={canvas.heightInches}
                pxPerInch={PX_PER_INCH}
                opacity={canvas.backgroundOpacity}
              />
              <Rect
                x={0}
                y={0}
                width={widthPx}
                height={heightPx}
                fill="rgba(0,0,0,0)"
                onClick={handleEmptyClick}
                onTap={handleEmptyClick}
              />
            </Layer>
            <Layer>
              {stacked.map((item) =>
                item.kind === 'annotation' ? (
                  <AnnotationShape
                    key={item.annotation.id}
                    annotation={item.annotation}
                    pxPerInch={PX_PER_INCH}
                    isSelected={
                      selected?.kind === 'annotation' && selected.id === item.annotation.id
                    }
                    isEditable={isEditable && !drawing}
                    onSelect={(id) => onSelect({ kind: 'annotation', id })}
                    onMove={onMoveAnnotation}
                    onResize={onResizeAnnotation}
                  />
                ) : (
                  <BedShape
                    key={item.bed.id}
                    bed={item.bed}
                    pxPerInch={PX_PER_INCH}
                    isSelected={selected?.kind === 'bed' && selected.id === item.bed.id}
                    isEditable={
                      isEditable && !drawing && item.bed.id !== vertexEditBed?.id
                    }
                    crops={cropsByBedId.get(item.bed.id) ?? []}
                    onSelect={(id) => onSelect({ kind: 'bed', id })}
                    onMove={handleBedMove}
                    onResize={onResizeBed}
                  />
                )
              )}
              {vertexEditBed && (
                <VertexEditor
                  key={vertexEditBed.id}
                  bed={vertexEditBed}
                  pxPerInch={PX_PER_INCH}
                  snap={snap}
                  onCommit={(points) => onUpdateBedPoints(vertexEditBed.id, points)}
                />
              )}
              {drawing && draftLinePoints.length >= 4 && (
                <Line
                  points={draftLinePoints}
                  stroke="#3a7e5a"
                  strokeWidth={2}
                  dash={[6, 4]}
                  listening={false}
                />
              )}
              {drawing &&
                draftPoints.map((point, idx) => (
                  <Circle
                    key={idx}
                    x={point.x * PX_PER_INCH}
                    y={point.y * PX_PER_INCH}
                    radius={5}
                    fill="#3a7e5a"
                    stroke="#fff"
                    strokeWidth={2}
                    listening={false}
                  />
                ))}
              {drawing && hoverPoint && (
                <Circle
                  x={hoverPoint.x * PX_PER_INCH}
                  y={hoverPoint.y * PX_PER_INCH}
                  radius={4}
                  fill="rgba(58, 126, 90, 0.4)"
                  listening={false}
                />
              )}
              {measuring && (
                <Rect
                  x={0}
                  y={0}
                  width={widthPx}
                  height={heightPx}
                  fill="rgba(0,0,0,0)"
                  onClick={handleMeasureClick}
                  onTap={handleMeasureClick}
                />
              )}
              {measuring &&
                measureA &&
                (() => {
                  const target = measureB ?? hoverPoint;
                  const ax = measureA.x * PX_PER_INCH;
                  const ay = measureA.y * PX_PER_INCH;
                  const segments = target ? (
                    <>
                      <Line
                        points={[
                          ax,
                          ay,
                          target.x * PX_PER_INCH,
                          target.y * PX_PER_INCH,
                        ]}
                        stroke="#8a6230"
                        strokeWidth={2}
                        dash={[8, 5]}
                        listening={false}
                      />
                      <Circle
                        x={target.x * PX_PER_INCH}
                        y={target.y * PX_PER_INCH}
                        radius={5}
                        fill="#8a6230"
                        stroke="#fff"
                        strokeWidth={2}
                        listening={false}
                      />
                      <Text
                        x={((measureA.x + target.x) / 2) * PX_PER_INCH + 10}
                        y={((measureA.y + target.y) / 2) * PX_PER_INCH - 20}
                        text={formatInchesAsFeetInches(distanceInches(measureA, target))}
                        fontSize={15}
                        fontStyle="700"
                        fill="#5b3a1c"
                        shadowColor="#fff"
                        shadowBlur={6}
                        shadowOpacity={0.95}
                        listening={false}
                      />
                    </>
                  ) : null;
                  return (
                    <>
                      <Circle
                        x={ax}
                        y={ay}
                        radius={5}
                        fill="#8a6230"
                        stroke="#fff"
                        strokeWidth={2}
                        listening={false}
                      />
                      {segments}
                    </>
                  );
                })()}
            </Layer>
          </Stage>
        <div className="grn-designer-canvas__zoom" role="group" aria-label="Zoom controls">
          <button
            type="button"
            className="grn-designer-canvas__zoom-btn"
            onClick={() => zoomBy(BUTTON_ZOOM_STEP)}
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="grn-designer-canvas__zoom-btn"
            onClick={() => zoomBy(1 / BUTTON_ZOOM_STEP)}
            aria-label="Zoom out"
            title="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className="grn-designer-canvas__zoom-btn grn-designer-canvas__zoom-btn--fit"
            onClick={fitToScreen}
            aria-label="Fit to screen"
            title="Fit to screen"
          >
            ⊡
          </button>
        </div>
        {drawing && (
          <div className="grn-designer-canvas__draw-hint" role="status">
            Tap to add points · double-tap to finish · esc to cancel
          </div>
        )}
        {vertexEditBed && (
          <div className="grn-designer-canvas__draw-hint" role="status">
            Drag points to reshape · tap an edge dot to add · double-tap a point
            to remove · esc to finish
          </div>
        )}
        {measuring && (
          <div className="grn-designer-canvas__draw-hint" role="status">
            Click two points to measure · click again to start over · esc to
            exit
          </div>
        )}
      </div>
    );
  }
);
