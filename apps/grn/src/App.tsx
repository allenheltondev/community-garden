import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { PlantLoader } from './components/branding/PlantLoader';

// Public page, lazy-loaded so visitors don't pay for the app shell and
// signed-in users don't pay for it at all.
const SharedGardenPage = lazy(() =>
  import('./pages/SharedGardenPage').then((m) => ({ default: m.SharedGardenPage }))
);

// Lazy-load the entire authenticated tree (shell + useUser + onboarding +
// every page) so the main bundle stays under the perf:budget cap.
// Eagerly importing useUser pulls services/api.ts (~26 KB) into main;
// deferring it keeps that out of the initial download until the user
// is past auth.
const AuthenticatedRoot = lazy(() =>
  import('./shell/AuthenticatedRoot').then((m) => ({ default: m.AuthenticatedRoot }))
);

const foundationLoginUrl = import.meta.env.VITE_FOUNDATION_URL
  ? `${import.meta.env.VITE_FOUNDATION_URL.replace(/\/+$/, '')}/login`
  : 'https://oliviasgarden.org/login';

function redirectToLogin() {
  const returnUrl = window.location.href;
  const loginUrl = `${foundationLoginUrl}?redirect=${encodeURIComponent(returnUrl)}`;
  window.location.assign(loginUrl);
}

function FullPageLoader() {
  return (
    <div className="grn-fullpage">
      <div className="grn-page-status">
        <PlantLoader size="md" />
        <p>Loading…</p>
      </div>
    </div>
  );
}

// The auth gate wraps everything except explicitly public pages: shared
// garden links must open for visitors without bouncing them to login.
function AuthGate() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <FullPageLoader />;
  }

  if (!isAuthenticated) {
    redirectToLogin();
    return <FullPageLoader />;
  }

  return (
    <Suspense fallback={<FullPageLoader />}>
      <AuthenticatedRoot />
    </Suspense>
  );
}

function App() {
  return (
    <Routes>
      <Route
        path="/shared/:token"
        element={
          <Suspense fallback={<FullPageLoader />}>
            <SharedGardenPage />
          </Suspense>
        }
      />
      <Route path="*" element={<AuthGate />} />
    </Routes>
  );
}

export default App;
