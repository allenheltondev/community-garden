// A listing created without its own pickup address inherits the grower's
// profile address: the API snapshots it into `effective_pickup_address` along
// with the geo key and coordinates at write time, and nothing re-derives them
// afterwards. So when a grower moves, those listings keep sending neighbors to
// the old address until each one is saved again.
//
// Re-saving a listing with `pickupAddress` omitted makes the API re-resolve the
// address from the current profile and re-geocode it, which is exactly the
// repair needed — no new endpoint required.

import type { Listing, UpsertListingRequest } from '../../types/listing';

/** Listing states where a stale pickup address could still strand someone. */
const LIVE_STATUSES = new Set(['active', 'pending', 'claimed']);

export function inheritsProfileAddress(listing: Listing): boolean {
  return !listing.pickupAddress?.trim() && LIVE_STATUSES.has(listing.status);
}

export function findInheritedListings(listings: readonly Listing[]): Listing[] {
  return listings.filter(inheritsProfileAddress);
}

/**
 * Rebuild a listing's write payload unchanged except for the pickup address,
 * which is deliberately omitted so the server falls back to the profile.
 *
 * `quantityTotal` is re-sent as-is; the API clamps `quantity_remaining` to the
 * lower of the two, so an already-claimed listing keeps what is left rather
 * than being topped back up.
 */
export function toRefreshPayload(listing: Listing): UpsertListingRequest {
  const status = listing.status as UpsertListingRequest['status'];

  return {
    title: listing.title,
    ...(listing.growerCropId
      ? { growerCropId: listing.growerCropId }
      : { cropId: listing.cropId }),
    ...(listing.varietyId ? { varietyId: listing.varietyId } : {}),
    quantityTotal: Number(listing.quantityTotal),
    unit: listing.unit,
    availableStart: listing.availableStart,
    availableEnd: listing.availableEnd,
    ...(listing.pickupLocationText ? { pickupLocationText: listing.pickupLocationText } : {}),
    pickupDisclosurePolicy:
      listing.pickupDisclosurePolicy as UpsertListingRequest['pickupDisclosurePolicy'],
    ...(listing.pickupNotes ? { pickupNotes: listing.pickupNotes } : {}),
    contactPref: listing.contactPref as UpsertListingRequest['contactPref'],
    // Sent because the payload requires them; the API overwrites both from the
    // freshly geocoded address.
    lat: listing.lat,
    lng: listing.lng,
    ...(status ? { status } : {}),
  };
}
