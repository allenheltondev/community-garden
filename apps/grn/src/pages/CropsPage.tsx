import { Navigate } from 'react-router-dom';
import { Panel, SectionHeading } from '@olivias/ui';
import { useQuery } from '@tanstack/react-query';
import { getMe } from '../services/api';
import { CropLibraryPanel } from '../components/Profile/CropLibraryPanel';
import { PlantLoader } from '../components/branding/PlantLoader';

export function CropsPage() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ['userProfile'],
    queryFn: getMe,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  if (isLoading) {
    return (
      <section className="grn-section">
        <SectionHeading eyebrow="Grower tools" title="My garden" />
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
        eyebrow="Grower tools"
        title="My garden"
        body="Track what you grow, when it goes in the ground, and where it lives."
      />
      <CropLibraryPanel viewerUserId={profile.id} />
    </section>
  );
}

export default CropsPage;
