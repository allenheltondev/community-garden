import {
  useCallback,
  useEffect,
  useLayoutEffect,
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

export interface ViewportTransform {
  scale: number;
  x: number;
  y: number;
}

export function preserveWorldPointAfterOriginChange(
  transform: ViewportTransform,
  previousOrigin: { x: number; y: number },
  nextOrigin: { x: number; y: number }
): ViewportTransform {
  return {
    ...transform,
    x: transform.x + (nextOrigin.x - previousOrigin.x) * transform.scale,
    y: transform.y + (nextOrigin.y - previousOrigin.y) * transform.scale,
  };
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

export function useMapViewport(
  contentWidth: number,
  contentHeight: number,
  contentOriginX = 0,
  contentOriginY = 0,
  options?: { disableDoubleClickZoom?: boolean }
): MapViewport {
  const [transform, setTransform] = useState<ViewportTransform>({ scale: 1, x: 0, y: 0 });
  // Latest-value mirror for gesture handlers. Synced in an effect (not
  // during render) per the react-hooks/refs rule; every consumer is an
  // event handler, which always fires after the commit that updates it.
  const transformRef = useRef(transform);
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  const nodeRef = useRef<HTMLDivElement | null>(null);
  const wheelCleanupRef = useRef<(() => void) | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const observerRef = useRef<ResizeObserver | null>(null);
  const fittedRef = useRef(false);
  const originRef = useRef({ x: contentOriginX, y: contentOriginY });

  // Active pointers for pan/pinch. Pinch state snapshots the transform at
  // gesture start so each move is computed absolutely (no drift).
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const draggedRef = useRef(false);
  const lastPanRef = useRef<{ x: number; y: number } | null>(null);
  const pinchRef = useRef<{
    startDistance: number;
    startMid: { x: number; y: number };
    start: ViewportTransform;
  } | null>(null);
  // Velocity tracking for pan inertia (px/ms).
  const velocityRef = useRef({ vx: 0, vy: 0, t: 0 });
  const inertiaRef = useRef<number | null>(null);

  const clampTransform = useCallback(
    (next: ViewportTransform): ViewportTransform => {
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

  // A changed garden size shifts the SVG viewBox origin. Compensate for that
  // coordinate shift before paint so the same world point stays under the
  // viewport center. Fitting remains an initial or explicit user action.
  useLayoutEffect(() => {
    const previousOrigin = originRef.current;
    const nextOrigin = { x: contentOriginX, y: contentOriginY };
    originRef.current = nextOrigin;
    if (
      !fittedRef.current ||
      (previousOrigin.x === nextOrigin.x && previousOrigin.y === nextOrigin.y)
    ) {
      return;
    }
    setTransform((current) =>
      preserveWorldPointAfterOriginChange(current, previousOrigin, nextOrigin)
    );
  }, [contentOriginX, contentOriginY]);

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

  // Inertia: after a pan release with velocity, coast to a stop with
  // exponential decay. Runs a rAF loop that fades out over ~400ms. Any
  // new interaction cancels the animation immediately.
  const INERTIA_FRICTION = 5; // decay constant (higher = shorter coast)
  const INERTIA_MIN_SPEED = 20; // px/s stop threshold

  const cancelInertia = useCallback(() => {
    if (inertiaRef.current !== null) {
      cancelAnimationFrame(inertiaRef.current);
      inertiaRef.current = null;
    }
  }, []);

  const startInertia = useCallback(
    (vx: number, vy: number) => {
      cancelInertia();
      let lastTime = performance.now();
      let velX = vx;
      let velY = vy;
      function step() {
        const now = performance.now();
        const dt = (now - lastTime) / 1000; // seconds
        lastTime = now;
        velX *= Math.exp(-INERTIA_FRICTION * dt);
        velY *= Math.exp(-INERTIA_FRICTION * dt);
        if (Math.hypot(velX, velY) < INERTIA_MIN_SPEED) {
          inertiaRef.current = null;
          return;
        }
        const current = transformRef.current;
        setTransform(
          clampTransform({
            ...current,
            x: current.x + velX * dt,
            y: current.y + velY * dt,
          })
        );
        inertiaRef.current = requestAnimationFrame(step);
      }
      inertiaRef.current = requestAnimationFrame(step);
    },
    [cancelInertia, clampTransform]
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
        cancelInertia();
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
    [cancelInertia, fitToScreen, zoomAt]
  );

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      wheelCleanupRef.current?.();
      cancelInertia();
    },
    [cancelInertia]
  );

  function localPoint(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    cancelInertia();
    const p = localPoint(event);
    pointersRef.current.set(event.pointerId, p);
    draggedRef.current = false;
    velocityRef.current = { vx: 0, vy: 0, t: performance.now() };
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
      const now = performance.now();
      const dt = now - velocityRef.current.t;
      if (dt > 0 && dt < 100) {
        // Exponential smoothing to avoid jitter on the last frame.
        const alpha = 0.4;
        velocityRef.current = {
          vx: alpha * (dx / dt) + (1 - alpha) * velocityRef.current.vx,
          vy: alpha * (dy / dt) + (1 - alpha) * velocityRef.current.vy,
          t: now,
        };
      } else {
        velocityRef.current = { vx: dx / Math.max(dt, 1), vy: dy / Math.max(dt, 1), t: now };
      }
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
      // Apply pan inertia if the gesture had meaningful velocity.
      const { vx, vy, t } = velocityRef.current;
      const age = performance.now() - t;
      const speed = Math.hypot(vx, vy);
      if (draggedRef.current && speed > 0.15 && age < 80) {
        startInertia(vx * 1000, vy * 1000); // convert px/ms → px/s
      }
    }
  }

  function onDoubleClick(event: ReactPointerEvent<HTMLDivElement>) {
    if (options?.disableDoubleClickZoom) return;
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
