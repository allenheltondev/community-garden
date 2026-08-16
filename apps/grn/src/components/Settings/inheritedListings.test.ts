import { describe, expect, it } from 'vitest';
import { findInheritedListings, inheritsProfileAddress, toRefreshPayload } from './inheritedListings';
import type { Listing } from '../../types/listing';

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: 'listing-1',
    userId: 'grower-1',
    growerCropId: null,
    cropId: 'crop-1',
    varietyId: null,
    title: 'Cherry tomatoes',
    unit: 'lb',
    quantityTotal: '10',
    quantityRemaining: '4',
    availableStart: '2026-08-01',
    availableEnd: '2026-08-14',
    status: 'active',
    pickupLocationText: 'Front porch',
    pickupAddress: null,
    pickupDisclosurePolicy: 'after_confirmed',
    pickupNotes: 'Ring the bell',
    contactPref: 'app_message',
    geoKey: '9v6kn7',
    lat: 30.2,
    lng: -97.7,
    createdAt: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('inheritsProfileAddress', () => {
  it('flags a live listing with no pickup address of its own', () => {
    expect(inheritsProfileAddress(listing())).toBe(true);
    expect(inheritsProfileAddress(listing({ pickupAddress: '   ' }))).toBe(true);
    expect(inheritsProfileAddress(listing({ status: 'pending' }))).toBe(true);
    expect(inheritsProfileAddress(listing({ status: 'claimed' }))).toBe(true);
  });

  it('leaves listings with their own address alone', () => {
    expect(inheritsProfileAddress(listing({ pickupAddress: '55 Other St, Austin, TX' }))).toBe(false);
  });

  it('ignores listings nobody is going to drive to', () => {
    expect(inheritsProfileAddress(listing({ status: 'completed' }))).toBe(false);
    expect(inheritsProfileAddress(listing({ status: 'expired' }))).toBe(false);
  });
});

describe('findInheritedListings', () => {
  it('returns only the listings a move would strand', () => {
    const found = findInheritedListings([
      listing({ id: 'a' }),
      listing({ id: 'b', pickupAddress: '55 Other St' }),
      listing({ id: 'c', status: 'completed' }),
      listing({ id: 'd', status: 'pending' }),
    ]);

    expect(found.map((item) => item.id)).toEqual(['a', 'd']);
  });
});

describe('toRefreshPayload', () => {
  it('omits the pickup address so the API re-resolves it from the profile', () => {
    const payload = toRefreshPayload(listing());

    expect(payload).not.toHaveProperty('pickupAddress');
    expect(payload.title).toBe('Cherry tomatoes');
    expect(payload.quantityTotal).toBe(10);
    expect(payload.unit).toBe('lb');
    expect(payload.availableStart).toBe('2026-08-01');
    expect(payload.availableEnd).toBe('2026-08-14');
    expect(payload.status).toBe('active');
  });

  it('keeps the pickup details a neighbor still needs', () => {
    const payload = toRefreshPayload(listing());

    expect(payload.pickupLocationText).toBe('Front porch');
    expect(payload.pickupNotes).toBe('Ring the bell');
    expect(payload.pickupDisclosurePolicy).toBe('after_confirmed');
    expect(payload.contactPref).toBe('app_message');
  });

  it('sends a custom crop by growerCropId and a catalog crop by cropId', () => {
    expect(toRefreshPayload(listing({ growerCropId: 'grower-crop-9' }))).toMatchObject({
      growerCropId: 'grower-crop-9',
    });
    expect(toRefreshPayload(listing({ growerCropId: 'grower-crop-9' }))).not.toHaveProperty(
      'cropId'
    );
    expect(toRefreshPayload(listing())).toMatchObject({ cropId: 'crop-1' });
  });

  it('leaves optional fields out rather than sending empty strings', () => {
    const payload = toRefreshPayload(
      listing({ pickupLocationText: null, pickupNotes: null, varietyId: null })
    );

    expect(payload).not.toHaveProperty('pickupLocationText');
    expect(payload).not.toHaveProperty('pickupNotes');
    expect(payload).not.toHaveProperty('varietyId');
  });
});
