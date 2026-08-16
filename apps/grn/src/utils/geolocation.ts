import { logger } from './logging';

export interface ResolvedLocation {
  address: string;
  postcode?: string;
  latitude: number;
  longitude: number;
}

interface NominatimResponse {
  display_name?: string;
  address?: {
    postcode?: string;
  };
}

interface PhzmapiResponse {
  zone?: string;
}

/**
 * Reverse-geocode a coordinate using Nominatim. Returns the human-readable
 * address along with the postcode (when available). Postcode is preserved so
 * downstream lookups (e.g. USDA hardiness zone) can use it.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<ResolvedLocation | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as NominatimResponse;
    const address = data.display_name?.trim();
    if (!address) {
      return null;
    }

    return {
      address,
      postcode: data.address?.postcode?.trim() || undefined,
      latitude,
      longitude,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Pull a US zipcode out of a typed address so the hardiness-zone lookup can
 * run without a forward-geocoding round trip. Returns null when there is no
 * recognisable zipcode — non-US addresses included — and callers should then
 * leave the zone alone rather than guessing.
 *
 * Anchored to the end of the string because that is where a zipcode sits in a
 * postal address; a bare house number ("5 digits" earlier in the line) is not
 * a zipcode.
 */
export function postcodeFromAddress(address: string): string | null {
  const match = /\b(\d{5})(?:-\d{4})?\s*(?:,\s*(?:usa|us|united states))?\s*$/i.exec(address.trim());
  return match ? match[1] : null;
}

/**
 * Look up the USDA Plant Hardiness Zone for a US zipcode. Uses phzmapi.org —
 * a public, no-auth dataset of the 2023 USDA hardiness zone map. Returns null
 * for non-US postcodes or any failure; callers should fall back to manual entry.
 */
export async function lookupHardinessZone(postcode: string): Promise<string | null> {
  const trimmed = postcode.trim();
  // phzmapi accepts US 5-digit zipcodes (optionally with -ZIP+4 suffix).
  const usZip = /^(\d{5})(?:-\d{4})?$/.exec(trimmed);
  if (!usZip) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`https://phzmapi.org/${usZip[1]}.json`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as PhzmapiResponse;
    return data.zone?.trim() || null;
  } catch (error) {
    logger.warn('Hardiness zone lookup failed', {
      postcode: usZip[1],
      message: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Pick a sensible default unit system from the user's browser locale. Imperial
 * is used by US, Liberia, and Myanmar; everyone else gets metric.
 */
export function defaultUnitsForLocale(locale: string = navigator.language || 'en-US'): 'metric' | 'imperial' {
  const normalized = locale.toLowerCase();
  if (
    normalized.startsWith('en-us') ||
    normalized.startsWith('en-lr') ||
    normalized.startsWith('my-mm') ||
    normalized === 'en'
  ) {
    return 'imperial';
  }
  return 'metric';
}
