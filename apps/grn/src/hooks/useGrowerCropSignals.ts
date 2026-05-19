import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDerivedFeed, getMe, listMyCrops } from '../services/api';
import type { DerivedFeedSignal } from '../types/feed';

const TOP_SCARCE_LIMIT = 4;
const MIN_SCARCITY_TO_HIGHLIGHT = 0.5;

export interface ScarceCropEntry {
  cropId: string;
  scarcityScore: number;
  requestCount: number;
  listingCount: number;
}

export interface GrowerCropSignals {
  geoKey: string | null;
  scarcityByCropId: Map<string, number>;
  scarceCropIds: Set<string>;
  topScarce: ScarceCropEntry[];
  growingCatalogCropIds: Set<string>;
  isLoading: boolean;
  isError: boolean;
}

export function useGrowerCropSignals(): GrowerCropSignals {
  const profileQuery = useQuery({
    queryKey: ['userProfile'],
    queryFn: getMe,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  const isGrower = profileQuery.data?.userType === 'grower';
  const geoKey = isGrower ? profileQuery.data?.growerProfile?.geoKey ?? null : null;

  const feedQuery = useQuery({
    queryKey: ['growerDerivedFeed', geoKey, 7],
    queryFn: () =>
      getDerivedFeed({ geoKey: geoKey ?? '', windowDays: 7, limit: 1, offset: 0 }),
    enabled: Boolean(geoKey),
    staleTime: 60 * 1000,
  });

  const myCropsQuery = useQuery({
    queryKey: ['myCrops'],
    queryFn: listMyCrops,
    enabled: isGrower,
    staleTime: 60 * 1000,
  });

  const cropSignals = useMemo<DerivedFeedSignal[]>(
    () => (feedQuery.data?.signals ?? []).filter((signal) => Boolean(signal.cropId)),
    [feedQuery.data?.signals]
  );

  const topScarce = useMemo<ScarceCropEntry[]>(() => {
    const ranked = [...cropSignals]
      .filter((signal) => signal.scarcityScore >= MIN_SCARCITY_TO_HIGHLIGHT)
      .sort((left, right) => right.scarcityScore - left.scarcityScore)
      .slice(0, TOP_SCARCE_LIMIT);

    return ranked
      .map((signal) =>
        signal.cropId
          ? {
              cropId: signal.cropId,
              scarcityScore: signal.scarcityScore,
              requestCount: signal.requestCount,
              listingCount: signal.listingCount,
            }
          : null
      )
      .filter((entry): entry is ScarceCropEntry => entry !== null);
  }, [cropSignals]);

  const scarcityByCropId = useMemo(() => {
    const map = new Map<string, number>();
    for (const signal of cropSignals) {
      if (!signal.cropId) continue;
      const existing = map.get(signal.cropId);
      if (existing === undefined || signal.scarcityScore > existing) {
        map.set(signal.cropId, signal.scarcityScore);
      }
    }
    return map;
  }, [cropSignals]);

  const scarceCropIds = useMemo(
    () => new Set(topScarce.map((entry) => entry.cropId)),
    [topScarce]
  );

  const growingCatalogCropIds = useMemo(() => {
    const ids = new Set<string>();
    for (const crop of myCropsQuery.data ?? []) {
      if (crop.canonicalId) {
        ids.add(crop.canonicalId);
      }
    }
    return ids;
  }, [myCropsQuery.data]);

  return {
    geoKey,
    scarcityByCropId,
    scarceCropIds,
    topScarce,
    growingCatalogCropIds,
    isLoading: profileQuery.isLoading || feedQuery.isLoading,
    isError: feedQuery.isError,
  };
}
