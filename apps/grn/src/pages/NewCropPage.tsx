import { useMemo } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Panel, SectionHeading } from '@olivias/ui';
import { CropForm } from '../components/CropPlanner/CropForm';
import { PlantLoader } from '../components/branding/PlantLoader';
import { getMe, listMyBeds } from '../services/api';
import { completeTodayAction } from '../utils/todayActionTracking';

/**
 * Standalone page wrapper around <CropForm/> — the full add-a-crop form
 * with planting plan and sharing options. The garden designer no longer
 * embeds this form; it uses a lightweight inline quick-add
 * (components/GardenDesigner/QuickAddCrop.tsx) so adding crops while
 * designing stays fast and doesn't interrupt the flow.
 */
export function NewCropPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedBedId = searchParams.get('bedId');

  const { data: profile, isLoading: isLoadingProfile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: getMe,
    staleTime: 5 * 60 * 1000,
  });

  const { data: beds = [] } = useQuery({
    queryKey: ['myBeds'],
    queryFn: listMyBeds,
    enabled: profile?.userType === 'grower' && requestedBedId !== null,
  });

  const lockedBed = useMemo(
    () => (requestedBedId ? beds.find((b) => b.id === requestedBedId) ?? null : null),
    [beds, requestedBedId]
  );

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

  return (
    <section className="grn-section grn-new-crop">
      <SectionHeading
        eyebrow="Plan your garden"
        title="Add a crop"
        body="Tell us what's going in the ground — we'll tuck it into your garden plan."
      />

      <CropForm
        lockedBed={lockedBed}
        initialBedId={requestedBedId}
        onCancel={() => navigate('/garden/plants')}
        onSuccess={() => {
          completeTodayAction('start');
          navigate('/garden/plants', { replace: true });
        }}
      />
    </section>
  );
}

export default NewCropPage;
