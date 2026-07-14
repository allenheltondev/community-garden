import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Panel, SectionHeading } from '@olivias/ui';
import { getMe, listMyCrops, listReminders } from '../services/api';
import type { GrowerCropItem } from '../types/listing';
import type { ReminderItem } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { PlantLoader } from '../components/branding/PlantLoader';
import { daysUntil, formatDate, harvestProgress } from '../utils/cropTiming';

/** A crop counts as "ready to harvest" once its window closes or is within a week. */
const HARVEST_SOON_DAYS = 7;

function firstName(displayName?: string | null, email?: string | null): string {
  const name = displayName?.trim();
  if (name) return name.split(/\s+/)[0];
  const local = email?.split('@')[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'there';
}

function harvestLabel(days: number | null): string {
  if (days === null) return 'Harvest window open';
  if (days <= 0) return days === 0 ? 'Ready today' : `Ready ${Math.abs(days)}d ago`;
  if (days === 1) return 'Ready tomorrow';
  return `Ready in ${days} days`;
}

function reminderLabel(nextRunAt: string): string {
  const days = daysUntil(nextRunAt.slice(0, 10));
  if (days === null) return formatDate(nextRunAt.slice(0, 10)) ?? 'Scheduled';
  if (days <= 0) return 'Due now';
  if (days === 1) return 'Tomorrow';
  if (days <= 14) return `In ${days} days`;
  return formatDate(nextRunAt.slice(0, 10)) ?? `In ${days} days`;
}

export function DashboardPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const {
    data: profile,
    isLoading: profileLoading,
    isError: profileError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['userProfile'],
    queryFn: getMe,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const { data: crops = [], isLoading: cropsLoading } = useQuery({
    queryKey: ['myCrops'],
    queryFn: listMyCrops,
    staleTime: 60 * 1000,
  });

  const { data: reminderData } = useQuery({
    queryKey: ['reminders'],
    queryFn: listReminders,
    staleTime: 60 * 1000,
  });

  const stats = useMemo(() => {
    const growing = crops.filter((c) => c.status === 'growing');
    const planning = crops.filter((c) => c.status === 'planning' || c.status === 'interested');
    const readySoon = growing.filter((c) => {
      const progress = harvestProgress(c.plantingDate, c.expectedHarvestDate);
      const days = daysUntil(c.expectedHarvestDate);
      return progress === 100 || (days !== null && days <= HARVEST_SOON_DAYS);
    });
    return { growing, planning, readySoon };
  }, [crops]);

  const upcomingHarvests = useMemo<GrowerCropItem[]>(() => {
    return crops
      .filter((c) => c.expectedHarvestDate)
      .sort((a, b) => (daysUntil(a.expectedHarvestDate) ?? 0) - (daysUntil(b.expectedHarvestDate) ?? 0))
      .slice(0, 4);
  }, [crops]);

  const upcomingReminders = useMemo<ReminderItem[]>(() => {
    return (reminderData?.items ?? [])
      .filter((r) => r.status === 'active')
      .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt))
      .slice(0, 4);
  }, [reminderData]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (signOutError) {
      console.error('Sign-out failed:', signOutError);
    }
  };

  if (profileLoading) {
    return (
      <section className="grn-section">
        <SectionHeading eyebrow="Overview" title="Your garden" />
        <Panel className="grn-page-status">
          <PlantLoader size="md" />
          <p>Loading your garden…</p>
        </Panel>
      </section>
    );
  }

  if (profileError || !profile) {
    return (
      <section className="grn-section">
        <SectionHeading eyebrow="Overview" title="Your garden" />
        <Panel className="grn-page-error">
          <span className="grn-page-error__icon" aria-hidden="true">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </span>
          <h2>Failed to load your garden</h2>
          <p>{error instanceof Error ? error.message : 'An unexpected error occurred.'}</p>
          <div className="grn-page-error__actions">
            <Button onClick={() => void refetch()} variant="primary">Try again</Button>
            <Button onClick={() => void handleSignOut()} variant="secondary">Sign out</Button>
          </div>
        </Panel>
      </section>
    );
  }

  const greetingName = firstName(profile.displayName, profile.email);
  const hasCrops = crops.length > 0;

  return (
    <section className="grn-section grn-dashboard">
      <SectionHeading
        eyebrow="Overview"
        title={`Welcome back, ${greetingName}`}
        body="Here's what's happening in your garden and what to do next."
      />

      {!hasCrops && !cropsLoading ? (
        <Card padding="6" className="grn-dashboard__empty">
          <span className="grn-dashboard__empty-emoji" aria-hidden="true">🌱</span>
          <h3>Start your garden</h3>
          <p>
            Add your first crop to track planting dates, beds, and harvests — and
            we&apos;ll surface what needs your attention right here.
          </p>
          <Button variant="primary" size="md" onClick={() => navigate('/crops/new')}>
            Add your first crop
          </Button>
        </Card>
      ) : (
        <div className="grn-stat-grid">
          <button type="button" className="grn-stat-tile" onClick={() => navigate('/crops')}>
            <span className="grn-stat-tile__value">{stats.growing.length}</span>
            <span className="grn-stat-tile__label">Growing now</span>
          </button>
          <button type="button" className="grn-stat-tile" onClick={() => navigate('/crops')}>
            <span className="grn-stat-tile__value">{stats.readySoon.length}</span>
            <span className="grn-stat-tile__label">Ready to harvest</span>
          </button>
          <button type="button" className="grn-stat-tile" onClick={() => navigate('/planner')}>
            <span className="grn-stat-tile__value">{stats.planning.length}</span>
            <span className="grn-stat-tile__label">Planning &amp; interested</span>
          </button>
        </div>
      )}

      {hasCrops ? (
        <div className="grn-dashboard__columns">
          <Card padding="6" className="grn-dashboard__panel">
            <div className="grn-dashboard__panel-head">
              <h3>Upcoming harvests</h3>
              <Button variant="ghost" size="sm" onClick={() => navigate('/crops')}>
                My garden
              </Button>
            </div>
            {upcomingHarvests.length === 0 ? (
              <p className="grn-dashboard__muted">
                No harvest dates set yet. Add planting and harvest dates to your crops to
                see them here.
              </p>
            ) : (
              <ul className="grn-dashboard__list" role="list">
                {upcomingHarvests.map((crop) => {
                  const days = daysUntil(crop.expectedHarvestDate);
                  const progress = harvestProgress(crop.plantingDate, crop.expectedHarvestDate);
                  return (
                    <li key={crop.id} className="grn-dashboard__row">
                      <div className="grn-dashboard__row-main">
                        <span className="grn-dashboard__row-title">
                          {crop.nickname || crop.cropName}
                        </span>
                        <span className="grn-dashboard__row-meta">{harvestLabel(days)}</span>
                      </div>
                      {progress !== null ? (
                        <span
                          className="grn-dashboard__progress"
                          role="progressbar"
                          aria-valuenow={progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${crop.nickname || crop.cropName} harvest progress`}
                        >
                          <span
                            className="grn-dashboard__progress-fill"
                            style={{ width: `${progress}%` }}
                          />
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card padding="6" className="grn-dashboard__panel">
            <div className="grn-dashboard__panel-head">
              <h3>Upcoming reminders</h3>
              <Button variant="ghost" size="sm" onClick={() => navigate('/reminders')}>
                Reminders
              </Button>
            </div>
            {upcomingReminders.length === 0 ? (
              <p className="grn-dashboard__muted">
                No active reminders. Set reminders to stay on top of watering, feeding,
                and succession planting.
              </p>
            ) : (
              <ul className="grn-dashboard__list" role="list">
                {upcomingReminders.map((reminder) => (
                  <li key={reminder.id} className="grn-dashboard__row">
                    <div className="grn-dashboard__row-main">
                      <span className="grn-dashboard__row-title">{reminder.title}</span>
                      <span className="grn-dashboard__row-meta">{reminderLabel(reminder.nextRunAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}

      <Card padding="6" className="grn-dashboard__connect">
        <div className="grn-dashboard__connect-copy">
          <h3>Grow better together</h3>
          <p>
            Share your surplus, find fresh food nearby, and see what your neighbors need —
            all optional, whenever you&apos;re ready.
          </p>
        </div>
        <Button variant="secondary" size="md" onClick={() => navigate('/connect')}>
          Explore Connect
        </Button>
      </Card>
    </section>
  );
}

export default DashboardPage;
