import { useCallback, useRef, useState, type ReactNode } from 'react';

interface InspectorShellProps {
  ariaLabel: string;
  isMobile: boolean;
  onClose: () => void;
  children: ReactNode;
}

type SnapState = 'peek' | 'full';

const PEEK_VH = 0.42;
const FULL_VH = 0.85;
const DISMISS_THRESHOLD_VH = 0.18;
const DRAG_DAMPING = 1; // 1:1 finger tracking

/**
 * Mobile-friendly wrapper for the right-side inspector panel.
 *
 * On desktop, renders a static aside with the supplied children — the
 * sidebar layout in styles.css does the rest.
 *
 * On mobile, renders a sheet that snaps between two heights ("peek" and
 * "full") and can be dragged down to dismiss. The header is the drag
 * handle: tapping the puck toggles peek/full, and dragging it past the
 * threshold closes the inspector. We expose CSS variables so the sheet
 * can render an arbitrary inner panel (BedInspector / AnnotationInspector)
 * without those panels needing to know about the sheet behaviour.
 */
export function InspectorShell({
  ariaLabel,
  isMobile,
  onClose,
  children,
}: InspectorShellProps) {
  const [snap, setSnap] = useState<SnapState>('peek');
  const sheetRef = useRef<HTMLElement | null>(null);
  // dragOffset is "extra pixels added to the bottom of the sheet" — when
  // positive the sheet is being pushed down (toward dismissal). We keep
  // it in a ref + state pair so animation frames don't re-render React.
  const [dragOffset, setDragOffset] = useState(0);
  const dragOffsetRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const startYRef = useRef<number | null>(null);
  const startSnapRef = useRef<SnapState>('peek');
  const movedRef = useRef(false);

  // If the user was on desktop and rotates / resizes into the mobile
  // breakpoint, reset the sheet to its peek snap. We compute the
  // "should-reset" decision inline so we don't run an effect that
  // calls setState — instead, we shift state right at render time
  // when the input changes, which is the React-idiomatic pattern.
  // See: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevIsMobile, setPrevIsMobile] = useState(isMobile);
  if (prevIsMobile !== isMobile) {
    setPrevIsMobile(isMobile);
    if (isMobile) {
      setSnap('peek');
      setDragOffset(0);
      // dragOffsetRef will be re-initialised on the next pointerdown.
    }
  }

  const setOffset = useCallback((next: number) => {
    dragOffsetRef.current = next;
    setDragOffset(next);
  }, []);

  // Pointer-event-based drag so we treat mouse and touch identically.
  // We attach handlers to the handle element rather than the sheet so
  // the inspector body stays scrollable.
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isMobile) return;
      // Only primary mouse / single touch.
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      draggingRef.current = true;
      setDragging(true);
      movedRef.current = false;
      startYRef.current = event.clientY;
      startSnapRef.current = snap;
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
    },
    [isMobile, snap]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current || startYRef.current === null) return;
      const deltaY = (event.clientY - startYRef.current) * DRAG_DAMPING;
      // When already at peek, dragging up should snap to full once the
      // user has moved past 30px; we visualise that by allowing a small
      // negative offset that springs back in onPointerUp.
      const next = Math.max(-80, deltaY);
      if (Math.abs(next) > 4) movedRef.current = true;
      setOffset(next);
    },
    [setOffset]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      const offset = dragOffsetRef.current;
      const viewportHeight = window.innerHeight;
      const dismissPx = viewportHeight * DISMISS_THRESHOLD_VH;
      try {
        (event.target as HTMLElement).releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }

      // Treat a tap (no movement) as a snap toggle.
      if (!movedRef.current) {
        setOffset(0);
        setSnap((prev) => (prev === 'peek' ? 'full' : 'peek'));
        return;
      }

      if (offset > dismissPx) {
        // Animate back so the sheet doesn't snap before the parent
        // unmounts it; the parent's onClose will tear it down on the
        // next render.
        setOffset(0);
        onClose();
        return;
      }

      // Drag up far enough → expand. Drag down a little → settle back.
      if (offset < -40 && startSnapRef.current === 'peek') {
        setSnap('full');
      } else if (offset > 80 && startSnapRef.current === 'full') {
        setSnap('peek');
      }
      setOffset(0);
    },
    [onClose, setOffset]
  );

  if (!isMobile) {
    return (
      <aside className="grn-designer-inspector" aria-label={ariaLabel}>
        {children}
      </aside>
    );
  }

  const heightVh = snap === 'full' ? FULL_VH : PEEK_VH;
  const sheetStyle = {
    // CSS clamps the height to a max-height in the stylesheet; we drive
    // the *current* height and the drag offset via custom properties so
    // the styles can compose them however looks best.
    '--grn-sheet-height': `${heightVh * 100}vh`,
    '--grn-sheet-offset': `${dragOffset}px`,
  } as React.CSSProperties;

  return (
    <aside
      ref={sheetRef as React.Ref<HTMLElement>}
      className={`grn-designer-inspector grn-designer-inspector--sheet is-${snap} ${
        dragging ? 'is-dragging' : ''
      }`}
      aria-label={ariaLabel}
      style={sheetStyle}
    >
      <div
        className="grn-designer-inspector__handle"
        role="button"
        tabIndex={0}
        aria-label={
          snap === 'peek' ? 'Expand details (drag down to close)' : 'Collapse details'
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setSnap((prev) => (prev === 'peek' ? 'full' : 'peek'));
          }
        }}
      >
        <span className="grn-designer-inspector__handle-puck" aria-hidden="true" />
      </div>
      {children}
    </aside>
  );
}
