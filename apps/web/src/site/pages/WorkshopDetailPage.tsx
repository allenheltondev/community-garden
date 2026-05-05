import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, FormFeedback } from '@olivias/ui';
import type { AuthSession } from '../../auth/session';
import { siteUrl, webApiBase } from '../routes';
import { applyWorkshopSeo } from '../seo';
import {
  formatWorkshopPrice,
  signedUpKindLabel,
  type PublicWorkshop,
  type WorkshopStatus,
} from './WorkshopsPage';

const STATUS_LABEL: Record<WorkshopStatus, string> = {
  coming_soon: 'Coming soon',
  gauging_interest: 'Gauging interest',
  open: 'Registration open',
  closed: 'Waitlist only',
  past: 'Past workshop'
};

interface SignupResponse {
  already_signed_up: boolean;
  checkout_required: boolean;
  checkout_url: string | null;
  checkout_session_id: string | null;
  signup: {
    id: string;
    workshop_id: string;
    kind: 'interested' | 'registered' | 'waitlisted';
    payment_status: 'not_required' | 'pending' | 'paid' | 'refunded';
    created_at: string;
  };
}

function statusModifier(status: WorkshopStatus): string {
  return `workshop-detail-hero__status workshop-detail-hero__status--${status.replace('_', '-')}`;
}

function formatLongDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatShortDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function signupCtaLabel(workshop: PublicWorkshop): string {
  switch (workshop.status) {
    case 'gauging_interest':
      return "I'm interested";
    case 'open': {
      const price = formatWorkshopPrice(workshop);
      return price ? `Register & pay ${price}` : 'Register';
    }
    case 'closed':
      return 'Join the waitlist';
    default:
      return 'Sign up';
  }
}

function signupConfirmation(
  kind: 'interested' | 'registered' | 'waitlisted',
  paymentStatus: 'not_required' | 'pending' | 'paid' | 'refunded',
): string {
  if (paymentStatus === 'pending') {
    return "We're holding your spot. Finish payment to confirm — your seat is reserved for 30 minutes.";
  }
  switch (kind) {
    case 'interested':
      return "Thanks — we'll let you know when this workshop is officially scheduled.";
    case 'registered':
      return paymentStatus === 'paid'
        ? "You're registered and paid. We'll send details closer to the date."
        : "You're registered. We'll send details closer to the date.";
    case 'waitlisted':
      return "You're on the waitlist. We'll reach out if a spot opens up.";
  }
}

function isSignupAllowed(status: WorkshopStatus): boolean {
  return status === 'gauging_interest' || status === 'open' || status === 'closed';
}

// Build a same-origin absolute URL for the current detail page so the
// allowlist check on the server can validate it. We avoid window.location
// .href because that includes any ?payment= query we might already be
// rendering after a return from Stripe.
function buildReturnUrl(slug: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : siteUrl;
  return `${origin}/workshops/${encodeURIComponent(slug)}`;
}

function CheckmarkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3.5 8.5l3 3 6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface WorkshopDetailPageProps {
  onNavigate: (path: string) => void;
  authSession: AuthSession | null;
  authReady: boolean;
}

export function WorkshopDetailPage({ onNavigate, authSession, authReady }: WorkshopDetailPageProps) {
  const { slug } = useParams<{ slug: string }>();
  const [workshop, setWorkshop] = useState<PublicWorkshop | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [paymentBanner, setPaymentBanner] = useState<'success' | 'cancelled' | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);

  const accessToken = authSession?.accessToken ?? null;

  // On mount (and on returns from Stripe), notice the ?payment= query and
  // strip it from the URL so a refresh doesn't re-trigger the banner.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const paymentParam = params.get('payment');
    if (paymentParam !== 'success' && paymentParam !== 'cancelled') return;

    setPaymentBanner(paymentParam);
    params.delete('payment');
    params.delete('session_id');
    const next = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${next ? `?${next}` : ''}`,
    );
    if (paymentParam === 'success') {
      setReloadCounter((n) => n + 1);
    }
  }, []);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    const headers: Record<string, string> = {};
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    fetch(`${webApiBase}/workshops/${encodeURIComponent(slug)}`, { headers })
      .then(async (response) => {
        if (response.status === 404) {
          throw new Error('Workshop not found.');
        }
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const detail = body?.error
            ? `${body.error} (${response.status})`
            : `Unable to load workshop (${response.status})`;
          throw new Error(detail);
        }
        return response.json();
      })
      .then((body: PublicWorkshop) => {
        if (cancelled) return;
        setWorkshop(body);
        setLoadError(null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setLoadError(err.message || 'Unable to load workshop.');
      });

    return () => {
      cancelled = true;
    };
  }, [slug, accessToken, reloadCounter]);

  useEffect(() => {
    if (!workshop || !slug) return;
    applyWorkshopSeo(workshop, `/workshops/${slug}`);
  }, [workshop, slug]);

  // After a Stripe success return, the webhook is asynchronous. If we land
  // here with my_signup still in 'pending', poll for a few seconds so the
  // banner doesn't say "success" while the UI says "finish payment."
  useEffect(() => {
    if (paymentBanner !== 'success') return;
    if (!workshop || workshop.my_signup?.payment_status !== 'pending') return;

    const interval = window.setInterval(() => {
      setReloadCounter((n) => n + 1);
    }, 2000);
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
    }, 20_000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [paymentBanner, workshop]);

  // Live countdown for the "Finish payment in N minutes" copy.
  const pendingExpiresAtForTimer = workshop?.my_signup?.payment_status === 'pending'
    ? workshop?.my_signup?.expires_at ?? null
    : null;
  const [, setCountdownTick] = useState(0);
  useEffect(() => {
    if (!pendingExpiresAtForTimer) return;
    const expiresAtMs = new Date(pendingExpiresAtForTimer).getTime();
    if (!Number.isFinite(expiresAtMs)) return;

    const interval = window.setInterval(() => {
      const now = Date.now();
      if (now >= expiresAtMs) {
        window.clearInterval(interval);
        setReloadCounter((n) => n + 1);
        return;
      }
      setCountdownTick((n) => n + 1);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [pendingExpiresAtForTimer]);

  const handleSignup = async () => {
    if (!workshop) return;
    if (!authSession) {
      onNavigate(`/login?redirect=${encodeURIComponent(`/workshops/${workshop.slug}`)}`);
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const body = workshop.is_paid
        ? JSON.stringify({ returnUrl: buildReturnUrl(workshop.slug) })
        : undefined;
      const response = await fetch(`${webApiBase}/workshops/${workshop.id}/signup`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authSession.accessToken}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body,
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error ?? `Unable to sign up (${response.status})`);
      }
      const result = (await response.json()) as SignupResponse;

      if (result.checkout_required && result.checkout_url) {
        window.location.assign(result.checkout_url);
        return;
      }

      setWorkshop({
        ...workshop,
        my_signup: {
          kind: result.signup.kind,
          payment_status: result.signup.payment_status,
          created_at: result.signup.created_at,
        },
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to sign up.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!workshop || !authSession) return;
    setBusy(true);
    setActionError(null);
    try {
      const response = await fetch(`${webApiBase}/workshops/${workshop.id}/signup`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authSession.accessToken}` }
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Unable to cancel signup (${response.status})`);
      }
      setWorkshop({ ...workshop, my_signup: null });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to cancel signup.');
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <div className="page-section workshop-detail">
        <div className="workshop-detail__error">
          <h1>Workshop unavailable</h1>
          <FormFeedback tone="error">{loadError}</FormFeedback>
          <a
            className="og-button og-button--secondary og-button--md site-cta"
            href="/workshops"
            onClick={(event) => {
              event.preventDefault();
              onNavigate('/workshops');
            }}
          >
            ← All workshops
          </a>
        </div>
      </div>
    );
  }

  if (!workshop) {
    return (
      <div className="page-section workshop-detail">
        <p className="workshop-detail__loading">Loading workshop details…</p>
      </div>
    );
  }

  const formattedLongDate = formatLongDate(workshop.workshop_date);
  const formattedShortDate = formatShortDate(workshop.workshop_date);
  const formattedPrice = formatWorkshopPrice(workshop);
  const status = workshop.status;
  const canSignUp = isSignupAllowed(status);
  const hasSignup = workshop.my_signup !== null;
  const isPendingPayment = workshop.my_signup?.payment_status === 'pending';
  const resumeUrl = isPendingPayment ? workshop.my_signup?.checkout_url ?? null : null;
  const isPendingExpired = isPendingPayment && !resumeUrl;
  const pendingExpiresAt = workshop.my_signup?.expires_at ?? null;
  const minutesRemaining = (() => {
    if (!isPendingPayment || !resumeUrl || !pendingExpiresAt) return null;
    const ms = new Date(pendingExpiresAt).getTime() - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return Math.max(1, Math.ceil(ms / 60_000));
  })();

  const heroMetaParts = [formattedShortDate, workshop.location].filter(Boolean) as string[];

  return (
    <article className="workshop-detail">
      <header className="workshop-detail-hero">
        <div className="workshop-detail-hero__media">
          {workshop.image_url ? (
            <img
              className="workshop-detail-hero__image"
              src={workshop.image_url}
              alt=""
            />
          ) : (
            <div
              className="workshop-detail-hero__image workshop-detail-hero__image--placeholder"
              aria-hidden="true"
            />
          )}
          <div className="workshop-detail-hero__gradient" aria-hidden="true" />
        </div>
        <div className="workshop-detail-hero__content">
          <a
            className="workshop-detail-hero__back"
            href="/workshops"
            onClick={(event) => {
              event.preventDefault();
              onNavigate('/workshops');
            }}
          >
            ← All workshops
          </a>
          <span className={statusModifier(status)}>{STATUS_LABEL[status]}</span>
          <h1 className="workshop-detail-hero__title">{workshop.title}</h1>
          {heroMetaParts.length > 0 || formattedPrice ? (
            <p className="workshop-detail-hero__meta">
              {heroMetaParts.join(' · ')}
              {formattedPrice ? (
                <span className="workshop-detail-hero__price">{formattedPrice}</span>
              ) : null}
            </p>
          ) : null}
        </div>
      </header>

      <div className="page-section workshop-detail__body">
        {paymentBanner === 'success' ? (
          <FormFeedback tone="success" className="workshop-detail__banner">
            Payment received. Hang tight while we confirm your registration…
          </FormFeedback>
        ) : null}
        {paymentBanner === 'cancelled' ? (
          <FormFeedback tone="info" className="workshop-detail__banner">
            Checkout was cancelled. You can try again below.
          </FormFeedback>
        ) : null}

        <div className="workshop-detail__layout">
          <div className="workshop-detail__main">
            {workshop.short_description ? (
              <p className="workshop-detail__lede">{workshop.short_description}</p>
            ) : null}

            {workshop.description ? (
              <section className="workshop-detail__about">
                <h2 className="workshop-detail__section-title">About this workshop</h2>
                <div className="workshop-detail__description">
                  {workshop.description.split(/\n{2,}/).map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="workshop-detail__rail">
            <div className="workshop-detail-card">
              <dl className="workshop-detail-card__details">
                {formattedLongDate ? (
                  <>
                    <dt>When</dt>
                    <dd>{formattedLongDate}</dd>
                  </>
                ) : null}
                {workshop.location ? (
                  <>
                    <dt>Where</dt>
                    <dd>{workshop.location}</dd>
                  </>
                ) : null}
                {formattedPrice ? (
                  <>
                    <dt>Price</dt>
                    <dd>{formattedPrice}</dd>
                  </>
                ) : null}
                {workshop.capacity !== null ? (
                  <>
                    <dt>Capacity</dt>
                    <dd>
                      {workshop.seats_remaining !== null
                        ? `${workshop.seats_remaining} of ${workshop.capacity} spots remaining`
                        : `${workshop.capacity} spots`}
                    </dd>
                  </>
                ) : null}
                {status === 'gauging_interest' && workshop.interested_count > 0 ? (
                  <>
                    <dt>Interest</dt>
                    <dd>
                      {workshop.interested_count}{' '}
                      {workshop.interested_count === 1 ? 'person' : 'people'} interested so far
                    </dd>
                  </>
                ) : null}
              </dl>

              <div className="workshop-detail-card__action">
                {!authReady ? (
                  <p className="workshop-detail-card__hint">Checking your session…</p>
                ) : status === 'coming_soon' ? (
                  <p className="workshop-detail-card__hint">
                    This workshop hasn&apos;t opened for signups yet. Check back soon.
                  </p>
                ) : status === 'past' ? (
                  <p className="workshop-detail-card__hint">
                    This workshop has already taken place.
                  </p>
                ) : hasSignup && isPendingPayment && resumeUrl ? (
                  <>
                    <FormFeedback tone="info">
                      {minutesRemaining
                        ? `Holding your spot for ~${minutesRemaining} more ${minutesRemaining === 1 ? 'minute' : 'minutes'}.`
                        : "Holding your spot."}
                    </FormFeedback>
                    <a
                      className="og-button og-button--primary og-button--md site-cta"
                      href={resumeUrl}
                    >
                      Finish payment
                    </a>
                    <Button variant="secondary" onClick={handleCancel} disabled={busy}>
                      {busy ? 'Working…' : 'Cancel reservation'}
                    </Button>
                    {actionError ? <FormFeedback tone="error">{actionError}</FormFeedback> : null}
                  </>
                ) : hasSignup && isPendingExpired ? (
                  <>
                    <FormFeedback tone="info">
                      Your held spot expired. Register again to start a new checkout.
                    </FormFeedback>
                    <Button onClick={handleSignup} disabled={busy}>
                      {busy ? 'Working…' : signupCtaLabel(workshop)}
                    </Button>
                    {actionError ? <FormFeedback tone="error">{actionError}</FormFeedback> : null}
                  </>
                ) : hasSignup ? (
                  <>
                    <p className="workshop-detail-card__signed-up">
                      <CheckmarkIcon className="workshop-detail-card__signed-up-icon" />
                      <span>{signedUpKindLabel(workshop.my_signup!.kind)}</span>
                    </p>
                    <p className="workshop-detail-card__hint">
                      {signupConfirmation(workshop.my_signup!.kind, workshop.my_signup!.payment_status)}
                    </p>
                    <Button variant="secondary" onClick={handleCancel} disabled={busy}>
                      {busy ? 'Working…' : 'Cancel my signup'}
                    </Button>
                    {actionError ? <FormFeedback tone="error">{actionError}</FormFeedback> : null}
                  </>
                ) : !authSession ? (
                  <>
                    <Button onClick={handleSignup} disabled={busy}>
                      Sign in to {signupCtaLabel(workshop).toLowerCase()}
                    </Button>
                    <p className="workshop-detail-card__hint">
                      You&apos;ll come right back to this workshop after signing in.
                    </p>
                  </>
                ) : canSignUp ? (
                  <>
                    <Button onClick={handleSignup} disabled={busy}>
                      {busy ? 'Working…' : signupCtaLabel(workshop)}
                    </Button>
                    {actionError ? <FormFeedback tone="error">{actionError}</FormFeedback> : null}
                  </>
                ) : (
                  <p className="workshop-detail-card__hint">
                    Signups are not currently open for this workshop.
                  </p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </article>
  );
}
