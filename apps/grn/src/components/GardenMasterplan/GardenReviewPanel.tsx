import { useEffect, useState } from 'react';
import {
  ApiError,
  generateGardenReview,
  type GardenReviewResponse,
} from '../../services/api';

const SEVERITY_BADGE: Record<string, { icon: string; label: string }> = {
  warning: { icon: '⚠', label: 'Needs attention' },
  tip: { icon: '🌱', label: 'Tip' },
  info: { icon: 'ℹ', label: 'Info' },
};

type PanelState =
  | { kind: 'loading' }
  | { kind: 'loaded'; review: GardenReviewResponse }
  | { kind: 'locked' }
  | { kind: 'error' };

interface GardenReviewPanelProps {
  onSelectBed: (bedId: string) => void;
  onClose: () => void;
}

/**
 * Floating panel with the AI garden review: structured insights over the
 * user's beds and crops (companion conflicts, overplanting, idle beds).
 * The review generates on open; insights tied to a bed jump the selection
 * there. Pro-gated server-side — the locked state renders the upgrade
 * nudge instead of erroring.
 */
export function GardenReviewPanel({ onSelectBed, onClose }: GardenReviewPanelProps) {
  const [state, setState] = useState<PanelState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    generateGardenReview()
      .then((review) => {
        if (!cancelled) setState({ kind: 'loaded', review });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.statusCode === 403) {
          setState({ kind: 'locked' });
        } else {
          setState({ kind: 'error' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside
      className="mp-panel mp-panel--review"
      role="dialog"
      aria-label="Garden review"
      data-testid="garden-review-panel"
    >
      <header className="mp-panel__header">
        <div>
          <p className="mp-panel__kicker">AI garden review</p>
          <h2 className="mp-panel__title">How your plan looks</h2>
        </div>
        <button
          type="button"
          className="mp-panel__close"
          onClick={onClose}
          aria-label="Close garden review"
        >
          ×
        </button>
      </header>

      <div className="mp-panel__body">
        {state.kind === 'loading' && (
          <p className="mp-panel__notes" role="status">
            Reviewing your beds and crops…
          </p>
        )}

        {state.kind === 'locked' && (
          <div className="mp-review__locked">
            <p>
              Garden review is a <strong>Pro</strong> feature. Upgrade to get
              companion-planting checks, overplanting warnings, and bed-by-bed
              suggestions.
            </p>
          </div>
        )}

        {state.kind === 'error' && (
          <p className="mp-panel__notes" role="alert">
            The review couldn’t be generated just now. Try again in a minute.
          </p>
        )}

        {state.kind === 'loaded' && state.review.insights.length === 0 && (
          <p className="mp-panel__notes">
            Nothing to flag — your plan looks healthy. 🌿
          </p>
        )}

        {state.kind === 'loaded' && state.review.insights.length > 0 && (
          <ul className="mp-review__list">
            {state.review.insights.map((insight, idx) => {
              const badge = SEVERITY_BADGE[insight.severity] ?? SEVERITY_BADGE.info;
              const body = (
                <>
                  <span
                    className={`mp-review__icon mp-review__icon--${insight.severity}`}
                    aria-label={badge.label}
                  >
                    {badge.icon}
                  </span>
                  <span className="mp-review__text">
                    <strong>{insight.title}</strong>
                    <span>{insight.detail}</span>
                  </span>
                </>
              );
              return (
                <li key={idx} className="mp-review__item">
                  {insight.bedId ? (
                    <button
                      type="button"
                      className="mp-review__jump"
                      onClick={() => onSelectBed(insight.bedId as string)}
                      title={`Show ${insight.bedName ?? 'this bed'} on the map`}
                    >
                      {body}
                    </button>
                  ) : (
                    <span className="mp-review__static">{body}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
