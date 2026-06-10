import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

// Pan/zoom controller for the masterplan. The scene SVG renders once at
// its natural size and the hook moves it with a single translate3d/scale
// transform on a wrapper div — the browser composites that on the GPU,
// so navigation stays smooth no matter how many elements the SVG holds.
//
// Gestures: drag to pan (mouse or single touch), wheel/trackpad to zoom
// at the cursor, two-finger pinch to zoom at the gesture midpoint,
// double-click/tap to zoom in a step. A small movement threshold keeps
// click-to-select working: shouldIgnoreClick() reports whether the
// gesture that just ended was actually a drag.

const MIN_SCALE = 0.3;
const MAX_SCALE = 4;
const FIT_PADDING = 36;
const BUTTON_ZOOM_STEP = 1.3;
const DRAG_THRESHOLD_PX = 6;
// Keep at least this much of the scene visible so it can't be flung
// entirely off screen.
const MIN_VISIBLE_PX = 90;

interface Transform {
  scale: number;
  x: number;
  y: number;
}

export interface MapViewport {
  containerRef: (node: HTMLDivElement | null) => void;
  containerHandlers: {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onDoubleClick: (event: ReactPointerEvent<HTMLDivElement>) => void;
  };
  contentStyle: CSSProperties;
  zoomIn: () => void;
  zoomOut: () => void;
  fitToScreen: () => void;
  shouldIgnoreClick: () => boolean;
}

export function useMapViewport(contentWidth: number, contentHeight: number): MapViewport {
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const transformRef = useRef(transform);
  transformRef.current = transform;

  const nodeRef = useRef<HTMLDivElement | null>(null);
  const wheelCleanupRef = useRef<(() => void) | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);
  const fittedRef = useRef(false);

  // Active pointers for pan/pinch. Pinch state snapshots the transform at
  // gesture start so each move is computed absolutely (no drift).
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const draggedRef = useRef(false);
  const lastPanRef = useRef<{ x: number; y: number } | null>(null);
  const pinchRef = useRef<{
    startDistance: number;
    startMid: { x: number; y: number };
    start: Transform;
  } | null>(null);

  const clampTransform = useCallback(
    (next: Transform): Transform => {
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next.scale));
      const { width, height } = sizeRef.current;
      if (width === 0 || height === 0) return { ...next, scale };
      const minX = MIN_VISIBLE_PX - contentWidth * scale;
      const maxX = width - MIN_VISIBLE_PX;
      const minY = MIN_VISIBLE_PX - contentHeight * scale;
      const maxY = height - MIN_VISIBLE_PX;
      return {
        scale,
        x: Math.max(minX, Math.min(maxX, next.x)),
        y: Math.max(minY, Math.min(maxY, next.y)),
      };
    },
    [contentWidth, contentHeight]
  );

  const fitToScreen = useCallback(() => {
    const { width, height } = sizeRef.current;
    if (width === 0 || height === 0 || contentWidth === 0 || contentHeight === 0) return;
    const scale = Math.max(
      MIN_SCALE,
      Math.min(
        MAX_SCALE,
        Math.min(
          (width - FIT_PADDING * 2) / contentWidth,
          (height - FIT_PADDING * 2) / contentHeight
        )
      )
    );
    setTransform({
      scale,
      x: (width - contentWidth * scale) / 2,
      y: (height - contentHeight * scale) / 2,
    });
  }, [contentWidth, contentHeight]);

  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number) => {
      const current = transformRef.current;
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, current.scale * factor));
      if (scale === current.scale) return;
      const worldX = (cx - current.x) / current.scale;
      const worldY = (cy - current.y) / current.scale;
      setTransform(
        clampTransform({ scale, x: cx - worldX * scale, y: cy - worldY * scale })
      );
    },
    [clampTransform]
  );

  const zoomAtCenter = useCallback(
    (factor: number) => {
      const { width, height } = sizeRef.current;
      zoomAt(width / 2, height / 2, factor);
    },
    [zoomAt]
  );

  // Callback ref so wheel (non-passive) + ResizeObserver bind to whatever
  // node React gives us, including remounts.
  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      wheelCleanupRef.current?.();
      wheelCleanupRef.current = null;
      nodeRef.current = node;
      if (!node) return;

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        sizeRef.current = {
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        };
        if (!fittedRef.current && sizeRef.current.width > 0) {
          fittedRef.current = true;
          fitToScreen();
        }
      });
      observer.observe(node);
      observerRef.current = observer;

      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const rect = node.getBoundingClientRect();
        // Trackpad pinches arrive as ctrl+wheel with fine deltas;
        // discrete mouse wheels send large deltas. Normalize both to a
        // gentle exponential zoom.
        const intensity = event.ctrlKey ? 0.012 : 0.0022;
        const factor = Math.exp(-event.deltaY * intensity);
        zoomAt(event.clientX - rect.left, event.clientY - rect.top, factor);
      };
      node.addEventListener('wheel', onWheel, { passive: false });
      wheelCleanupRef.current = () => node.removeEventListener('wheel', onWheel);
    },
    [fitToScreen, zoomAt]
  );

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      wheelCleanupRef.current?.();
    },
    []
  );

  function localPoint(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const p = localPoint(event);
    pointersRef.current.set(event.pointerId, p);
    draggedRef.current = false;
    if (pointersRef.current.size === 1) {
      // Don't capture yet: capturing on pointerdown would retarget the
      // eventual click to this container and break element selection.
      // Capture starts when real dragging starts (below).
      lastPanRef.current = p;
      pinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      event.currentTarget.setPointerCapture(event.pointerId);
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = {
        startDistance: Math.hypot(b.x - a.x, b.y - a.y),
        startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        start: transformRef.current,
      };
      lastPanRef.current = null;
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    const p = localPoint(event);
    const previous = pointersRef.current.get(event.pointerId);
    pointersRef.current.set(event.pointerId, p);

    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const ratio = pinch.startDistance > 0 ? distance / pinch.startDistance : 1;
      const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinch.start.scale * ratio));
      // Anchor on the starting midpoint so the world tracks the fingers;
      // midpoint drift doubles as two-finger pan.
      const worldX = (pinch.startMid.x - pinch.start.x) / pinch.start.scale;
      const worldY = (pinch.startMid.y - pinch.start.y) / pinch.start.scale;
      draggedRef.current = true;
      setTransform(
        clampTransform({ scale, x: mid.x - worldX * scale, y: mid.y - worldY * scale })
      );
      return;
    }

    if (lastPanRef.current && previous) {
      const dx = p.x - lastPanRef.current.x;
      const dy = p.y - lastPanRef.current.y;
      if (!draggedRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      if (!draggedRef.current) {
        // The gesture is now a pan: capture so it survives leaving the
        // container, and so the click that fires on release is ignored.
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      draggedRef.current = true;
      lastPanRef.current = p;
      const current = transformRef.current;
      setTransform(clampTransform({ ...current, x: current.x + dx, y: current.y + dy }));
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 1) {
      lastPanRef.current = [...pointersRef.current.values()][0];
    } else if (pointersRef.current.size === 0) {
      lastPanRef.current = null;
    }
  }

  function onDoubleClick(event: ReactPointerEvent<HTMLDivElement>) {
    const p = localPoint(event);
    zoomAt(p.x, p.y, 1.6);
  }

  return {
    containerRef,
    containerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onDoubleClick,
    },
    contentStyle: {
      width: contentWidth,
      height: contentHeight,
      transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
      transformOrigin: '0 0',
      willChange: 'transform',
    },
    zoomIn: () => zoomAtCenter(BUTTON_ZOOM_STEP),
    zoomOut: () => zoomAtCenter(1 / BUTTON_ZOOM_STEP),
    fitToScreen,
    shouldIgnoreClick: () => draggedRef.current,
  };
}
