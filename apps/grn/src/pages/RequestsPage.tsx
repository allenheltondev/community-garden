import { Navigate } from 'react-router-dom';
import { Panel, SectionHeading } from '@olivias/ui';
import { useQuery } from '@tanstack/react-query';
import { getMe } from '../services/api';
import { FindFoodPanel } from '../components/Listings/FindFoodPanel';
import { PlantLoader } from '../components/branding/PlantLoader';

// Default search radius (miles) when a grower is discovering food nearby.
const DEFAULT_SEARCH_RADIUS_MILES = 10;

export function RequestsPage() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ['userProfile'],
    queryFn: getMe,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  if (isLoading) {
    return (
      <section className="grn-section">
        <SectionHeading eyebrow="Connect" title="Find food nearby" />
        <Panel className="grn-page-status">
          <PlantLoader size="md" />
          <p>Loading…</p>
        </Panel>
      </section>
    );
  }

  if (!profile) {
    return <Navigate to="/" replace />;
  }

  // Everyone is a grower. Finding food is grower-to-grower: we center the
  // search on the grower's own garden location.
  const geoKey = profile.growerProfile?.geoKey;
  const defaultLat = profile.growerProfile?.lat;
  const defaultLng = profile.growerProfile?.lng;
  const defaultRadiusMiles = DEFAULT_SEARCH_RADIUS_MILES;

  return (
    <section className="grn-section">
      <SectionHeading
        eyebrow="Connect"
        title="Find food nearby"
        body="Search growers near you and coordinate pickup details."
      />
      <FindFoodPanel
        viewerUserId={profile.id}
        originGeoKey={geoKey}
        defaultLat={defaultLat}
        defaultLng={defaultLng}
        defaultRadiusMiles={defaultRadiusMiles}
      />
    </section>
  );
}

export default RequestsPage;
