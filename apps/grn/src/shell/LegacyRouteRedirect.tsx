import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { createLogger } from '../utils/logging';

const navigationLogger = createLogger('navigation');

export interface LegacyRouteRedirectProps {
  to: string;
}

/** Preserve query parameters and anchors when moving old bookmarks to the new IA. */
export function LegacyRouteRedirect({ to }: LegacyRouteRedirectProps) {
  const location = useLocation();
  const destination = `${to}${location.search}${location.hash}`;

  useEffect(() => {
    navigationLogger.info('Legacy route redirected', {
      fromRoute: location.pathname,
      toRoute: to,
    });
  }, [location.pathname, to]);

  return <Navigate to={destination} replace />;
}
