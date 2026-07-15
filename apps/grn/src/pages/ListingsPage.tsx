import { Navigate } from 'react-router-dom';
import { Panel, SectionHeading } from '@olivias/ui';
import { useQuery } from '@tanstack/react-query';
import { getMe } from '../services/api';
import { GrowerListingPanel } from '../components/Listings/GrowerListingPanel';
import { PlantLoader } from '../components/branding/PlantLoader';

export function ListingsPage() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ['userProfile'],
    queryFn: getMe,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  if (isLoading) {
    return (
      <section className="grn-section">
        <SectionHeading title="Food to share" />
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
        title="Food to share"
        body="Share extra food, respond to pickup requests, and see your completed neighbor pickups."
      />
      <GrowerListingPanel
        viewerUserId={profile.id}
        defaultLat={profile.growerProfile?.lat}
        defaultLng={profile.growerProfile?.lng}
      />
    </section>
  );
}

export default ListingsPage;
