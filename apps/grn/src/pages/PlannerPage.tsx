import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Panel, SectionHeading } from '@olivias/ui';
import { getMe, listMyCrops } from '../services/api';
import { PlantLoader } from '../components/branding/PlantLoader';
import { GardenPyramid } from '../components/Planner/GardenPyramid';
import { CropIcon } from '../components/CropPlanner/cropIcons';
import { visualForCrop } from '../components/CropPlanner/cropVisuals';
import {
  bucketCropsByTier,
  tierMeta,
  type PyramidTier,
} from '../components/CropPlanner/gardenPyramid';
import type { GrowerCropItem } from '../types/listing';

const ALL_TIERS: PyramidTier[] = [1, 2, 3, 4, 5];

export function PlannerPage() {
  const navigate = useNavigate();
  const [activeTier, setActiveTier] = useState<PyramidTier>(1);

  const { data: profile, isLoading: isLoadingProfile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: getMe,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const { data: myCrops } = useQuery({
    queryKey: ['myCrops'],
    queryFn: listMyCrops,
    enabled: profile?.userType === 'grower',
  });

  const { tiers, unsorted } = useMemo(
    () => bucketCropsByTier(myCrops ?? []),
    [myCrops]
  );

  const counts = useMemo(
    () =>
      ALL_TIERS.reduce(
        (acc, level) => {
          acc[level] = tiers[level].length;
          return acc;
        },
        {} as Record<PyramidTier, number>
      ),
    [tiers]
  );

  const coveredCount = ALL_TIERS.filter((level) => counts[level] > 0).length;

  if (isLoadingProfile) {
    return (
      <section className="grn-section">
        <SectionHeading eyebrow="Grower tools" title="Garden pyramid" />
        <Panel className="grn-page-status">
          <PlantLoader size="md" />
          <p>Loading your plan…</p>
        </Panel>
      </section>
    );
  }

  if (!profile || profile.userType !== 'grower') {
    return <Navigate to="/" replace />;
  }

  const activeCrops = tiers[activeTier];

  return (
    <section className="grn-section grn-planner">
      <SectionHeading
        eyebrow="Grower tools"
        title="Garden pyramid"
        body="Plan your garden in five layers — biggest to smallest. Build from the Foundation up: staples first, then the everyday workhorses, fresh greens, flavor, and finally the joy crops."
      />

      <Card padding="6">
        <div className="grn-planner__progress">
          <div>
            <p className="grn-planner__progress-stat">
              <strong>{coveredCount}</strong> of 5 layers started
            </p>
            <p className="grn-planner__progress-hint">
              {coveredCount === 0
                ? 'Your pyramid is empty — start at the Foundation with a staple crop.'
                : coveredCount === 5
                  ? 'Every layer has a crop — a wonderfully balanced garden plan!'
                  : 'Keep building. A strong garden grows from the bottom up.'}
            </p>
          </div>
          <div className="grn-planner__progress-track" aria-hidden="true">
            {ALL_TIERS.map((level) => (
              <span
                key={level}
                className={`grn-planner__progress-pip ${counts[level] > 0 ? 'is-on' : ''}`.trim()}
                style={{ background: counts[level] > 0 ? tierMeta(level).accent : undefined }}
              />
            ))}
          </div>
        </div>

        <GardenPyramid
          counts={counts}
          activeTier={activeTier}
          onSelectTier={setActiveTier}
        />
      </Card>

      <Card padding="6">
        <TierDetail
          tier={activeTier}
          crops={activeCrops}
          onAddCrop={() => navigate('/crops/new')}
        />
      </Card>

      {unsorted.length > 0 ? (
        <Card padding="6">
          <div className="grn-planner__unsorted">
            <h3 className="grn-planner__detail-name">Not yet placed</h3>
            <p className="grn-planner__detail-desc">
              We couldn&apos;t auto-sort these into a layer — they may be perfect
              experiments for your Joy tier.
            </p>
            <ul className="grn-planner__crop-list">
              {unsorted.map((crop) => (
                <CropChip key={crop.id} crop={crop} />
              ))}
            </ul>
          </div>
        </Card>
      ) : null}
    </section>
  );
}

interface TierDetailProps {
  tier: PyramidTier;
  crops: GrowerCropItem[];
  onAddCrop: () => void;
}

function TierDetail({ tier, crops, onAddCrop }: TierDetailProps) {
  const meta = tierMeta(tier);
  const plantedNames = useMemo(
    () => new Set(crops.map((c) => c.cropName.trim().toLowerCase())),
    [crops]
  );
  const openSuggestions = meta.suggestions.filter(
    (s) => !plantedNames.has(s.name.trim().toLowerCase())
  );

  return (
    <div className="grn-planner__detail">
      <header
        className="grn-planner__detail-head"
        style={{ ['--tier-accent' as string]: meta.accent }}
      >
        <span className="grn-planner__detail-level" aria-hidden="true">
          {meta.level}
        </span>
        <div>
          <h3 className="grn-planner__detail-name">{meta.name}</h3>
          <p className="grn-planner__detail-tagline">{meta.tagline}</p>
        </div>
      </header>

      <p className="grn-planner__detail-desc">{meta.description}</p>

      <div className="grn-planner__detail-section">
        <h4 className="grn-planner__detail-subhead">
          In your garden ({crops.length})
        </h4>
        {crops.length > 0 ? (
          <ul className="grn-planner__crop-list">
            {crops.map((crop) => (
              <CropChip key={crop.id} crop={crop} />
            ))}
          </ul>
        ) : (
          <p className="grn-planner__detail-empty">
            Nothing in this layer yet.
          </p>
        )}
      </div>

      {openSuggestions.length > 0 ? (
        <div className="grn-planner__detail-section">
          <h4 className="grn-planner__detail-subhead">Ideas to fill this layer</h4>
          <ul className="grn-planner__suggestions">
            {openSuggestions.map((suggestion) => (
              <li key={suggestion.name}>
                <span className="grn-planner__suggestion" style={{ color: meta.accent }}>
                  <CropIcon iconKey={suggestion.iconKey} color={meta.accent} size="1.1rem" />
                  {suggestion.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grn-planner__detail-actions">
        <Button variant="primary" size="sm" onClick={onAddCrop}>
          + Add a crop
        </Button>
      </div>
    </div>
  );
}

function CropChip({ crop }: { crop: GrowerCropItem }) {
  const visual = visualForCrop(crop.cropName, null);
  return (
    <li className="grn-planner__crop-chip" style={{ borderColor: `${visual.accent}55` }}>
      <CropIcon iconKey={visual.iconKey} color={visual.accent} size="1.2rem" />
      <span>{crop.nickname || crop.cropName}</span>
    </li>
  );
}

export default PlannerPage;
