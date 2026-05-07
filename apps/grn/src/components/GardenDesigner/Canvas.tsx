import type Konva from 'konva';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Circle, Layer, Line, Stage } from 'react-konva';
import type {
  BedPolygonPoint,
  GardenBed,
  GardenCanvas,
  GrowerCropItem,
} from '../../types/listing';
import { BackgroundLayer } from './BackgroundLayer';
import { BedShape } from './BedShape';
import { Grid } from './Grid';
import type { DesignerMode, GridSnap } from './Toolbar';

interface DesignerCanvasProps {
  canvas: GardenCanvas;
  beds: GardenBed[];
  cropsByBedId: Map<string, GrowerCropItem[]>;
  selectedBedId: string | null;
  isEditable: boolean;
  mode: DesignerMode;
  snap: GridSnap;
  backgroundImageUrl: string | null;
  onSelect: (bedId: string | null) => void;
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
  onCommitPolygon: (points: BedPolygonPoint[]) => void;
  onCancelPolygon: () => void;
}

export interface DesignerCanvasHandle {
  fitToScreen: () => void;
}

const PX_PER_INCH = 4;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.05;

function snapValue(value: number, snap: GridSnap): number {
  if (snap === 'off') return value;
  const step = snap === '6' ? 6 : 12;
  return Math.round(value / step) * step;
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
      cropsByBedId,
      selectedBedId,
      isEditable,
      mode,
      snap,
      backgroundImageUrl,
      onSelect,
      onMoveBed,
      onResizeBed,
      onCommitPolygon,
      onCancelPolygon,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const stageRef = useRef<Konva.Stage | null>(null);
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

    const widthPx = canvas.widthInches * PX_PER_INCH;
    const heightPx = canvas.heightInches * PX_PER_INCH;

    const fitToScreen = useCallback(() => {
      if (viewport.width === 0 || viewport.height === 0) return;
      const padding = 48;
      const availableWidth = viewport.width - padding * 2;
      const availableHeight = viewport.height - padding * 2;
      const fit = Math.min(availableWidth / widthPx, availableHeight / heightPx);
      const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, fit));
      const offsetX = (viewport.width - widthPx * nextScale) / 2;
      const offsetY = (viewport.height - heightPx * nextScale) / 2;
      setScale(nextScale);
      setPosition({ x: offsetX, y: offsetY });
    }, [viewport.width, viewport.height, widthPx, heightPx]);

    useImperativeHandle(ref, () => ({ fitToScreen }), [fitToScreen]);

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

    function relativePointer(stage: Konva.Stage): { x: number; y: number } | null {
      const pos = stage.getRelativePointerPosition();
      if (!pos) return null;
      return { x: pos.x, y: pos.y };
    }

    function handleStageClick(event: KonvaEventObject<MouseEvent | TouchEvent>) {
      const stage = event.target.getStage();
      if (!stage) return;
      // Selection: clicking the bare stage (not a bed) deselects.
      if (!drawing) {
        if (event.target === stage) {
          onSelect(null);
        }
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
      if (!drawing) return;
      const stage = event.target.getStage();
      if (!stage) return;
      const pointer = relativePointer(stage);
      if (!pointer) return;
      const inchX = snapValue(Math.round(pointer.x / PX_PER_INCH), snap);
      const inchY = snapValue(Math.round(pointer.y / PX_PER_INCH), snap);
      setHoverPoint({ x: inchX, y: inchY });
    }

    function handleStageWheel(event: KonvaEventObject<WheelEvent>) {
      event.evt.preventDefault();
      const stage = event.target.getStage();
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const direction = event.evt.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * direction));
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
      const target = event.target as Konva.Stage;
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
            onClick={handleStageClick}
            onTap={handleStageClick}
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
            </Layer>
            <Layer>
              {beds.map((bed) => (
                <BedShape
                  key={bed.id}
                  bed={bed}
                  pxPerInch={PX_PER_INCH}
                  isSelected={selectedBedId === bed.id}
                  isEditable={isEditable && !drawing}
                  crops={cropsByBedId.get(bed.id) ?? []}
                  onSelect={onSelect}
                  onMove={handleBedMove}
                  onResize={onResizeBed}
                />
              ))}
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
            </Layer>
          </Stage>
        {drawing && (
          <div className="grn-designer-canvas__draw-hint" role="status">
            Click to add points · double-click to finish · esc to cancel
          </div>
        )}
      </div>
    );
  }
);
