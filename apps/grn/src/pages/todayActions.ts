import type { ReminderItem } from '../services/api';
import type { Claim } from '../types/claim';
import type { DerivedFeedSignal } from '../types/feed';
import type { GrowerCropItem } from '../types/listing';
import type { TodayActionKind } from '../utils/todayActionTracking';

export type { TodayActionKind } from '../utils/todayActionTracking';

export interface TodayAction {
  id: string;
  kind: TodayActionKind;
  label: string;
  title: string;
  body: string;
  cta: string;
  to: string;
  destination: 'garden' | 'reminders' | 'share';
  priority: number;
}

interface BuildTodayActionsInput {
  userId?: string;
  crops: GrowerCropItem[];
  cropsLoaded: boolean;
  reminders: ReminderItem[];
  claims: Claim[];
  signals: DerivedFeedSignal[];
  now?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HARVEST_WINDOW_DAYS = 7;

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function cropName(crop: GrowerCropItem): string {
  return crop.nickname?.trim() || crop.cropName;
}

function harvestBody(harvestAt: number, now: number): string {
  const days = Math.ceil((harvestAt - now) / DAY_MS);
  if (days < 0) return `Its harvest date was ${Math.abs(days)} day${days === -1 ? '' : 's'} ago.`;
  if (days === 0) return 'Its harvest window is open today.';
  if (days === 1) return 'Its harvest window opens tomorrow.';
  return `Its harvest window opens in ${days} days.`;
}

/**
 * Builds a record-linked, deterministic action queue. Lower priorities are
 * more urgent; the page deliberately exposes no more than three at a time.
 */
export function buildTodayActions({
  userId,
  crops,
  cropsLoaded,
  reminders,
  claims,
  signals,
  now = new Date(),
}: BuildTodayActionsInput): TodayAction[] {
  const nowMs = now.getTime();
  const candidates: TodayAction[] = [];

  for (const claim of claims) {
    if (claim.status === 'pending' && userId && claim.listingOwnerId === userId) {
      candidates.push({
        id: `claim:${claim.id}`,
        kind: 'claim',
        label: 'Share',
        title: 'Review a sharing request',
        body: 'Someone is waiting for you to confirm pickup details.',
        cta: 'Review request',
        to: `/share/listings?listing=${encodeURIComponent(claim.listingId)}&claim=${encodeURIComponent(claim.id)}`,
        destination: 'share',
        priority: 10,
      });
    }
  }

  for (const reminder of reminders) {
    const dueAt = timestamp(reminder.nextRunAt);
    if (reminder.status !== 'active' || dueAt === null || dueAt > nowMs) continue;
    candidates.push({
      id: `reminder:${reminder.id}`,
      kind: 'reminder',
      label: 'Due now',
      title: reminder.title,
      body: `Your ${reminder.reminderType.replace('_', ' ')} reminder is ready.`,
      cta: 'Open reminder',
      to: `/today/reminders?reminder=${encodeURIComponent(reminder.id)}`,
      destination: 'reminders',
      priority: 20,
    });
  }

  for (const crop of crops) {
    if (crop.status !== 'growing') continue;
    const harvestAt = timestamp(crop.expectedHarvestDate);
    if (harvestAt === null || harvestAt > nowMs + HARVEST_WINDOW_DAYS * DAY_MS) continue;
    candidates.push({
      id: `harvest:${crop.id}`,
      kind: 'harvest',
      label: 'Harvest',
      title: `Check ${cropName(crop)}`,
      body: harvestBody(harvestAt, nowMs),
      cta: 'Log harvest',
      to: `/garden/plants?crop=${encodeURIComponent(crop.id)}&action=harvest`,
      destination: 'garden',
      priority: 30 + Math.max(-5, Math.ceil((harvestAt - nowMs) / DAY_MS)) / 100,
    });
  }

  for (const claim of claims) {
    if (claim.status === 'confirmed' && userId && claim.claimerId === userId) {
      candidates.push({
        id: `pickup:${claim.id}`,
        kind: 'pickup',
        label: 'Pickup',
        title: 'Review a confirmed pickup',
        body: 'Your shared-food claim is confirmed. Check the coordination details.',
        cta: 'Review pickup',
        to: `/share/find?claim=${encodeURIComponent(claim.id)}`,
        destination: 'share',
        priority: 40,
      });
    }
  }

  const planningCrop = crops.find((crop) => crop.status === 'planning' || crop.status === 'interested');
  if (planningCrop) {
    candidates.push({
      id: `plan:${planningCrop.id}`,
      kind: 'plan',
      label: 'Plan',
      title: 'Finish your growing plan',
      body: `${cropName(planningCrop)} is waiting for a place in your garden plan.`,
      cta: 'Open plan',
      to: '/garden/plan',
      destination: 'garden',
      priority: 50,
    });
  }

  const localSignal = [...signals]
    .filter((signal) => signal.cropId && signal.requestCount > signal.listingCount)
    .sort((left, right) => right.scarcityScore - left.scarcityScore)[0];
  if (localSignal?.cropId) {
    candidates.push({
      id: `local:${localSignal.cropId}`,
      kind: 'local',
      label: 'Nearby',
      title: 'See what neighbors need',
      body: 'There is more local interest than available produce for a crop near you.',
      cta: 'View suggestion',
      to: `/garden/plan/recommendations?crop=${encodeURIComponent(localSignal.cropId)}`,
      destination: 'garden',
      priority: 60,
    });
  }

  if (candidates.length === 0) {
    if (cropsLoaded && crops.length === 0) {
      candidates.push({
        id: 'start:first-crop',
        kind: 'start',
        label: 'Start here',
        title: 'Add your first crop',
        body: 'Tell us what you are growing so Today can surface timely next steps.',
        cta: 'Add a crop',
        to: '/garden/plants/new',
        destination: 'garden',
        priority: 90,
      });
    } else {
      candidates.push({
        id: 'review:garden',
        kind: 'review',
        label: 'Garden',
        title: 'Your garden is on track',
        body: 'Nothing is urgent. Take a quick look or keep enjoying the growing season.',
        cta: 'Open garden',
        to: '/garden',
        destination: 'garden',
        priority: 90,
      });
    }
  }

  return candidates
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
    .slice(0, 3);
}
