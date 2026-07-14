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
        <SectionHeading title="Plants" />
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
        title="Plants"
        body="Track what is growing, record harvests, and keep every crop connected to its bed."
      />
      <CropLibraryPanel viewerUserId={profile.id} />
    </section>
  );
}

export default CropsPage;
