import { Navigate } from 'react-router-dom';
import { Panel, SectionHeading } from '@olivias/ui';
import { useQuery } from '@tanstack/react-query';
import { getMe } from '../services/api';
import { SearcherRequestPanel } from '../components/Listings/SearcherRequestPanel';
import { PlantLoader } from '../components/branding/PlantLoader';

// Default search radius (miles) for a grower who is discovering food without a
// gatherer profile of their own.
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

  // Everyone can discover and request food. Gatherers use their search
  // profile; growers fall back to their garden's location so the map still
  // centers somewhere sensible.
  const geoKey = profile.gathererProfile?.geoKey ?? profile.growerProfile?.geoKey;
  const defaultLat = profile.gathererProfile?.lat ?? profile.growerProfile?.lat;
  const defaultLng = profile.gathererProfile?.lng ?? profile.growerProfile?.lng;
  const defaultRadiusMiles =
    profile.gathererProfile?.searchRadiusMiles ?? DEFAULT_SEARCH_RADIUS_MILES;

  return (
    <section className="grn-section">
      <SectionHeading
        eyebrow="Connect"
        title="Find food nearby"
        body="Search growers near you and coordinate pickup details."
      />
      <SearcherRequestPanel
        viewerUserId={profile.id}
        gathererGeoKey={geoKey}
        defaultLat={defaultLat}
        defaultLng={defaultLng}
        defaultRadiusMiles={defaultRadiusMiles}
      />
    </section>
  );
}

export default RequestsPage;
