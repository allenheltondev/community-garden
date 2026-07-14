import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card } from '@olivias/ui';
import {
  createCheckoutSession,
  getDerivedFeed,
  getEntitlements,
  getWeeklyGrowPlan,
  listCatalogCrops,
} from '../../services/api';
import type { DerivedFeedSignal } from '../../types/feed';
import { createLogger } from '../../utils/logging';

const logger = createLogger('grower-recommendations');
const AI_OPT_OUT_KEY_PREFIX = 'ai-insights-opt-out';

type WindowDays = 7 | 14 | 30;

const WINDOW_OPTIONS: { value: WindowDays; label: string }[] = [
  { value: 7, label: 'Last 7 days' },
  { value: 14, label: 'Last 14 days' },
  { value: 30, label: 'Last 30 days' },
];

export interface RecommendationsPanelProps {
  viewerUserId?: string;
  growerGeoKey?: string | null;
  defaultWindowDays?: WindowDays;
}

function loadAiOptOutPreference(viewerUserId?: string): boolean {
  try {
    const storageKey = `${AI_OPT_OUT_KEY_PREFIX}:${viewerUserId ?? 'anonymous'}`;
    return window.localStorage.getItem(storageKey) === 'true';
  } catch {
    return false;
  }
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  return `${Math.round(value * 100)}%`;
}

function formatDateTime(value: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function rankSignals(
  signals: DerivedFeedSignal[],
  key: 'scarcityScore' | 'abundanceScore'
): DerivedFeedSignal[] {
  return [...signals].sort((left, right) => right[key] - left[key]).slice(0, 5);
}

export function RecommendationsPanel({
  viewerUserId,
  growerGeoKey,
  defaultWindowDays = 7,
}: RecommendationsPanelProps) {
  const [isOffline, setIsOffline] = useState<boolean>(() => !navigator.onLine);
  const [windowDays, setWindowDays] = useState<WindowDays>(defaultWindowDays);
  const [aiInsightsOptOut, setAiInsightsOptOut] = useState<boolean>(() =>
    loadAiOptOutPreference(viewerUserId)
  );
  const [isStartingUpgrade, setIsStartingUpgrade] = useState(false);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  useEffect(() => {
    setAiInsightsOptOut(loadAiOptOutPreference(viewerUserId));
  }, [viewerUserId]);

  useEffect(() => {
    try {
      const storageKey = `${AI_OPT_OUT_KEY_PREFIX}:${viewerUserId ?? 'anonymous'}`;
      window.localStorage.setItem(storageKey, String(aiInsightsOptOut));
    } catch {
      // Ignore localStorage failures in restricted environments.
    }
  }, [aiInsightsOptOut, viewerUserId]);

  const cropsQuery = useQuery({
    queryKey: ['catalogCrops'],
    queryFn: listCatalogCrops,
    staleTime: 10 * 60 * 1000,
  });

  const entitlementsQuery = useQuery({
    queryKey: ['meEntitlements'],
    queryFn: getEntitlements,
    staleTime: 60 * 1000,
    retry: 1,
  });

  // Match the entitlement the backend handler requires
  // (services/grn-api/src/api/handlers/ai_copilot.rs). Gating on
  // ai.feed_insights.read would show the UI for tiers that have the
  // summary entitlement but not the copilot one, then 403 on call.
  const hasWeeklyPlanAccess =
    entitlementsQuery.data?.entitlements?.includes('ai.copilot.weekly_grow_plan') ?? false;
  const weeklyPlanActive = hasWeeklyPlanAccess && !aiInsightsOptOut;

  const derivedFeedQuery = useQuery({
    queryKey: ['growerDerivedFeed', growerGeoKey, windowDays],
    queryFn: () =>
      getDerivedFeed({
        geoKey: growerGeoKey ?? '',
        windowDays,
        limit: 1,
        offset: 0,
      }),
    enabled: Boolean(growerGeoKey) && !isOffline,
    staleTime: 60 * 1000,
  });

  const weeklyPlanQuery = useQuery({
    queryKey: ['growerWeeklyPlan', growerGeoKey, windowDays],
    queryFn: () => getWeeklyGrowPlan(growerGeoKey ?? '', windowDays),
    enabled: Boolean(growerGeoKey) && !isOffline && weeklyPlanActive,
    staleTime: 60 * 1000,
  });

  const cropNameById = useMemo(() => {
    const byId = new Map<string, string>();
    for (const crop of cropsQuery.data ?? []) {
      byId.set(crop.id, crop.commonName);
    }
    return byId;
  }, [cropsQuery.data]);

  const cropSignals = useMemo(
    () => (derivedFeedQuery.data?.signals ?? []).filter((signal) => Boolean(signal.cropId)),
    [derivedFeedQuery.data?.signals]
  );

  const scarceSignals = useMemo(() => rankSignals(cropSignals, 'scarcityScore'), [cropSignals]);
  const abundantSignals = useMemo(
    () => rankSignals(cropSignals, 'abundanceScore'),
    [cropSignals]
  );
  const guidance = derivedFeedQuery.data?.growerGuidance ?? null;
  const freshness = derivedFeedQuery.data?.freshness ?? null;

  const labelForSignal = (signal: DerivedFeedSignal): string => {
    if (!signal.cropId) return 'Mixed crops';
    return cropNameById.get(signal.cropId) ?? 'Local crop';
  };

  const handleStartUpgrade = async () => {
    try {
      setIsStartingUpgrade(true);
      const origin = window.location.origin;
      const session = await createCheckoutSession({
        successUrl: `${origin}/?upgrade=success`,
        cancelUrl: `${origin}/?upgrade=cancelled`,
      });
      window.location.assign(session.checkoutUrl);
    } catch (error) {
      logger.error(
        `Failed to start pro upgrade checkout: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsStartingUpgrade(false);
    }
  };

  if (!growerGeoKey) {
    return (
      <Card className="space-y-3" padding="6">
        <h3 className="text-lg font-semibold text-neutral-900">Set your location to see recommendations</h3>
        <p className="text-sm text-neutral-700">
          We use the geohash you set in onboarding to find what neighbors are growing and what's missing nearby. Add your home location in your profile to unlock grow recommendations.
        </p>
      </Card>
    );
  }

  const isLoading = derivedFeedQuery.isLoading || cropsQuery.isLoading;
  const hasNoSignals = !isLoading && !derivedFeedQuery.isError && cropSignals.length === 0;

  return (
    <div className="space-y-4">
      <Card className="space-y-4" padding="6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-neutral-900">What to grow nearby</h3>
            <p className="text-sm text-neutral-600">
              Recommendations look at what neighbors are growing and what neighbors nearby are asking for, then highlight gaps you could fill.
            </p>
          </div>

          <label className="flex flex-col gap-1 text-sm text-neutral-700 sm:w-48">
            <span className="font-medium" id="grow-window-label">Window</span>
            <select
              aria-labelledby="grow-window-label"
              value={windowDays}
              onChange={(event) => {
                const next = Number(event.target.value) as WindowDays;
                if (WINDOW_OPTIONS.some((option) => option.value === next)) {
                  setWindowDays(next);
                }
              }}
              className="w-full rounded-base border-2 border-neutral-300 bg-white px-3 py-2 text-base text-neutral-800"
            >
              {WINDOW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isOffline && (
          <p
            className="rounded-base border border-warning bg-accent-50 px-3 py-2 text-sm text-neutral-800"
            role="status"
          >
            You are offline. Recommendations will refresh when you reconnect.
          </p>
        )}

        {derivedFeedQuery.isError && !isOffline && (
          <p
            className="rounded-base border border-error bg-red-50 px-3 py-2 text-sm text-error"
            role="alert"
          >
            We couldn't load local signals right now. Try again in a moment.
          </p>
        )}

        {isLoading && !isOffline && (
          <p className="text-sm text-neutral-600" role="status">Loading local signals...</p>
        )}

        {hasNoSignals && (
          <p className="rounded-base border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm text-neutral-700">
            No local signals yet for this window. As more neighbors list surplus or post requests near your geohash, recommendations will appear here.
          </p>
        )}

        {guidance && (
          <div
            className="rounded-base border border-primary-200 bg-primary-50 px-3 py-3"
            data-testid="grower-guidance-card"
          >
            <h4 className="text-base font-semibold text-neutral-900">Local guidance</h4>
            <p className="mt-1 text-sm text-neutral-800">{guidance.guidanceText}</p>
            <p className="mt-2 text-xs text-neutral-600">
              Strategy: {guidance.explanation.strategy} · Season: {guidance.explanation.season} · Based on {guidance.explanation.sourceSignalCount} local signal{guidance.explanation.sourceSignalCount === 1 ? '' : 's'}
            </p>
          </div>
        )}

        {(scarceSignals.length > 0 || abundantSignals.length > 0) && (
          <div
            className="rounded-base border border-neutral-200 bg-white px-3 py-3"
            data-testid="grower-signal-snapshot"
          >
            <h4 className="text-sm font-semibold text-neutral-900">Crop signals near you</h4>
            <p className="mt-1 text-xs text-neutral-600">
              Scarce crops are in high demand and short supply locally. Abundant crops are already well covered.
            </p>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div data-testid="grower-scarce-list">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-warning">Consider planting</p>
                {scarceSignals.length === 0 ? (
                  <p className="text-sm text-neutral-600">No crops stand out as scarce yet.</p>
                ) : (
                  <ul className="space-y-1 text-sm text-neutral-800">
                    {scarceSignals.map((signal) => (
                      <li
                        key={`scarce-${signal.geoBoundaryKey}-${signal.cropId ?? 'all'}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <span>{labelForSignal(signal)}</span>
                        <span className="text-xs text-neutral-600">
                          scarcity {formatPercent(signal.scarcityScore)} · {signal.requestCount} request{signal.requestCount === 1 ? '' : 's'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div data-testid="grower-abundant-list">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-success">Already covered</p>
                {abundantSignals.length === 0 ? (
                  <p className="text-sm text-neutral-600">No crops stand out as abundant yet.</p>
                ) : (
                  <ul className="space-y-1 text-sm text-neutral-800">
                    {abundantSignals.map((signal) => (
                      <li
                        key={`abundant-${signal.geoBoundaryKey}-${signal.cropId ?? 'all'}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <span>{labelForSignal(signal)}</span>
                        <span className="text-xs text-neutral-600">
                          abundance {formatPercent(signal.abundanceScore)} · {signal.listingCount} listing{signal.listingCount === 1 ? '' : 's'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {freshness && (
          <p className="text-xs text-neutral-500">
            Signals as of {formatDateTime(freshness.asOf)}
            {freshness.isStale ? ' · using cached data while fresh signals catch up' : ''}
          </p>
        )}
      </Card>

      <Card className="space-y-4" padding="6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h4 className="text-base font-semibold text-neutral-900">AI grow plan</h4>
            <p className="text-sm text-neutral-600">
              Optional weekly plan that turns nearby signals into specific suggestions. Labeled as AI-assisted and easy to turn off.
            </p>
          </div>

          {hasWeeklyPlanAccess ? (
            <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={!aiInsightsOptOut}
                onChange={(event) => setAiInsightsOptOut(!event.target.checked)}
                aria-label="Show AI grow plan"
              />
              Show AI plan
            </label>
          ) : (
            <Button
              onClick={() => void handleStartUpgrade()}
              variant="primary"
              disabled={isStartingUpgrade}
            >
              {isStartingUpgrade ? 'Opening checkout...' : 'Unlock Pro AI'}
            </Button>
          )}
        </div>

        {!hasWeeklyPlanAccess && (
          <p
            className="rounded-base border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700"
            role="status"
          >
            AI grow plans are a Pro feature. The scarce/abundant signals above are always free.
          </p>
        )}

        {hasWeeklyPlanAccess && aiInsightsOptOut && (
          <p
            className="rounded-base border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700"
            role="status"
          >
            AI grow plans are off for this account on this device.
          </p>
        )}

        {weeklyPlanActive && weeklyPlanQuery.isLoading && (
          <p className="text-sm text-neutral-600" role="status">Loading AI grow plan...</p>
        )}

        {weeklyPlanActive && weeklyPlanQuery.isError && (
          <p
            className="rounded-base border border-warning bg-accent-50 px-3 py-2 text-sm text-neutral-800"
            role="status"
          >
            AI grow plan is temporarily unavailable. The free signals above remain accurate.
          </p>
        )}

        {weeklyPlanActive && weeklyPlanQuery.data?.recommendations?.length ? (
          <div
            className="rounded-base border border-primary-300 bg-white px-3 py-3"
            data-testid="weekly-grow-plan-card"
          >
            <div className="mb-2 inline-flex items-center rounded-full border border-primary-300 bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
              AI-assisted
            </div>
            <ul className="space-y-2">
              {weeklyPlanQuery.data.recommendations.map((rec, index) => (
                <li
                  key={`weekly-grow-plan-${index}`}
                  className="rounded-md border border-neutral-200 px-3 py-2"
                >
                  <p className="text-sm text-neutral-900">{rec.recommendation}</p>
                  <p className="mt-1 text-xs text-neutral-600">
                    Confidence {formatPercent(rec.confidence)}
                    {rec.rationale[0] ? ` · ${rec.rationale[0]}` : ''}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-neutral-500">
              Model: {weeklyPlanQuery.data.modelId} · Window: {weeklyPlanQuery.data.windowDays} days
            </p>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export default RecommendationsPanel;
