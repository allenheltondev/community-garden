import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Input, Panel, SectionHeading, Textarea } from '@olivias/ui';
import {
  createMyCrop,
  getMe,
  listCatalogCrops,
  listMyBeds,
  type UpsertGrowerCropRequest,
} from '../services/api';
import { CropPicker, type CropPickerSelection } from '../components/CropPlanner/CropPicker';
import { BedSelector } from '../components/CropPlanner/BedSelector';
import { visualForCrop } from '../components/CropPlanner/cropVisuals';
import { PlantLoader } from '../components/branding/PlantLoader';
import { createLogger } from '../utils/logging';

const logger = createLogger('new-crop-page');

interface PlantingDetails {
  bedId: string | null;
  plantingDate: string;
  expectedHarvestDate: string;
  plantCount: string;
  spacingInches: string;
  status: 'interested' | 'planning' | 'growing' | 'paused';
}

interface AdvancedDetails {
  nickname: string;
  defaultUnit: string;
  notes: string;
  visibility: 'private' | 'local' | 'public';
  surplusEnabled: boolean;
}

const STATUS_OPTIONS: Array<{
  id: PlantingDetails['status'];
  label: string;
  description: string;
  emoji: string;
}> = [
  { id: 'interested', label: 'Interested', description: 'Just noting it down', emoji: '💭' },
  { id: 'planning', label: 'Planning', description: 'I plan to plant this season', emoji: '📋' },
  { id: 'growing', label: 'Growing', description: "It's in the ground right now", emoji: '🌱' },
  { id: 'paused', label: 'Paused', description: 'Taking a break', emoji: '⏸️' },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number | null {
  if (!a || !b) return null;
  const start = new Date(`${a}T00:00:00Z`).getTime();
  const end = new Date(`${b}T00:00:00Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

export function NewCropPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: profile, isLoading: isLoadingProfile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: getMe,
    staleTime: 5 * 60 * 1000,
  });

  const { data: catalog = [], isLoading: isLoadingCatalog } = useQuery({
    queryKey: ['catalogCrops'],
    queryFn: listCatalogCrops,
  });

  const { data: beds = [], isLoading: isLoadingBeds } = useQuery({
    queryKey: ['myBeds'],
    queryFn: listMyBeds,
    enabled: profile?.userType === 'grower',
  });

  const [selection, setSelection] = useState<CropPickerSelection | null>(null);
  const [planting, setPlanting] = useState<PlantingDetails>({
    bedId: null,
    plantingDate: '',
    expectedHarvestDate: '',
    plantCount: '',
    spacingInches: '',
    status: 'planning',
  });
  const [advanced, setAdvanced] = useState<AdvancedDetails>({
    nickname: '',
    defaultUnit: '',
    notes: '',
    visibility: 'local',
    surplusEnabled: false,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const visual = useMemo(
    () => visualForCrop(selection?.cropName, selection?.category),
    [selection]
  );

  const daysToHarvest = useMemo(
    () => daysBetween(planting.plantingDate, planting.expectedHarvestDate),
    [planting.plantingDate, planting.expectedHarvestDate]
  );

  const createMutation = useMutation({
    mutationFn: createMyCrop,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myCrops'] });
      logger.info('Created crop from new-crop page');
      navigate('/crops', { replace: true });
    },
    onError: (err) => {
      logger.error('Failed to create crop', err instanceof Error ? err : undefined);
      setSubmitError(err instanceof Error ? err.message : 'Could not save your crop');
    },
  });

  if (isLoadingProfile) {
    return (
      <section className="grn-section">
        <Panel className="grn-page-status">
          <PlantLoader size="md" />
          <p>Loading your garden…</p>
        </Panel>
      </section>
    );
  }

  if (!profile || profile.userType !== 'grower') {
    return <Navigate to="/" replace />;
  }

  const canSubmit =
    selection !== null &&
    selection.cropName.trim().length > 0 &&
    !createMutation.isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    if (!selection) {
      setSubmitError('Pick a crop first.');
      return;
    }
    const trimmedName = selection.cropName.trim();
    if (!trimmedName) {
      setSubmitError('Crop needs a name.');
      return;
    }

    const payload: UpsertGrowerCropRequest = {
      cropName: trimmedName,
      canonicalId: selection.catalogCropId ?? undefined,
      status: planting.status,
      visibility: advanced.visibility,
      surplusEnabled: advanced.surplusEnabled,
      nickname: advanced.nickname.trim() || undefined,
      defaultUnit: advanced.defaultUnit.trim() || undefined,
      notes: advanced.notes.trim() || undefined,
      bedId: planting.bedId,
      plantingDate: planting.plantingDate || null,
      expectedHarvestDate: planting.expectedHarvestDate || null,
      plantCount: planting.plantCount ? Number(planting.plantCount) : null,
      spacingInches: planting.spacingInches ? Number(planting.spacingInches) : null,
    };

    createMutation.mutate(payload);
  };

  return (
    <section className="grn-section grn-new-crop">
      <SectionHeading
        eyebrow="Plan your garden"
        title="Add a crop"
        body="Tell us what's going in the ground — we'll tuck it into your garden plan."
      />

      <form onSubmit={handleSubmit} className="grn-new-crop__form">
        <Card className="grn-new-crop__hero" padding="6">
          <div
            className="grn-new-crop__hero-visual"
            style={{ background: `linear-gradient(135deg, ${visual.accent}33, ${visual.accent}10)` }}
            aria-hidden="true"
          >
            <span className="grn-new-crop__hero-emoji">{visual.emoji}</span>
          </div>
          <div className="grn-new-crop__hero-body">
            <CropPicker
              catalog={catalog}
              isLoading={isLoadingCatalog}
              value={selection}
              onChange={setSelection}
            />
          </div>
        </Card>

        <Card padding="6">
          <div className="grn-new-crop__section-head">
            <span className="grn-new-crop__step">2</span>
            <div>
              <h2 className="grn-new-crop__section-title">Planting plan</h2>
              <p className="grn-new-crop__section-sub">
                Where it&apos;s going, when, and how many. Skip anything you don&apos;t know yet.
              </p>
            </div>
          </div>

          <fieldset className="grn-status-picker" aria-label="Planting status">
            {STATUS_OPTIONS.map((option) => {
              const isActive = planting.status === option.id;
              return (
                <label
                  key={option.id}
                  className={`grn-status-option ${isActive ? 'is-active' : ''}`.trim()}
                >
                  <input
                    type="radio"
                    name="planting-status"
                    value={option.id}
                    checked={isActive}
                    onChange={() =>
                      setPlanting((prev) => ({
                        ...prev,
                        status: option.id,
                        // When the gardener says "it's growing now", default planting
                        // date to today so the harvest progress bar starts ticking.
                        plantingDate:
                          option.id === 'growing' && !prev.plantingDate
                            ? todayIso()
                            : prev.plantingDate,
                      }))
                    }
                  />
                  <span className="grn-status-option__emoji" aria-hidden="true">
                    {option.emoji}
                  </span>
                  <span className="grn-status-option__text">
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <BedSelector
            beds={beds}
            isLoading={isLoadingBeds}
            value={planting.bedId}
            onChange={(bedId) => setPlanting((prev) => ({ ...prev, bedId }))}
          />

          <div className="grn-new-crop__row">
            <Input
              label="Planting date"
              type="text"
              placeholder="YYYY-MM-DD"
              value={planting.plantingDate}
              onChange={(event) =>
                setPlanting((prev) => ({ ...prev, plantingDate: event.target.value }))
              }
            />
            <Input
              label="Expected first harvest"
              type="text"
              placeholder="YYYY-MM-DD"
              value={planting.expectedHarvestDate}
              onChange={(event) =>
                setPlanting((prev) => ({ ...prev, expectedHarvestDate: event.target.value }))
              }
            />
          </div>

          <div className="grn-quick-pick" role="group" aria-label="Quick harvest estimates">
            <span className="grn-quick-pick__label">Typical harvest window:</span>
            {[60, 75, 90, 120].map((days) => (
              <button
                key={days}
                type="button"
                className="grn-quick-pick__chip"
                onClick={() => {
                  const start = planting.plantingDate || todayIso();
                  setPlanting((prev) => ({
                    ...prev,
                    plantingDate: prev.plantingDate || start,
                    expectedHarvestDate: addDaysIso(start, days),
                  }));
                }}
                disabled={!!daysToHarvest && daysToHarvest === days}
              >
                {days} days
              </button>
            ))}
          </div>

          {daysToHarvest !== null ? (
            <p className="grn-new-crop__harvest-hint">
              {daysToHarvest >= 0
                ? `🌾 About ${daysToHarvest} day${daysToHarvest === 1 ? '' : 's'} until first harvest`
                : `⚠️ Harvest date is before planting date — double-check the dates above.`}
            </p>
          ) : null}

          <div className="grn-new-crop__row">
            <Input
              label="Number of plants"
              type="number"
              min={1}
              placeholder="e.g. 6"
              value={planting.plantCount}
              onChange={(event) =>
                setPlanting((prev) => ({ ...prev, plantCount: event.target.value }))
              }
            />
            <Input
              label="Spacing (inches)"
              type="number"
              min={0}
              placeholder="e.g. 18"
              value={planting.spacingInches}
              onChange={(event) =>
                setPlanting((prev) => ({ ...prev, spacingInches: event.target.value }))
              }
            />
          </div>
        </Card>

        <Card padding="6">
          <button
            type="button"
            className="grn-disclosure"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((prev) => !prev)}
          >
            <span className="grn-disclosure__chevron" aria-hidden="true">
              {showAdvanced ? '▾' : '▸'}
            </span>
            <span>
              <strong>Notes &amp; sharing</strong>
              <span className="grn-disclosure__hint">
                {' '}
                — nickname, units, and whether to share surplus with the community.
              </span>
            </span>
          </button>

          {showAdvanced ? (
            <div className="grn-new-crop__advanced">
              <div className="grn-new-crop__row">
                <Input
                  label="Nickname"
                  placeholder="e.g. Big Boy, Sweet 100s"
                  value={advanced.nickname}
                  onChange={(event) =>
                    setAdvanced((prev) => ({ ...prev, nickname: event.target.value }))
                  }
                />
                <Input
                  label="Default harvest unit"
                  placeholder="lb, bunch, each"
                  value={advanced.defaultUnit}
                  onChange={(event) =>
                    setAdvanced((prev) => ({ ...prev, defaultUnit: event.target.value }))
                  }
                />
              </div>
              <Textarea
                label="Notes"
                placeholder="Anything you want to remember — varieties tried, soil amendments, etc."
                rows={3}
                value={advanced.notes}
                onChange={(event) =>
                  setAdvanced((prev) => ({ ...prev, notes: event.target.value }))
                }
              />

              <div className="grn-share-toggle">
                <label className="grn-share-toggle__row">
                  <input
                    type="checkbox"
                    checked={advanced.surplusEnabled}
                    onChange={(event) =>
                      setAdvanced((prev) => ({
                        ...prev,
                        surplusEnabled: event.target.checked,
                      }))
                    }
                  />
                  <span>
                    <strong>Share surplus with neighbors</strong>
                    <span>
                      When you have extra, you can list it for nearby gatherers without retyping crop info.
                    </span>
                  </span>
                </label>

                {advanced.surplusEnabled ? (
                  <fieldset className="grn-share-toggle__visibility">
                    <legend>Who can see this crop in your garden?</legend>
                    {(
                      [
                        { id: 'private', label: 'Just me', emoji: '🔒' },
                        { id: 'local', label: 'Nearby community', emoji: '🤝' },
                        { id: 'public', label: 'Anyone on GRN', emoji: '🌍' },
                      ] as const
                    ).map((option) => (
                      <label
                        key={option.id}
                        className={`grn-share-toggle__option ${
                          advanced.visibility === option.id ? 'is-active' : ''
                        }`.trim()}
                      >
                        <input
                          type="radio"
                          name="visibility"
                          value={option.id}
                          checked={advanced.visibility === option.id}
                          onChange={() =>
                            setAdvanced((prev) => ({ ...prev, visibility: option.id }))
                          }
                        />
                        <span aria-hidden="true">{option.emoji}</span>
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </fieldset>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>

        {submitError ? (
          <p className="grn-new-crop__submit-error" role="alert">
            {submitError}
          </p>
        ) : null}

        <div className="grn-new-crop__actions">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={() => navigate('/crops')}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={!canSubmit}>
            {createMutation.isPending ? 'Planting…' : 'Add to my garden'}
          </Button>
        </div>
      </form>
    </section>
  );
}

export default NewCropPage;
