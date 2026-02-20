import type { Claim } from '../types/claim';

const CLAIM_SESSION_STORAGE_KEY = 'claim-session-v1';

function isClaim(value: unknown): value is Claim {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.listingId === 'string' &&
    typeof record.claimerId === 'string' &&
    typeof record.listingOwnerId === 'string' &&
    typeof record.status === 'string'
  );
}

export function loadSessionClaims(): Claim[] {
  try {
    const serialized = window.localStorage.getItem(CLAIM_SESSION_STORAGE_KEY);
    if (!serialized) {
      return [];
    }

    const parsed = JSON.parse(serialized);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isClaim);
  } catch {
    return [];
  }
}

export function saveSessionClaims(claims: Claim[]): void {
  try {
    window.localStorage.setItem(CLAIM_SESSION_STORAGE_KEY, JSON.stringify(claims));
  } catch {
    // Ignore localStorage write failures in restricted environments.
  }
}

export function upsertSessionClaim(existing: Claim[], claim: Claim): Claim[] {
  const index = existing.findIndex((candidate) => candidate.id === claim.id);
  if (index < 0) {
    return [claim, ...existing];
  }

  const next = [...existing];
  next[index] = claim;
  return next;
}
