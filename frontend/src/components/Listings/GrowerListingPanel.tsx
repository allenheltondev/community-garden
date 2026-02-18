import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createListing,
  getMyListing,
  listCatalogCrops,
  listCatalogVarieties,
  listMyListings,
  updateListing,
} from '../../services/api';
import type { Listing, UpsertListingRequest } from '../../types/listing';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ListingForm } from './ListingForm';
import { createLogger } from '../../utils/logging';

const logger = createLogger('grower-listings');

interface GrowerListingPanelProps {
  defaultLat?: number;
  defaultLng?: number;
}

export function GrowerListingPanel({ defaultLat, defaultLng }: GrowerListingPanelProps) {
  const queryClient = useQueryClient();
  const [isOffline, setIsOffline] = useState<boolean>(() => !navigator.onLine);
  const [selectedCropId, setSelectedCropId] = useState<string>('');
  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const cropsQuery = useQuery({
    queryKey: ['catalogCrops'],
    queryFn: listCatalogCrops,
    staleTime: 10 * 60 * 1000,
  });

  const listingsQuery = useQuery({
    queryKey: ['myListings'],
    queryFn: () => listMyListings(20, 0),
    staleTime: 30 * 1000,
  });

  const listingDetailQuery = useQuery({
    queryKey: ['myListing', editingListingId],
    queryFn: () => getMyListing(editingListingId ?? ''),
    enabled: !!editingListingId,
  });

  const varietiesQuery = useQuery({
    queryKey: ['catalogVarieties', selectedCropId],
    queryFn: () => listCatalogVarieties(selectedCropId),
    enabled: selectedCropId.length > 0,
  });

  const createMutation = useMutation({
    mutationFn: (request: UpsertListingRequest) => createListing(request),
  });

  const updateMutation = useMutation({
    mutationFn: ({ listingId, request }: { listingId: string; request: UpsertListingRequest }) =>
      updateListing(listingId, request),
  });

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

  const listings = listingsQuery.data?.items ?? [];

  const activeEditListing: Listing | null = useMemo(() => {
    if (!editingListingId) {
      return null;
    }

    if (listingDetailQuery.data) {
      return listingDetailQuery.data;
    }

    return listings.find((listing) => listing.id === editingListingId) ?? null;
  }, [editingListingId, listingDetailQuery.data, listings]);

  useEffect(() => {
    if (!activeEditListing) {
      return;
    }

    setSelectedCropId(activeEditListing.cropId);
  }, [activeEditListing]);

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const handleCreateMode = () => {
    setEditingListingId(null);
    setSelectedCropId('');
    setSubmitError(null);
    setSuccessMessage(null);
  };

  const handleEditMode = (listingId: string, cropId: string) => {
    setEditingListingId(listingId);
    setSelectedCropId(cropId);
    setSubmitError(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (request: UpsertListingRequest) => {
    setSubmitError(null);
    setSuccessMessage(null);

    try {
      if (editingListingId) {
        await updateMutation.mutateAsync({ listingId: editingListingId, request });
        setSuccessMessage('Listing updated.');
        logger.info('Listing updated', { listingId: editingListingId });
      } else {
        await createMutation.mutateAsync(request);
        setSuccessMessage('Listing posted.');
        logger.info('Listing created', { cropId: request.cropId });
      }

      await queryClient.invalidateQueries({ queryKey: ['myListings'] });

      if (!editingListingId) {
        setSelectedCropId('');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit listing';
      setSubmitError(message);
      logger.error('Listing submission failed', error as Error);
      throw error;
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4" padding="6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-neutral-900">
            {editingListingId ? 'Edit listing' : 'Create listing'}
          </h2>
          <p className="text-sm text-neutral-600">
            Fast mobile flow: title, crop, quantity, time window, and location.
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

        {successMessage && (
          <p className="rounded-base border border-success bg-primary-50 px-3 py-2 text-sm text-primary-800" role="status">
            {successMessage}
          </p>
        )}

        {!cropsQuery.isLoading && !cropsQuery.isError && (
          <ListingForm
            mode={editingListingId ? 'edit' : 'create'}
            crops={cropsQuery.data ?? []}
            varieties={varietiesQuery.data ?? []}
            isLoadingVarieties={varietiesQuery.isLoading}
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

      <Card className="space-y-3" padding="6">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-neutral-900">My recent listings</h3>
          <Button variant="ghost" size="sm" onClick={handleCreateMode}>
            New listing
          </Button>
        </div>

        {listingsQuery.isLoading && (
          <p className="text-sm text-neutral-600" role="status">Loading your listings...</p>
        )}

        {listingsQuery.isError && (
          <p className="rounded-base border border-error bg-red-50 px-3 py-2 text-sm text-error" role="alert">
            {listingsQuery.error instanceof Error
              ? listingsQuery.error.message
              : 'Failed to load your listings'}
          </p>
        )}

        {!listingsQuery.isLoading && listings.length === 0 && (
          <p className="text-sm text-neutral-600">No listings yet. Post your first one above.</p>
        )}

        {listings.map((listing) => (
          <div
            key={listing.id}
            className="rounded-base border border-neutral-200 bg-white px-3 py-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-neutral-900">{listing.title}</p>
                <p className="text-sm text-neutral-600">
                  {listing.quantityRemaining} {listing.unit} remaining
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleEditMode(listing.id, listing.cropId)}
              >
                Edit
              </Button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
