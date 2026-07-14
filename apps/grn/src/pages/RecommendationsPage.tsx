import { Navigate } from 'react-router-dom';
import { Panel, SectionHeading } from '@olivias/ui';
import { useQuery } from '@tanstack/react-query';
import { getMe } from '../services/api';
import { RecommendationsPanel } from '../components/Recommendations/RecommendationsPanel';
import { PlantLoader } from '../components/branding/PlantLoader';

export function RecommendationsPage() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ['userProfile'],
    queryFn: getMe,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  if (isLoading) {
    return (
      <section className="grn-section">
        <SectionHeading title="Local planting context" />
        <Panel className="grn-page-status">
          <PlantLoader size="md" />
          <p>Loading…</p>
        </Panel>
      </section>
    );
  }

  if (!profile || profile.userType !== 'grower') {
    return <Navigate to="/" replace />;
  }

  return (
    <section className="grn-section">
      <SectionHeading
        title="Local planting context"
        body="Optional ideas based on aggregated activity near you. Use what fits your garden and ignore the rest."
      />
      <RecommendationsPanel
        viewerUserId={profile.id}
        growerGeoKey={profile.growerProfile?.geoKey ?? null}
      />
    </section>
  );
}

export default RecommendationsPage;
