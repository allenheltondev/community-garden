import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Optional descriptive subtitle below the title. */
  subtitle?: string;
  /** Width modifier; defaults to "lg" (~720px). */
  size?: 'md' | 'lg';
  /** className suffix appended to the dialog for one-off styling overrides. */
  className?: string;
}

/**
 * Thin wrapper around the native <dialog> element. We get focus trap,
 * inert background, Esc-to-close, and accessible role/labelling for
 * free — the only React-side glue is wiring the open prop to
 * showModal()/close() and emitting onClose for both Esc and the X
 * button so the caller can keep its own state in sync.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  subtitle,
  size = 'lg',
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function handleNativeClose() {
    // Native close fires when the user hits Esc or when we call close().
    // Bouncing it back to onClose keeps the parent's state honest.
    if (open) onClose();
  }

  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>) {
    // Clicks on the dialog element itself (vs. its content) hit the
    // backdrop. Compare the target identity to the dialog node.
    if (event.target === dialogRef.current) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={`grn-modal grn-modal--${size} ${className ?? ''}`.trim()}
      onClose={handleNativeClose}
      onClick={handleBackdropClick}
      aria-labelledby="grn-modal-title"
    >
      <header className="grn-modal__header">
        <div className="grn-modal__title-block">
          <h2 id="grn-modal-title" className="grn-modal__title">{title}</h2>
          {subtitle ? <p className="grn-modal__subtitle">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          className="grn-modal__close"
          aria-label="Close"
          onClick={onClose}
        >
          ✕
        </button>
      </header>
      <div className="grn-modal__body">{children}</div>
    </dialog>
  );
}
