import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useUser } from '../hooks/useUser';
import { PlantLoader } from '../components/branding/PlantLoader';
import { AppShell } from './AppShell';
import { OnboardingGuard } from '../components/Onboarding/OnboardingGuard';
import { LegacyRouteRedirect } from './LegacyRouteRedirect';
import { LEGACY_ROUTE_REDIRECTS } from './navigation';

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
const PlannerPage = lazy(() =>
  import('../pages/PlannerPage').then((m) => ({ default: m.PlannerPage }))
);
const GardenDesignerPage = lazy(() =>
  import('../pages/GardenDesignerPage').then((m) => ({ default: m.GardenDesignerPage }))
);
const GardenWorkspacePage = lazy(() =>
  import('../pages/GardenWorkspacePage').then((m) => ({ default: m.GardenWorkspacePage }))
);
const GardenJournalPage = lazy(() =>
  import('../pages/GardenJournalPage').then((m) => ({ default: m.GardenJournalPage }))
);
const GrowMorePage = lazy(() =>
  import('../pages/GrowMorePage').then((m) => ({ default: m.GrowMorePage }))
);
const ListingsPage = lazy(() =>
  import('../pages/ListingsPage').then((m) => ({ default: m.ListingsPage }))
);
const ConnectPage = lazy(() =>
  import('../pages/ConnectPage').then((m) => ({ default: m.ConnectPage }))
);
const RequestsPage = lazy(() =>
  import('../pages/RequestsPage').then((m) => ({ default: m.RequestsPage }))
);
const RemindersPage = lazy(() =>
  import('../pages/RemindersPage').then((m) => ({ default: m.RemindersPage }))
);
const ApiKeysPage = lazy(() =>
  import('../pages/ApiKeysPage').then((m) => ({ default: m.ApiKeysPage }))
);
const SettingsPage = lazy(() =>
  import('../pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
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
              <Route path="/" element={<DashboardPage user={user} />} />
              <Route path="/today/reminders" element={<RemindersPage />} />
              <Route path="/garden" element={<GardenWorkspacePage />}>
                <Route index element={<GardenDesignerPage />} />
                <Route path="plants" element={<CropsPage />} />
                <Route path="plants/new" element={<NewCropPage />} />
                <Route path="plan" element={<PlannerPage />} />
                <Route path="plan/recommendations" element={<RecommendationsPage />} />
                <Route path="journal" element={<GardenJournalPage />} />
                <Route path="grow-more" element={<GrowMorePage />} />
              </Route>
              <Route path="/share" element={<ConnectPage />} />
              <Route path="/share/listings" element={<ListingsPage />} />
              <Route path="/share/find" element={<RequestsPage />} />
              <Route
                path="/settings"
                element={<SettingsPage user={user} refreshUser={refreshUser} />}
              />
              <Route path="/settings/api-keys" element={<ApiKeysPage />} />
              {Object.entries(LEGACY_ROUTE_REDIRECTS).map(([from, to]) => (
                <Route key={from} path={from} element={<LegacyRouteRedirect to={to} />} />
              ))}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </OnboardingGuard>
        )}
      </Suspense>
    </AppShell>
  );
}
