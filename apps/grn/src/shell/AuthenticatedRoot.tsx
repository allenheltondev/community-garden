import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useUser } from '../hooks/useUser';
import { PlantLoader } from '../components/branding/PlantLoader';
import { AppShell } from './AppShell';
import { OnboardingGuard } from '../components/Onboarding/OnboardingGuard';

const DashboardPage = lazy(() =>
  import('../pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const CropsPage = lazy(() =>
  import('../pages/CropsPage').then((m) => ({ default: m.CropsPage }))
);
const RecommendationsPage = lazy(() =>
  import('../pages/RecommendationsPage').then((m) => ({ default: m.RecommendationsPage }))
);
const NewCropPage = lazy(() =>
  import('../pages/NewCropPage').then((m) => ({ default: m.NewCropPage }))
);
const GardenDesignerPage = lazy(() =>
  import('../pages/GardenDesignerPage').then((m) => ({ default: m.GardenDesignerPage }))
);
const ListingsPage = lazy(() =>
  import('../pages/ListingsPage').then((m) => ({ default: m.ListingsPage }))
);
const RequestsPage = lazy(() =>
  import('../pages/RequestsPage').then((m) => ({ default: m.RequestsPage }))
);
const RemindersPage = lazy(() =>
  import('../pages/RemindersPage').then((m) => ({ default: m.RemindersPage }))
);

function MainLoader() {
  return (
    <div className="grn-page-status">
      <PlantLoader size="md" />
      <p>Loading…</p>
    </div>
  );
}

/**
 * AuthenticatedRoot owns the single `useUser` instance for the signed-in
 * tree and renders AppShell as the always-on chrome (header, left nav,
 * footer). OnboardingGuard sits inside the shell's main slot so the
 * onboarding flow appears within the same layout the rest of the app
 * uses — no separate full-page experience.
 */
export function AuthenticatedRoot() {
  const { user, isLoading, refreshUser } = useUser();

  return (
    <AppShell user={user}>
      <Suspense fallback={<MainLoader />}>
        {isLoading ? (
          <MainLoader />
        ) : (
          <OnboardingGuard user={user} refreshUser={refreshUser}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/crops" element={<CropsPage />} />
              <Route path="/crops/new" element={<NewCropPage />} />
              <Route path="/recommendations" element={<RecommendationsPage />} />
              <Route path="/garden" element={<GardenDesignerPage />} />
              <Route path="/listings" element={<ListingsPage />} />
              <Route path="/requests" element={<RequestsPage />} />
              <Route path="/reminders" element={<RemindersPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </OnboardingGuard>
        )}
      </Suspense>
    </AppShell>
  );
}
