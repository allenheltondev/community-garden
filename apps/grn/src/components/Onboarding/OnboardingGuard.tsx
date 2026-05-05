import type { ReactNode } from 'react';
import type { UserProfile } from '../../types/user';
import { OnboardingFlow } from './OnboardingFlow';

export interface OnboardingGuardProps {
  user: UserProfile | null;
  refreshUser: () => Promise<void> | void;
  children: ReactNode;
}

/**
 * OnboardingGuard
 *
 * Gates the routed content behind onboarding completion. When onboarding
 * is incomplete, renders OnboardingFlow in place of the routed children;
 * otherwise renders children. The user/refreshUser come from a single
 * useUser instance owned upstream so onboarding completion immediately
 * flips this guard from flow → routes without a stale-state hop.
 *
 * Render this *inside* AppShell so the header/footer/left nav stay
 * visible during onboarding and across every route.
 */
export function OnboardingGuard({ user, refreshUser, children }: OnboardingGuardProps) {
  if (!user?.onboardingCompleted) {
    return <OnboardingFlow user={user} refreshUser={refreshUser} />;
  }

  return <>{children}</>;
}
