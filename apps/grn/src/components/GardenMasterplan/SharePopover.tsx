import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createMyGardenShare,
  getMyGardenShare,
  revokeMyGardenShare,
} from '../../services/api';

type ShareState =
  | { status: 'loading' }
  | { status: 'inactive' }
  | { status: 'active'; url: string }
  | { status: 'error' };

/**
 * "Share" control for the masterplan: a button that opens a small popover
 * for creating, copying, and revoking the public read-only garden link.
 */
export function SharePopover() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ShareState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const shareUrl = useCallback(
    (token: string) => `${window.location.origin}/shared/${token}`,
    []
  );

  // Lazily look up the current link when the popover opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getMyGardenShare()
      .then((link) => {
        if (!cancelled) setState({ status: 'active', url: shareUrl(link.token) });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const statusCode =
          error && typeof error === 'object' && 'statusCode' in error
            ? (error as { statusCode?: number }).statusCode
            : undefined;
        setState(statusCode === 404 ? { status: 'inactive' } : { status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [open, shareUrl]);

  // Dismiss on outside click or Esc, like the toolbar's More sheet.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function handleCreate() {
    setBusy(true);
    try {
      const link = await createMyGardenShare();
      setState({ status: 'active', url: shareUrl(link.token) });
    } catch {
      setState({ status: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    setBusy(true);
    try {
      await revokeMyGardenShare();
      setState({ status: 'inactive' });
      setCopied(false);
    } catch {
      setState({ status: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mp-share" ref={rootRef}>
      <button
        type="button"
        className="mp-explorer__export-btn"
        onClick={() => {
          if (!open) setState({ status: 'loading' });
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Share a public read-only link to this garden"
      >
        ↗ Share
      </button>
      {open && (
        <div className="mp-share__panel" role="dialog" aria-label="Share this garden">
          <p className="mp-share__explain">
            Anyone with the link can view a read-only masterplan — your notes
            and private crops stay hidden.
          </p>
          {state.status === 'loading' && <p className="mp-share__status">Checking…</p>}
          {state.status === 'error' && (
            <p className="mp-share__status">Something went wrong. Try again.</p>
          )}
          {state.status === 'inactive' && (
            <button
              type="button"
              className="mp-panel__action"
              onClick={() => {
                void handleCreate();
              }}
              disabled={busy}
            >
              {busy ? 'Creating…' : 'Create share link'}
            </button>
          )}
          {state.status === 'active' && (
            <>
              <div className="mp-share__link-row">
                <input
                  className="mp-share__url"
                  type="text"
                  readOnly
                  value={state.url}
                  aria-label="Public garden link"
                  onFocus={(event) => event.target.select()}
                />
                <button
                  type="button"
                  className="mp-share__copy"
                  onClick={() => {
                    void handleCopy(state.url);
                  }}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <button
                type="button"
                className="mp-share__revoke"
                onClick={() => {
                  void handleRevoke();
                }}
                disabled={busy}
              >
                {busy ? 'Turning off…' : 'Turn off sharing'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
