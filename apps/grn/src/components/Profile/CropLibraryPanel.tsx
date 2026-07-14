import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listMyCrops, deleteMyCrop, listMyBeds } from '../../services/api';
import type { GrowerCropItem } from '../../types/listing';
import { Button, Card } from '@olivias/ui';
import { createLogger } from '../../utils/logging';
import { visualForCrop } from '../CropPlanner/cropVisuals';
import { CropIcon } from '../CropPlanner/cropIcons';
import { HarvestLogModal } from '../Harvests/HarvestLogModal';
import { daysUntil, formatDate, harvestProgress } from '../../utils/cropTiming';

const logger = createLogger('crop-library');

interface CropLibraryPanelProps {
  viewerUserId?: string;
}

const STATUS_LABELS: Record<string, { label: string; emoji: string; tone: string }> = {
  interested: { label: 'Interested', emoji: '💭', tone: 'neutral' },
  planning: { label: 'Planning', emoji: '📋', tone: 'info' },
  growing: { label: 'Growing', emoji: '🌱', tone: 'success' },
  paused: { label: 'Paused', emoji: '⏸️', tone: 'muted' },
};

export function CropLibraryPanel({ viewerUserId }: CropLibraryPanelProps) {
  void viewerUserId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'growing' | 'planning' | 'interested'>('all');
  const [harvestCrop, setHarvestCrop] = useState<GrowerCropItem | null>(null);

  const { data: myCrops, isLoading: isLoadingCrops } = useQuery({
    queryKey: ['myCrops'],
    queryFn: listMyCrops,
  });

  const { data: beds = [] } = useQuery({
    queryKey: ['myBeds'],
    queryFn: listMyBeds,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMyCrop,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myCrops'] });
      logger.info('Crop removed from library');
    },
    onError: (error) => {
      logger.error('Failed to remove crop', error instanceof Error ? error : undefined);
    },
  });

  const filteredCrops = useMemo(() => {
    if (!myCrops) return [];
    if (filter === 'all') return myCrops;
    return myCrops.filter((crop) => crop.status === filter);
  }, [myCrops, filter]);

  const handleDelete = (crop: GrowerCropItem) => {
    if (
      confirm(
        `Remove "${crop.nickname || crop.cropName}" from your garden? This won't delete any listings already created.`
      )
    ) {
      deleteMutation.mutate(crop.id);
    }
  };

  if (isLoadingCrops) {
    return (
      <Card>
        <div className="grn-page-status">
          <p>Loading your garden…</p>
        </div>
      </Card>
    );
  }

  const counts = {
    all: myCrops?.length ?? 0,
    growing: myCrops?.filter((c) => c.status === 'growing').length ?? 0,
    planning: myCrops?.filter((c) => c.status === 'planning').length ?? 0,
    interested: myCrops?.filter((c) => c.status === 'interested').length ?? 0,
  };

  if (!myCrops || myCrops.length === 0) {
    return (
      <Card padding="6">
        <div className="grn-crop-empty">
          <span className="grn-crop-empty__emoji" aria-hidden="true">🌱</span>
          <h3>Your garden is a blank slate</h3>
          <p>
            Add your first crop and start mapping out beds, planting dates, and what you&apos;d like to grow.
          </p>
          <Button variant="primary" size="md" onClick={() => navigate('/garden/plants/new')}>
            Add a crop
          </Button>
          {beds.length === 0 ? (
            <p className="grn-crop-empty__hint">
              You can also set up garden beds while adding your first crop.
            </p>
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <div className="grn-crop-library">
      <Card padding="6">
        <div className="grn-crop-library__head">
          <div>
            <h3 className="grn-crop-library__title">My garden</h3>
            <p className="grn-crop-library__subtitle">
              {counts.all} crop{counts.all === 1 ? '' : 's'} tracked
              {beds.length ? ` · ${beds.length} bed${beds.length === 1 ? '' : 's'}` : ''}
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => navigate('/garden/plants/new')}>
            + Add crop
          </Button>
        </div>

        <div className="grn-crop-library__filters" role="tablist" aria-label="Filter crops by status">
          {([
            { id: 'all', label: 'All', count: counts.all },
            { id: 'growing', label: 'Growing', count: counts.growing },
            { id: 'planning', label: 'Planning', count: counts.planning },
            { id: 'interested', label: 'Interested', count: counts.interested },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filter === tab.id}
              className={`grn-crop-library__tab ${filter === tab.id ? 'is-active' : ''}`.trim()}
              onClick={() => setFilter(tab.id)}
            >
              <span>{tab.label}</span>
              <span className="grn-crop-library__tab-count">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="grn-crop-grid">
          {filteredCrops.map((crop) => {
            const visual = visualForCrop(crop.cropName, null);
            const status = STATUS_LABELS[crop.status] ?? STATUS_LABELS.interested;
            const planted = formatDate(crop.plantingDate);
            const harvest = formatDate(crop.expectedHarvestDate);
            const harvestIn = daysUntil(crop.expectedHarvestDate);
            const progress = harvestProgress(crop.plantingDate, crop.expectedHarvestDate);

            return (
              <article key={crop.id} className="grn-crop-card">
                <header
                  className="grn-crop-card__header"
                  style={{
                    background: `linear-gradient(135deg, ${visual.accent}33, ${visual.accent}10)`,
                  }}
                >
                  <span className="grn-crop-card__emoji" aria-hidden="true">
                    <CropIcon iconKey={visual.iconKey} color={visual.accent} size="2.4rem" />
                  </span>
                  <span className={`grn-crop-card__status grn-crop-card__status--${status.tone}`}>
                    <span aria-hidden="true">{status.emoji}</span>
                    {status.label}
                  </span>
                </header>

                <div className="grn-crop-card__body">
                  <h4 className="grn-crop-card__name">
                    {crop.nickname || crop.cropName}
                  </h4>
                  {crop.nickname ? (
                    <p className="grn-crop-card__subname">{crop.cropName}</p>
                  ) : null}

                  <ul className="grn-crop-card__facts">
                    {crop.bedName ? (
                      <li>
                        <span aria-hidden="true">🛏️</span>
                        <span>{crop.bedName}</span>
                      </li>
                    ) : null}
                    {planted ? (
                      <li>
                        <span aria-hidden="true">🌱</span>
                        <span>Planted {planted}</span>
                      </li>
                    ) : null}
                    {harvest ? (
                      <li>
                        <span aria-hidden="true">🌾</span>
                        <span>
                          Harvest {harvest}
                          {harvestIn !== null && harvestIn >= 0
                            ? ` · in ${harvestIn} day${harvestIn === 1 ? '' : 's'}`
                            : ''}
                        </span>
                      </li>
                    ) : null}
                    {crop.plantCount ? (
                      <li>
                        <span aria-hidden="true">🔢</span>
                        <span>
                          {crop.plantCount} plant{crop.plantCount === 1 ? '' : 's'}
                          {crop.spacingInches ? ` · ${crop.spacingInches}" apart` : ''}
                        </span>
                      </li>
                    ) : null}
                    {crop.surplusEnabled ? (
                      <li>
                        <span aria-hidden="true">🤝</span>
                        <span>Surplus sharing on</span>
                      </li>
                    ) : null}
                  </ul>

                  {progress !== null ? (
                    <div
                      className="grn-crop-card__progress"
                      role="progressbar"
                      aria-valuenow={progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Days planted vs days to harvest"
                    >
                      <span
                        className="grn-crop-card__progress-bar"
                        style={{ width: `${progress}%`, background: visual.accent }}
                      />
                    </div>
                  ) : null}
                </div>

                <footer className="grn-crop-card__footer">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setHarvestCrop(crop)}
                  >
                    Harvests
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/garden/plants/new?edit=${crop.id}`)}
                    disabled
                    title="Editing comes next — for now, remove and re-add"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(crop)}
                    disabled={deleteMutation.isPending}
                    className="grn-crop-card__remove"
                  >
                    Remove
                  </Button>
                </footer>
              </article>
            );
          })}
        </div>
      </Card>

      {harvestCrop ? (
        <HarvestLogModal
          cropId={harvestCrop.id}
          cropName={harvestCrop.nickname || harvestCrop.cropName}
          defaultUnit={harvestCrop.defaultUnit}
          onClose={() => setHarvestCrop(null)}
        />
      ) : null}
    </div>
  );
}
