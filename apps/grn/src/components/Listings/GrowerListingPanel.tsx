import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  createListing,
  getMyListing,
  listCatalogCrops,
  listCatalogVarieties,
  listMyCrops,
  listMyListings,
  updateListing,
} from '../../services/api';
import { createClaim, listClaims, updateClaimStatus } from '../../services/claims';
import type { Listing, UpsertListingRequest } from '../../types/listing';
import type { Claim, ClaimStatus } from '../../types/claim';
import { Button, Card } from '@olivias/ui';
import { ListingForm, type ListingQuickPickOption } from './ListingForm';
import { createLogger } from '../../utils/logging';
import { completeTodayAction } from '../../utils/todayActionTracking';
import { ClaimStatusList } from './ClaimStatusList';
import {
  loadSessionClaims,
  saveSessionClaims,
  upsertSessionClaim,
} from '../../utils/claimSession';
import {
  enqueueTransitionClaimAction,
  hasQueuedClaimActions,
  replayQueuedClaimActions,
  type ProcessedQueuedClaimAction,
} from '../../utils/claimOfflineQueue';

const logger = createLogger('grower-listings');

type ShareView = 'create' | 'hub';
type ShareFilter = 'current' | 'completed' | 'ended' | 'all';

interface GrowerListingPanelProps {
  viewerUserId?: string;
  defaultLat?: number;
  defaultLng?: number;
}

const quickPickRank: Record<string, number> = {
  growing: 0,
  planning: 1,
  interested: 2,
  paused: 3,
};

const statusStyles: Record<string, string> = {
  active: 'border-success bg-primary-50 text-primary-800',
  pending: 'border-warning bg-accent-50 text-neutral-800',
  claimed: 'border-neutral-300 bg-neutral-100 text-neutral-800',
  scheduled: 'border-success bg-primary-50 text-primary-800',
  expired: 'border-neutral-300 bg-neutral-100 text-neutral-700',
  completed: 'border-neutral-300 bg-neutral-100 text-neutral-700',
};

const filterOptions: Array<{ value: ShareFilter; label: string }> = [
  { value: 'current', label: 'Current' },
  { value: 'completed', label: 'Completed' },
  { value: 'ended', label: 'Ended' },
  { value: 'all', label: 'All' },
];

const listingStatusLabels: Record<string, string> = {
  pending: 'Not shared yet',
  active: 'Available now',
  claimed: 'Fully claimed',
  scheduled: 'Pickup scheduled',
  completed: 'Share completed',
  expired: 'Availability ended',
};

function formatStatus(status: string): string {
  return listingStatusLabels[status] ?? 'Status unavailable';
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown';
  }

  return parsed.toLocaleString();
}

function getGrowerActions(status: ClaimStatus): ClaimStatus[] {
  if (status === 'pending') {
    return ['confirmed', 'cancelled'];
  }

  if (status === 'confirmed') {
    return ['completed', 'cancelled'];
  }

  return [];
}

function newShareIdempotencyKey(): string {
  return `share-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function displayListingStatus(listing: Listing, claims: Claim[]): string {
  if (listing.status === 'expired' || listing.status === 'completed') {
    return listing.status;
  }
  if (claims.some((claim) => claim.status === 'confirmed')) {
    return 'scheduled';
  }
  if (
    claims.length > 0 &&
    claims.every((claim) => claim.status === 'completed' || claim.status === 'cancelled') &&
    claims.some((claim) => claim.status === 'completed')
  ) {
    return 'completed';
  }
  return listing.status;
}

function listingNextAction(status: string, claims: Claim[]): string {
  if (claims.some((claim) => claim.status === 'pending')) {
    return 'Next: review the pickup request.';
  }
  if (claims.some((claim) => claim.status === 'confirmed')) {
    return 'Next: coordinate pickup, then mark the food picked up.';
  }
  if (status === 'active') {
    return 'Neighbors can see this now. No action is needed until someone requests pickup.';
  }
  if (status === 'expired') {
    return 'This is no longer visible as available food.';
  }
  if (status === 'completed') {
    return 'Pickup is complete. This result is visible only in your impact summary.';
  }
  return 'Open the offer to review its pickup status.';
}

function applyProcessedQueuedClaims(
  existingClaims: Claim[],
  processedActions: ProcessedQueuedClaimAction[]
): Claim[] {
  let next = [...existingClaims];

  for (const action of processedActions) {
    if (action.replaceClaimId && action.replaceClaimId !== action.claim.id) {
      next = next.filter((claim) => claim.id !== action.replaceClaimId);
    }

    next = upsertSessionClaim(next, action.claim);
  }

  return next;
}

function ListingStatusChip({ status }: { status: string }) {
  const tone = statusStyles[status] ?? 'border-neutral-300 bg-neutral-100 text-neutral-800';

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>
      {formatStatus(status)}
    </span>
  );
}

function ListingDetails({ listing, claims }: { listing: Listing; claims: Claim[] }) {
  const displayStatus = displayListingStatus(listing, claims);
  return (
    <div className="rounded-base border border-neutral-200 bg-white px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-base font-semibold text-neutral-900">Food to share details</h4>
        <ListingStatusChip status={displayStatus} />
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-2 text-sm text-neutral-700">
        <div>
          <dt className="font-medium text-neutral-900">Food</dt>
          <dd>{listing.title}</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-900">Quantity remaining</dt>
          <dd>{listing.quantityRemaining} {listing.unit}</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-900">Pickup window</dt>
          <dd>{formatDateTime(listing.availableStart)} to {formatDateTime(listing.availableEnd)}</dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-900">Pickup location</dt>
          <dd>{listing.pickupLocationText ?? 'Not provided'}</dd>
        </div>
      </dl>
      <p className="mt-3 rounded-base bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-800">
        {listingNextAction(displayStatus, claims)}
      </p>
    </div>
  );
}

export function GrowerListingPanel({ viewerUserId, defaultLat, defaultLng }: GrowerListingPanelProps) {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const linkedListingId = searchParams.get('listing');
  const linkedClaimId = searchParams.get('claim');
  const linkedCropId = searchParams.get('crop');
  const linkedHarvestId = searchParams.get('harvest');
  const linkedQuantity = searchParams.get('quantity');
  const linkedUnit = searchParams.get('unit');
  const createIdempotencyKey = useRef(newShareIdempotencyKey());
  const [isOffline, setIsOffline] = useState<boolean>(() => !navigator.onLine);
  const [selectedCropId, setSelectedCropId] = useState<string>('');
  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ShareView>(() =>
    linkedCropId ? 'create' : 'hub'
  );
  const [shareFilter, setShareFilter] = useState<ShareFilter>('current');
  const [selectedListingId, setSelectedListingId] = useState<string | null>(linkedListingId);
  const [sessionClaims, setSessionClaims] = useState<Claim[]>(() => loadSessionClaims(viewerUserId));
  const [claimSuccessMessage, setClaimSuccessMessage] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [transitioningClaimIds, setTransitioningClaimIds] = useState<string[]>([]);
  const [isReplayingClaimQueue, setIsReplayingClaimQueue] = useState<boolean>(false);

  const replayClaimQueue = useCallback(async () => {
    if (isOffline || isReplayingClaimQueue) {
      return;
    }

    if (!hasQueuedClaimActions(viewerUserId)) {
      return;
    }

    setIsReplayingClaimQueue(true);

    try {
      const result = await replayQueuedClaimActions({
        viewerUserId,
        createClaimHandler: createClaim,
        transitionClaimHandler: updateClaimStatus,
      });

      if (result.processed.length > 0) {
        setSessionClaims((current) => applyProcessedQueuedClaims(current, result.processed));
        setClaimSuccessMessage(
          `Synced ${result.processed.length} saved pickup update${result.processed.length === 1 ? '' : 's'}.`
        );
      }

      if (result.failed.length > 0) {
        setClaimError('Some offline pickup updates are still saved. They will retry when you reconnect.');
      }
    } finally {
      setIsReplayingClaimQueue(false);
    }
  }, [isOffline, isReplayingClaimQueue, viewerUserId]);

  const cropsQuery = useQuery({
    queryKey: ['catalogCrops'],
    queryFn: listCatalogCrops,
    staleTime: 10 * 60 * 1000,
  });

  const growerCropsQuery = useQuery({
    queryKey: ['myCrops'],
    queryFn: listMyCrops,
    staleTime: 5 * 60 * 1000,
  });

  const myListingsQuery = useQuery({
    queryKey: ['myListings'],
    queryFn: () => listMyListings(50, 0),
    staleTime: 30 * 1000,
  });

  const editListingQuery = useQuery({
    queryKey: ['myListing', editingListingId],
    queryFn: () => getMyListing(editingListingId ?? ''),
    enabled: !!editingListingId,
  });

  const detailListingQuery = useQuery({
    queryKey: ['myListingDetail', selectedListingId],
    queryFn: () => getMyListing(selectedListingId ?? ''),
    enabled: !!selectedListingId,
  });

  const allClaimsQuery = useQuery({
    queryKey: ['claims', 'share-hub'],
    queryFn: () => listClaims({ limit: 50 }),
    staleTime: 30 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: ({
      request,
      idempotencyKey,
    }: {
      request: UpsertListingRequest;
      idempotencyKey: string;
    }) => createListing(request, idempotencyKey),
  });

  const updateMutation = useMutation({
    mutationFn: ({ listingId, request }: { listingId: string; request: UpsertListingRequest }) =>
      updateListing(listingId, request),
  });

  const transitionClaimMutation = useMutation({
    mutationFn: ({ claimId, status }: { claimId: string; status: ClaimStatus }) =>
      updateClaimStatus(claimId, { status }),
  });

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      setIsOffline(false);
      void replayClaimQueue();
    };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [replayClaimQueue]);

  useEffect(() => {
    saveSessionClaims(sessionClaims, viewerUserId);
  }, [sessionClaims, viewerUserId]);

  useEffect(() => {
    if (!linkedListingId) return;
    setActiveView('hub');
    setSelectedListingId(linkedListingId);
  }, [linkedListingId]);

  useEffect(() => {
    void replayClaimQueue();
  }, [replayClaimQueue]);

  const activeEditListing: Listing | null = useMemo(() => {
    if (!editingListingId) {
      return null;
    }

    if (editListingQuery.data) {
      return editListingQuery.data;
    }

    return myListingsQuery.data?.items.find((listing) => listing.id === editingListingId) ?? null;
  }, [editingListingId, editListingQuery.data, myListingsQuery.data?.items]);

  const isEditingListingLoading =
    editingListingId !== null && editListingQuery.isLoading && activeEditListing === null;

  const linkedGrowerCrop = growerCropsQuery.data?.find(
    (crop) => crop.id === linkedCropId
  );
  const varietiesCropId =
    selectedCropId || linkedGrowerCrop?.canonicalId || activeEditListing?.cropId || '';

  const varietiesQuery = useQuery({
    queryKey: ['catalogVarieties', varietiesCropId],
    queryFn: () => listCatalogVarieties(varietiesCropId),
    enabled: varietiesCropId.length > 0,
  });

  const listingFormKey = useMemo(() => {
    if (!activeEditListing) {
      return [
        'create',
        linkedCropId ?? '',
        linkedHarvestId ?? '',
        linkedQuantity ?? '',
        linkedUnit ?? '',
        defaultLat ?? '',
        defaultLng ?? '',
      ].join(':');
    }

    return [
      'edit',
      activeEditListing.id,
      activeEditListing.title,
      activeEditListing.cropId,
      activeEditListing.varietyId ?? '',
      activeEditListing.quantityTotal,
      activeEditListing.unit,
      activeEditListing.availableStart,
      activeEditListing.availableEnd,
      activeEditListing.lat,
      activeEditListing.lng,
      activeEditListing.pickupLocationText ?? '',
      activeEditListing.pickupNotes ?? '',
    ].join(':');
  }, [
    activeEditListing,
    defaultLat,
    defaultLng,
    linkedCropId,
    linkedHarvestId,
    linkedQuantity,
    linkedUnit,
  ]);

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const pendingClaimIds = useMemo(() => new Set(transitioningClaimIds), [transitioningClaimIds]);

  const cropNameById = useMemo(() => {
    const byId = new Map<string, string>();
    for (const crop of cropsQuery.data ?? []) {
      byId.set(crop.id, crop.commonName);
    }
    return byId;
  }, [cropsQuery.data]);

  const quickPickOptions = useMemo<ListingQuickPickOption[]>(() => {
    const items = growerCropsQuery.data ?? [];

    return [...items]
      .sort((left, right) => {
        const leftRank = quickPickRank[left.status] ?? 99;
        const rightRank = quickPickRank[right.status] ?? 99;
        return leftRank - rightRank;
      })
      .map((item) => {
        // Use catalog name if available, otherwise use the stored crop name
        const cropName = item.canonicalId ? (cropNameById.get(item.canonicalId) ?? 'Unknown crop') : item.cropName;
        const baseTitle = item.nickname?.trim() || cropName;
        const statusTag = item.status === 'growing' ? '' : ` (${item.status})`;

        return {
          id: item.id,
          label: `${baseTitle}${statusTag}`,
          cropId: item.canonicalId || '',  // Empty string for user-defined crops
          growerCropId: item.id,  // Include the grower crop library ID
          varietyId: item.varietyId ?? undefined,
          defaultUnit: item.defaultUnit ?? undefined,
          suggestedTitle: baseTitle,
        };
      });
  }, [growerCropsQuery.data, cropNameById]);

  const handleCreateMode = () => {
    setEditingListingId(null);
    setSelectedCropId('');
    setSubmitError(null);
    setSuccessMessage(null);
    setSelectedListingId(null);
    setActiveView('create');
  };

  const handleEditMode = (listingId: string, cropId: string) => {
    setEditingListingId(listingId);
    setSelectedCropId(cropId);
    setSubmitError(null);
    setSuccessMessage(null);
    setSelectedListingId(null);
    setActiveView('create');
  };

  const handleViewChange = (view: ShareView) => {
    setActiveView(view);
    setSelectedListingId(null);

    if (view !== 'create') {
      setEditingListingId(null);
      setSubmitError(null);
      setSuccessMessage(null);
    }
  };

  const handleSubmit = async (request: UpsertListingRequest) => {
    setSubmitError(null);
    setSuccessMessage(null);

    try {
      if (editingListingId) {
        const updated = await updateMutation.mutateAsync({
          listingId: editingListingId,
          request,
        });
        setSuccessMessage('Food offer updated.');
        setSelectedListingId(updated.id);
        logger.info('Food offer updated', { listingId: editingListingId });
      } else {
        const created = await createMutation.mutateAsync({
          request,
          idempotencyKey: createIdempotencyKey.current,
        });
        createIdempotencyKey.current = newShareIdempotencyKey();
        setSuccessMessage('Your food is now available to nearby neighbors.');
        setSelectedListingId(created.id);
        completeTodayAction('share');
        logger.info('Food offer created', { cropId: request.cropId });
      }

      await queryClient.invalidateQueries({ queryKey: ['myListings'] });
      setActiveView('hub');
      setEditingListingId(null);

      if (!editingListingId) {
        setSelectedCropId('');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to share this food';
      setSubmitError(message);
      logger.error('Food sharing failed', error as Error);
      throw error;
    }
  };

  const selectedListing = detailListingQuery.data ?? null;

  const visibleClaims = useMemo(() => {
    const combinedClaims = new Map(
      (allClaimsQuery.data?.items ?? []).map((claim) => [claim.id, claim])
    );
    for (const claim of sessionClaims) {
      combinedClaims.set(claim.id, claim);
    }
    return [...combinedClaims.values()].filter((claim) =>
      viewerUserId ? claim.listingOwnerId === viewerUserId : true
    );
  }, [allClaimsQuery.data?.items, sessionClaims, viewerUserId]);

  const claimsByListingId = useMemo(() => {
    const claims = new Map<string, Claim[]>();
    for (const claim of visibleClaims) {
      claims.set(claim.listingId, [...(claims.get(claim.listingId) ?? []), claim]);
    }
    return claims;
  }, [visibleClaims]);

  const claimsForSelectedListing = selectedListing
    ? claimsByListingId.get(selectedListing.id) ?? []
    : [];

  const hubListings = useMemo(() => {
    const listings = myListingsQuery.data?.items ?? [];
    if (shareFilter === 'all') return listings;
    return listings.filter((listing) => {
      const status = displayListingStatus(
        listing,
        claimsByListingId.get(listing.id) ?? []
      );
      if (shareFilter === 'completed') return status === 'completed';
      if (shareFilter === 'ended') return status === 'expired';
      return status !== 'completed' && status !== 'expired';
    });
  }, [claimsByListingId, myListingsQuery.data?.items, shareFilter]);

  const completedClaims = visibleClaims.filter((claim) => claim.status === 'completed');

  const handleClaimTransition = async (claimId: string, status: ClaimStatus) => {
    setClaimError(null);
    setClaimSuccessMessage(null);

    let didStart = false;
    setTransitioningClaimIds((current) => {
      if (current.includes(claimId)) {
        return current;
      }

      didStart = true;
      return [...current, claimId];
    });

    if (!didStart) {
      return;
    }

    const previousClaim = claimsForSelectedListing.find((claim) => claim.id === claimId) ?? null;
    if (previousClaim) {
      setSessionClaims((current) => upsertSessionClaim(current, { ...previousClaim, status }));
    }

    try {
      if (isOffline) {
        enqueueTransitionClaimAction(claimId, { status }, viewerUserId);
        setClaimSuccessMessage('You are offline. This pickup update is saved and will sync when you reconnect.');
        return;
      }

      const updated = await transitionClaimMutation.mutateAsync({ claimId, status });
      setSessionClaims((current) => upsertSessionClaim(current, updated));
      void queryClient.invalidateQueries({ queryKey: ['claims'] });
      completeTodayAction('claim');
      setClaimSuccessMessage('Pickup updated.');
      logger.info('Claim updated', { claimId: updated.id, status: updated.status });
    } catch (error) {
      if (previousClaim) {
        setSessionClaims((current) => upsertSessionClaim(current, previousClaim));
      }

      const message = error instanceof Error ? error.message : 'Failed to update pickup';
      setClaimError(message);
      logger.error('Claim transition failed', error as Error);
    } finally {
      setTransitioningClaimIds((current) => current.filter((id) => id !== claimId));
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3" padding="4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Share workspace views">
          <Button
            size="sm"
            variant={activeView === 'hub' ? 'primary' : 'ghost'}
            role="tab"
            aria-selected={activeView === 'hub'}
            onClick={() => handleViewChange('hub')}
          >
            Food to share & pickups
          </Button>
          <Button
            size="sm"
            variant={activeView === 'create' ? 'primary' : 'ghost'}
            role="tab"
            aria-selected={activeView === 'create'}
            onClick={() => handleViewChange('create')}
          >
            Share food
          </Button>
        </div>
      </Card>

      {activeView === 'create' && (
        <Card className="space-y-4" padding="6">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-neutral-900">
              {editingListingId ? 'Edit food offer' : 'Share food'}
            </h2>
            <p className="text-sm text-neutral-600">
              Choose what is available, review the pickup details, then confirm when you are ready.
            </p>
          </div>

          {cropsQuery.isLoading && (
            <p className="text-sm text-neutral-600" role="status">Loading crops...</p>
          )}

          {cropsQuery.isError && (
            <p className="rounded-base border border-error bg-red-50 px-3 py-2 text-sm text-error" role="alert">
              {cropsQuery.error instanceof Error ? cropsQuery.error.message : 'Failed to load crops'}
            </p>
          )}

          {growerCropsQuery.isError && (
            <p className="rounded-base border border-warning bg-accent-50 px-3 py-2 text-sm text-neutral-800" role="status">
              Could not load your crop library. You can still fill the draft manually.
            </p>
          )}

          {successMessage && (
            <p className="rounded-base border border-success bg-primary-50 px-3 py-2 text-sm text-primary-800" role="status">
              {successMessage}
            </p>
          )}

          {isEditingListingLoading && (
            <p className="text-sm text-neutral-600" role="status">Loading food offer...</p>
          )}

          {linkedCropId &&
          !growerCropsQuery.isLoading &&
          !growerCropsQuery.isError &&
          !quickPickOptions.some((option) => option.id === linkedCropId) ? (
            <p className="rounded-base border border-warning bg-accent-50 px-3 py-2 text-sm text-neutral-800" role="alert">
              We could not find that garden crop. Choose another crop before sharing.
            </p>
          ) : null}

          {!cropsQuery.isLoading &&
            !cropsQuery.isError &&
            !isEditingListingLoading &&
            (!linkedCropId || !growerCropsQuery.isLoading) && (
            <ListingForm
              key={listingFormKey}
              mode={editingListingId ? 'edit' : 'create'}
              crops={cropsQuery.data ?? []}
              varieties={varietiesQuery.data ?? []}
              quickPickOptions={quickPickOptions}
              isLoadingVarieties={varietiesQuery.isLoading}
              isLoadingQuickPicks={growerCropsQuery.isLoading}
              prefill={
                editingListingId
                  ? undefined
                  : {
                      quickPickId: linkedCropId,
                      quantity: linkedQuantity,
                      unit: linkedUnit,
                      sourceLabel: linkedHarvestId
                        ? 'your saved harvest'
                        : linkedCropId
                          ? 'your garden crop'
                          : null,
                    }
              }
              initialListing={activeEditListing}
              defaultLat={defaultLat}
              defaultLng={defaultLng}
              isSubmitting={isSubmitting}
              isOffline={isOffline}
              submitError={submitError}
              onCropChange={setSelectedCropId}
              onSubmit={handleSubmit}
              onCancelEdit={editingListingId ? handleCreateMode : undefined}
            />
          )}
        </Card>
      )}

      {activeView === 'hub' && (
        <Card className="space-y-4" padding="6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-neutral-900">Food to share & pickups</h3>
              <p className="text-sm text-neutral-600">
                See what neighbors can find, review pickup requests, and finish each share in one place.
              </p>
            </div>
            <Button variant="primary" onClick={handleCreateMode}>
              Share food
            </Button>
          </div>

          {successMessage ? (
            <p className="rounded-base border border-success bg-primary-50 px-3 py-2 text-sm text-primary-800" role="status">
              {successMessage}
            </p>
          ) : null}

          <div className="rounded-base border border-primary-200 bg-primary-50 px-4 py-3">
            <p className="text-sm font-semibold text-primary-900">Your private impact</p>
            <p className="mt-1 text-sm text-primary-800">
              {completedClaims.length === 0
                ? 'Completed pickups will appear here for you only.'
                : `${completedClaims.length} neighbor pickup${completedClaims.length === 1 ? '' : 's'} completed. Thank you for helping food reach someone nearby.`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2" aria-label="Food sharing status filters">
            {filterOptions.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={shareFilter === option.value ? 'outline' : 'ghost'}
                aria-pressed={shareFilter === option.value}
                onClick={() => {
                  setShareFilter(option.value);
                  setSelectedListingId(null);
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>

          {myListingsQuery.isLoading && (
            <p className="text-sm text-neutral-600" role="status">Loading food to share...</p>
          )}

          {myListingsQuery.isError && (
            <p className="rounded-base border border-error bg-red-50 px-3 py-2 text-sm text-error" role="alert">
              {myListingsQuery.error instanceof Error
                ? myListingsQuery.error.message
                : 'Failed to load food to share'}
            </p>
          )}

          {!myListingsQuery.isLoading && !myListingsQuery.isError && hubListings.length === 0 && (
            <p className="text-sm text-neutral-600">
              No food offers match this view. Share food when you have something extra.
            </p>
          )}

          {hubListings.map((listing) => {
            const listingClaims = claimsByListingId.get(listing.id) ?? [];
            const displayStatus = displayListingStatus(listing, listingClaims);
            return (
              <div
                key={listing.id}
                className="rounded-base border border-neutral-200 bg-white px-3 py-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="font-medium text-neutral-900">{listing.title}</p>
                    <p className="text-sm text-neutral-600">
                      {listing.quantityRemaining} {listing.unit} available
                    </p>
                    <ListingStatusChip status={displayStatus} />
                    <p className="text-sm text-neutral-700">
                      {listingNextAction(displayStatus, listingClaims)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedListingId(listing.id)}
                    >
                      Pickup details
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditMode(listing.id, listing.cropId)}
                    >
                      Edit offer
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {selectedListingId && detailListingQuery.isLoading && (
            <p className="text-sm text-neutral-600" role="status">Loading pickup details...</p>
          )}

          {selectedListingId && detailListingQuery.isError && (
            <p className="rounded-base border border-error bg-red-50 px-3 py-2 text-sm text-error" role="alert">
              {detailListingQuery.error instanceof Error
                ? detailListingQuery.error.message
                : 'Failed to load pickup details'}
            </p>
          )}

          {selectedListing && (
            <>
              <ListingDetails listing={selectedListing} claims={claimsForSelectedListing} />
              <ClaimStatusList
                title="Pickup coordination"
                description="The next available action matches the pickup's current state."
                claims={claimsForSelectedListing}
                pendingClaimIds={pendingClaimIds}
                successMessage={claimSuccessMessage}
                errorMessage={claimError}
                emptyMessage={
                  allClaimsQuery.isLoading
                    ? 'Loading pickup requests...'
                    : 'No pickup requests for this food yet.'
                }
                getActions={(claim) => getGrowerActions(claim.status)}
                onTransition={handleClaimTransition}
                highlightedClaimId={linkedClaimId}
              />
            </>
          )}
        </Card>
      )}
    </div>
  );
}
