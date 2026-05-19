import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecommendationsPanel } from './RecommendationsPanel';
import {
  createCheckoutSession,
  getDerivedFeed,
  getEntitlements,
  getWeeklyGrowPlan,
  listCatalogCrops,
} from '../../services/api';

vi.mock('../../services/api', () => ({
  createCheckoutSession: vi.fn(),
  getDerivedFeed: vi.fn(),
  getEntitlements: vi.fn(),
  getWeeklyGrowPlan: vi.fn(),
  listCatalogCrops: vi.fn(),
}));

const mockCreateCheckoutSession = vi.mocked(createCheckoutSession);
const mockGetDerivedFeed = vi.mocked(getDerivedFeed);
const mockGetEntitlements = vi.mocked(getEntitlements);
const mockGetWeeklyGrowPlan = vi.mocked(getWeeklyGrowPlan);
const mockListCatalogCrops = vi.mocked(listCatalogCrops);

function setOnlineStatus(isOnline: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: isOnline,
  });
}

function renderPanel(overrides?: { growerGeoKey?: string | null }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const growerGeoKey = overrides && 'growerGeoKey' in overrides ? overrides.growerGeoKey : '9v6kn';

  return render(
    <QueryClientProvider client={queryClient}>
      <RecommendationsPanel viewerUserId="grower-1" growerGeoKey={growerGeoKey} />
    </QueryClientProvider>
  );
}

describe('RecommendationsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    setOnlineStatus(true);

    mockListCatalogCrops.mockResolvedValue([
      {
        id: 'crop-1',
        slug: 'tomato',
        commonName: 'Tomato',
        scientificName: null,
        category: 'fruit',
        description: null,
      },
      {
        id: 'crop-2',
        slug: 'kale',
        commonName: 'Kale',
        scientificName: null,
        category: 'leafy',
        description: null,
      },
    ]);

    mockGetDerivedFeed.mockResolvedValue({
      items: [],
      signals: [
        {
          geoBoundaryKey: '9v6k',
          cropId: 'crop-1',
          windowDays: 7,
          listingCount: 2,
          requestCount: 8,
          supplyQuantity: '20',
          demandQuantity: '80',
          scarcityScore: 0.92,
          abundanceScore: 0.18,
          computedAt: '2026-02-20T10:00:00.000Z',
          expiresAt: '2026-02-20T16:00:00.000Z',
        },
        {
          geoBoundaryKey: '9v6k',
          cropId: 'crop-2',
          windowDays: 7,
          listingCount: 12,
          requestCount: 3,
          supplyQuantity: '160',
          demandQuantity: '20',
          scarcityScore: 0.1,
          abundanceScore: 0.94,
          computedAt: '2026-02-20T10:00:00.000Z',
          expiresAt: '2026-02-20T16:00:00.000Z',
        },
      ],
      freshness: {
        asOf: '2026-02-20T10:00:00.000Z',
        isStale: false,
        staleFallbackUsed: false,
        staleReason: null,
      },
      aiSummary: null,
      growerGuidance: {
        guidanceText: 'Consider planting more tomatoes — local demand exceeds supply.',
        explanation: {
          season: 'spring',
          strategy: 'increase-resilience',
          windowDays: 7,
          sourceSignalCount: 2,
          strongestScarcitySignal: null,
          strongestAbundanceSignal: null,
        },
      },
      limit: 1,
      offset: 0,
      hasMore: false,
      nextOffset: null,
    });

    mockGetEntitlements.mockResolvedValue({
      tier: 'pro',
      entitlementsVersion: 'v1',
      entitlements: ['ai.copilot.weekly_grow_plan'],
      policy: { aiIsProOnly: true, freeRemindersDeterministicOnly: true },
    });

    mockGetWeeklyGrowPlan.mockResolvedValue({
      modelId: 'amazon.nova-lite-v1:0',
      modelVersion: 'v1',
      structuredJson: true,
      geoKey: '9v6kn',
      windowDays: 7,
      recommendations: [
        {
          recommendation: 'Plant a scarcity-priority crop like tomatoes this week.',
          confidence: 0.82,
          rationale: ['Top scarcity signal: 0.92 for tomatoes'],
        },
      ],
    });

    mockCreateCheckoutSession.mockResolvedValue({
      checkoutUrl: 'https://checkout.stripe.test/session_123',
      checkoutSessionId: 'cs_test_123',
    });
  });

  it('prompts to set location when grower has no geo key', () => {
    renderPanel({ growerGeoKey: null });

    expect(
      screen.getByRole('heading', { name: /set your location to see recommendations/i })
    ).toBeInTheDocument();
    expect(mockGetDerivedFeed).not.toHaveBeenCalled();
  });

  it('renders deterministic guidance and ranked crop signals', async () => {
    renderPanel();

    const guidance = await screen.findByTestId('grower-guidance-card');
    expect(
      within(guidance).getByText(/consider planting more tomatoes/i)
    ).toBeInTheDocument();

    const snapshot = await screen.findByTestId('grower-signal-snapshot');
    const scarceList = within(snapshot).getByTestId('grower-scarce-list');
    const abundantList = within(snapshot).getByTestId('grower-abundant-list');
    expect(within(scarceList).getByText('Tomato')).toBeInTheDocument();
    expect(within(scarceList).getByText(/scarcity 92%/i)).toBeInTheDocument();
    expect(within(abundantList).getByText('Kale')).toBeInTheDocument();
    expect(within(abundantList).getByText(/abundance 94%/i)).toBeInTheDocument();
  });

  it('shows the AI grow plan when the Pro entitlement is present', async () => {
    renderPanel();

    const planCard = await screen.findByTestId('weekly-grow-plan-card');
    expect(
      within(planCard).getByText(/plant a scarcity-priority crop/i)
    ).toBeInTheDocument();
    expect(within(planCard).getByText(/confidence 82%/i)).toBeInTheDocument();
    expect(within(planCard).getByText(/ai-assisted/i)).toBeInTheDocument();
  });

  it('keeps the weekly plan locked when the user only has the feed-insights entitlement', async () => {
    mockGetEntitlements.mockResolvedValueOnce({
      tier: 'supporter',
      entitlementsVersion: 'v1',
      entitlements: ['ai.feed_insights.read'],
      policy: { aiIsProOnly: true, freeRemindersDeterministicOnly: true },
    });

    renderPanel();

    expect(
      await screen.findByText(/ai grow plans are a pro feature/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unlock pro ai/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(mockGetWeeklyGrowPlan).not.toHaveBeenCalled();
    });
  });

  it('hides the AI plan and shows an upgrade CTA when the user is not Pro', async () => {
    mockGetEntitlements.mockResolvedValueOnce({
      tier: 'free',
      entitlementsVersion: 'v1',
      entitlements: [],
      policy: { aiIsProOnly: true, freeRemindersDeterministicOnly: true },
    });

    renderPanel();

    expect(
      await screen.findByText(/ai grow plans are a pro feature/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unlock pro ai/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(mockGetWeeklyGrowPlan).not.toHaveBeenCalled();
    });
    expect(await screen.findByTestId('grower-guidance-card')).toBeInTheDocument();
  });

  it('lets a Pro user opt out of AI insights and skips fetching the weekly plan', async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(await screen.findByTestId('weekly-grow-plan-card')).toBeInTheDocument();

    const toggle = screen.getByRole('checkbox', { name: /show ai grow plan/i });
    await user.click(toggle);

    await waitFor(() => {
      expect(screen.queryByTestId('weekly-grow-plan-card')).not.toBeInTheDocument();
    });
    expect(
      screen.getByText(/ai grow plans are off for this account on this device/i)
    ).toBeInTheDocument();
  });

  it('refetches signals when the user changes the window', async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByTestId('grower-signal-snapshot');

    await waitFor(() => {
      expect(mockGetDerivedFeed).toHaveBeenCalledWith(
        expect.objectContaining({ geoKey: '9v6kn', windowDays: 7 })
      );
    });

    const windowSelect = screen.getByRole('combobox', { name: /window/i });
    await user.selectOptions(windowSelect, '30');

    await waitFor(() => {
      expect(mockGetDerivedFeed).toHaveBeenCalledWith(
        expect.objectContaining({ geoKey: '9v6kn', windowDays: 30 })
      );
    });
  });

  it('shows an empty state when no crop signals are available', async () => {
    mockGetDerivedFeed.mockResolvedValueOnce({
      items: [],
      signals: [],
      freshness: {
        asOf: '2026-02-20T10:00:00.000Z',
        isStale: false,
        staleFallbackUsed: false,
        staleReason: null,
      },
      aiSummary: null,
      growerGuidance: null,
      limit: 1,
      offset: 0,
      hasMore: false,
      nextOffset: null,
    });

    renderPanel();

    expect(await screen.findByText(/no local signals yet/i)).toBeInTheDocument();
  });
});
