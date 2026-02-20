import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  createRequest,
  discoverListings,
  listCatalogCrops,
  updateRequest,
} from '../../services/api';
import type { Listing } from '../../types/listing';
import type { RequestItem, UpsertRequestPayload } from '../../types/request';
import { createLogger } from '../../utils/logging';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';

const logger = createLogger('searcher-requests');
const REQUEST_DRAFT_KEY = 'searcher-request-draft-v1';

interface RequestDraft {
  cropId: string;
  quantity: string;
  unit: string;
  neededByLocal: string;
  notes: string;
}

export interface SearcherRequestPanelProps {
  gathererGeoKey?: string;
  defaultLat?: number;
  defaultLng?: number;
  defaultRadiusMiles?: number;
}

function isFiniteCoordinate(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceInMiles(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return earthRadiusMiles * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function toDateTimeLocalValue(date: Date): string {
  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function createDefaultDraft(): RequestDraft {
  const nextDay = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return {
    cropId: '',
    quantity: '1',
    unit: '',
    neededByLocal: toDateTimeLocalValue(nextDay),
    notes: '',
  };
}

function loadRequestDraft(): RequestDraft {
  try {
    const serialized = window.localStorage.getItem(REQUEST_DRAFT_KEY);
    if (!serialized) {
      return createDefaultDraft();
    }

    const parsed = JSON.parse(serialized) as Partial<RequestDraft>;
    return {
      cropId: parsed.cropId ?? '',
      quantity: parsed.quantity ?? '1',
      unit: parsed.unit ?? '',
      neededByLocal: parsed.neededByLocal ?? createDefaultDraft().neededByLocal,
      notes: parsed.notes ?? '',
    };
  } catch {
    return createDefaultDraft();
  }
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export function SearcherRequestPanel({
  gathererGeoKey,
  defaultLat,
  defaultLng,
  defaultRadiusMiles = 15,
}: SearcherRequestPanelProps) {
  const [isOffline, setIsOffline] = useState<boolean>(() => !navigator.onLine);
  const [radiusMiles, setRadiusMiles] = useState<number>(defaultRadiusMiles);
  const [selectedCropId, setSelectedCropId] = useState<string>('all');
  const [selectedListingId, setSelectedListingId] = useState<string>('');
  const [draft, setDraft] = useState<RequestDraft>(() => loadRequestDraft());
  const [sessionRequests, setSessionRequests] = useState<RequestItem[]>([]);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(REQUEST_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Ignore localStorage write failures in restricted environments.
    }
  }, [draft]);

  const cropsQuery = useQuery({
    queryKey: ['catalogCrops'],
    queryFn: listCatalogCrops,
    staleTime: 10 * 60 * 1000,
  });

  const discoveryQuery = useQuery({
    queryKey: ['discoverListings', gathererGeoKey, radiusMiles],
    queryFn: () =>
      discoverListings({
        geoKey: gathererGeoKey ?? '',
        radiusMiles,
        limit: 30,
        offset: 0,
      }),
    enabled: Boolean(gathererGeoKey) && !isOffline,
    staleTime: 30 * 1000,
  });

  const createRequestMutation = useMutation({
    mutationFn: (payload: UpsertRequestPayload) => createRequest(payload),
  });

  const updateRequestMutation = useMutation({
    mutationFn: ({ requestId, payload }: { requestId: string; payload: UpsertRequestPayload }) =>
      updateRequest(requestId, payload),
  });

  const isSubmitting = createRequestMutation.isPending || updateRequestMutation.isPending;
  const listings = discoveryQuery.data?.items ?? [];

  const cropNameById = useMemo(() => {
    const byId = new Map<string, string>();
    for (const crop of cropsQuery.data ?? []) {
      byId.set(crop.id, crop.commonName);
    }
    return byId;
  }, [cropsQuery.data]);

  const filteredListings = useMemo(() => {
    if (selectedCropId === 'all') {
      return listings;
    }

    return listings.filter((listing) => listing.cropId === selectedCropId);
  }, [listings, selectedCropId]);

  const selectedListing = useMemo(
    () => filteredListings.find((listing) => listing.id === selectedListingId) ?? null,
    [filteredListings, selectedListingId]
  );

  const sortedListings = useMemo(() => {
    if (!isFiniteCoordinate(defaultLat) || !isFiniteCoordinate(defaultLng)) {
      return filteredListings;
    }

    return [...filteredListings].sort((left, right) => {
      const leftDistance = distanceInMiles(defaultLat, defaultLng, left.lat, left.lng);
      const rightDistance = distanceInMiles(defaultLat, defaultLng, right.lat, right.lng);
      return leftDistance - rightDistance;
    });
  }, [defaultLat, defaultLng, filteredListings]);

  const handleSelectListing = (listing: Listing) => {
    setSelectedListingId(listing.id);
    setDraft((previous) => ({
      ...previous,
      cropId: listing.cropId,
      unit: previous.unit || listing.unit,
    }));
    setSubmitError(null);
    setSuccessMessage(null);
  };

  const handleStartEditing = (request: RequestItem) => {
    setEditingRequestId(request.id);
    setSelectedListingId('');
    setDraft({
      cropId: request.cropId,
      quantity: request.quantity,
      unit: request.unit ?? '',
      neededByLocal: toDateTimeLocalValue(new Date(request.neededBy)),
      notes: request.notes ?? '',
    });
    setSubmitError(null);
    setSuccessMessage(null);
  };

  const handleCancelEdit = () => {
    setEditingRequestId(null);
    setSubmitError(null);
    setSuccessMessage(null);
    setDraft(createDefaultDraft());
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    setSuccessMessage(null);

    if (isOffline) {
      setSubmitError('You are offline. Reconnect to submit requests.');
      return;
    }

    const quantity = Number(draft.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setSubmitError('Quantity must be greater than 0.');
      return;
    }

    const neededByDate = new Date(draft.neededByLocal);
    if (Number.isNaN(neededByDate.getTime())) {
      setSubmitError('Needed by must be a valid date and time.');
      return;
    }

    const cropId = selectedListing?.cropId ?? draft.cropId;
    if (!cropId) {
      setSubmitError('Choose a listing or crop before submitting your request.');
      return;
    }

    const payload: UpsertRequestPayload = {
      cropId,
      varietyId: selectedListing?.varietyId ?? undefined,
      unit: draft.unit.trim() || selectedListing?.unit || undefined,
      quantity,
      neededBy: neededByDate.toISOString(),
      notes: draft.notes.trim() || undefined,
      status: 'open',
    };

    try {
      if (editingRequestId) {
        const updated = await updateRequestMutation.mutateAsync({ requestId: editingRequestId, payload });
        setSessionRequests((previous) =>
          previous.map((request) => (request.id === updated.id ? updated : request))
        );
        setSuccessMessage('Request updated.');
        logger.info('Request updated', { requestId: updated.id });
        setEditingRequestId(null);
      } else {
        const created = await createRequestMutation.mutateAsync(payload);
        setSessionRequests((previous) => [created, ...previous]);
        setSuccessMessage('Request submitted.');
        logger.info('Request created', { requestId: created.id, cropId: created.cropId });
      }

      setDraft(createDefaultDraft());
      setSelectedListingId('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit request';
      setSubmitError(message);
      logger.error('Request submission failed', error as Error);
    }
  };

  if (!gathererGeoKey) {
    return (
      <Card className="space-y-3" padding="6">
        <h3 className="text-lg font-semibold text-neutral-900">Search and request</h3>
        <p className="text-sm text-neutral-700">
          Add your location in onboarding to start discovering nearby listings.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4" padding="6">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-neutral-900">Find food near you</h3>
          <p className="text-sm text-neutral-600">
            Discovery uses your local geohash context so results stay nearby and practical.
          </p>
        </div>

        {isOffline && (
          <p className="rounded-base border border-warning bg-accent-50 px-3 py-2 text-sm text-neutral-800" role="status">
            You are offline. Cached content may still appear, but requests cannot be submitted.
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            label="Radius (miles)"
            type="text"
            value={String(radiusMiles)}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              if (Number.isFinite(nextValue) && nextValue > 0) {
                setRadiusMiles(nextValue);
              }
            }}
          />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-neutral-700" htmlFor="searcher-crop-filter">
              Crop filter
            </label>
            <select
              id="searcher-crop-filter"
              value={selectedCropId}
              onChange={(event) => setSelectedCropId(event.target.value)}
              className="w-full rounded-base border-2 border-neutral-300 bg-white px-3 py-2 text-base text-neutral-800"
            >
              <option value="all">All crops</option>
              {(cropsQuery.data ?? []).map((crop) => (
                <option key={crop.id} value={crop.id}>
                  {crop.commonName}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <Button
              variant="outline"
              fullWidth
              onClick={() => discoveryQuery.refetch()}
              disabled={isOffline || discoveryQuery.isFetching}
            >
              Refresh Listings
            </Button>
          </div>
        </div>
      </Card>

      <Card className="space-y-4" padding="6">
        <div className="space-y-1">
          <h4 className="text-base font-semibold text-neutral-900">Available listings</h4>
          <p className="text-sm text-neutral-600">
            Select a listing to prefill your request form.
          </p>
        </div>

        {discoveryQuery.isLoading && (
          <p className="text-sm text-neutral-600" role="status">Loading listings...</p>
        )}

        {discoveryQuery.isError && (
          <p className="rounded-base border border-error bg-red-50 px-3 py-2 text-sm text-error" role="alert">
            {discoveryQuery.error instanceof Error ? discoveryQuery.error.message : 'Failed to load listings'}
          </p>
        )}

        {!discoveryQuery.isLoading && !discoveryQuery.isError && sortedListings.length === 0 && (
          <p className="text-sm text-neutral-600">No listings found in this area yet. Try a wider radius.</p>
        )}

        {sortedListings.map((listing) => {
          const canShowDistance = isFiniteCoordinate(defaultLat) && isFiniteCoordinate(defaultLng);
          const distanceLabel = canShowDistance
            ? `${distanceInMiles(defaultLat, defaultLng, listing.lat, listing.lng).toFixed(1)} mi away`
            : null;

          return (
            <div
              key={listing.id}
              className={`rounded-base border px-3 py-3 ${
                selectedListingId === listing.id
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-neutral-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-medium text-neutral-900">{listing.title || 'Untitled listing'}</p>
                  <p className="text-sm text-neutral-700">
                    {listing.quantityRemaining} {listing.unit} available
                  </p>
                  <p className="text-xs text-neutral-600">
                    Crop: {cropNameById.get(listing.cropId) ?? listing.cropId}
                  </p>
                  {distanceLabel && <p className="text-xs text-neutral-500">{distanceLabel}</p>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleSelectListing(listing)}>
                  Request this item
                </Button>
              </div>
            </div>
          );
        })}
      </Card>

      <Card className="space-y-4" padding="6">
        <div className="space-y-1">
          <h4 className="text-base font-semibold text-neutral-900">
            {editingRequestId ? 'Edit request' : 'Create request'}
          </h4>
          <p className="text-sm text-neutral-600">
            Submit a request with quantity and needed-by timing in one step.
          </p>
        </div>

        {selectedListing && (
          <p className="rounded-base border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-800" role="status">
            Requesting from: {selectedListing.title || 'Untitled listing'}
          </p>
        )}

        {successMessage && (
          <p className="rounded-base border border-success bg-primary-50 px-3 py-2 text-sm text-primary-800" role="status">
            {successMessage}
          </p>
        )}

        {submitError && (
          <p className="rounded-base border border-error bg-red-50 px-3 py-2 text-sm text-error" role="alert">
            {submitError}
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-sm font-medium text-neutral-700" htmlFor="request-crop-id">
              Crop
            </label>
            <select
              id="request-crop-id"
              value={selectedListing ? selectedListing.cropId : draft.cropId}
              onChange={(event) => {
                setSelectedListingId('');
                setDraft((previous) => ({ ...previous, cropId: event.target.value }));
              }}
              className="w-full rounded-base border-2 border-neutral-300 bg-white px-3 py-2 text-base text-neutral-800"
            >
              <option value="">Select crop</option>
              {(cropsQuery.data ?? []).map((crop) => (
                <option key={crop.id} value={crop.id}>
                  {crop.commonName}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Quantity"
            type="text"
            value={draft.quantity}
            onChange={(event) => setDraft((previous) => ({ ...previous, quantity: event.target.value }))}
          />

          <Input
            label="Unit"
            type="text"
            value={draft.unit}
            onChange={(event) => setDraft((previous) => ({ ...previous, unit: event.target.value }))}
            placeholder="lb, bunch, box"
          />

          <div className="sm:col-span-2 flex flex-col gap-1">
            <label className="text-sm font-medium text-neutral-700" htmlFor="request-needed-by">
              Needed by
            </label>
            <input
              id="request-needed-by"
              type="datetime-local"
              value={draft.neededByLocal}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, neededByLocal: event.target.value }))
              }
              className="w-full rounded-base border-2 border-neutral-300 bg-white px-3 py-2 text-base text-neutral-800"
            />
          </div>

          <div className="sm:col-span-2 flex flex-col gap-1">
            <label className="text-sm font-medium text-neutral-700" htmlFor="request-notes">
              Notes (optional)
            </label>
            <textarea
              id="request-notes"
              value={draft.notes}
              onChange={(event) => setDraft((previous) => ({ ...previous, notes: event.target.value }))}
              rows={3}
              className="w-full rounded-base border-2 border-neutral-300 bg-white px-3 py-2 text-base text-neutral-800"
              placeholder="Pickup windows, organization context, or constraints"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={handleSubmit} loading={isSubmitting} fullWidth>
            {editingRequestId ? 'Update Request' : 'Create Request'}
          </Button>
          {editingRequestId && (
            <Button variant="ghost" onClick={handleCancelEdit} fullWidth>
              Cancel Edit
            </Button>
          )}
        </div>
      </Card>

      <Card className="space-y-3" padding="6">
        <h4 className="text-base font-semibold text-neutral-900">Requests this session</h4>

        {sessionRequests.length === 0 && (
          <p className="text-sm text-neutral-600">No requests submitted in this session yet.</p>
        )}

        {sessionRequests.map((request) => (
          <div key={request.id} className="rounded-base border border-neutral-200 bg-white px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="font-medium text-neutral-900">
                  {cropNameById.get(request.cropId) ?? request.cropId}
                </p>
                <p className="text-sm text-neutral-700">
                  {request.quantity} {request.unit ?? ''} needed by {formatDateTime(request.neededBy)}
                </p>
                <p className="text-xs text-neutral-600">Status: {request.status}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleStartEditing(request)}>
                Edit request
              </Button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

export default SearcherRequestPanel;
