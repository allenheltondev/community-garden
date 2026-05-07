import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createMyBed,
  deleteMyBed,
  getMyGardenCanvas,
  listMyBeds,
  listMyCrops,
  requestBackgroundUploadUrl,
  updateMyBed,
  updateMyGardenCanvas,
  type UpsertGardenBedRequest,
  type UpsertGardenCanvasRequest,
} from '../services/api';
import type {
  BedPolygonPoint,
  BedType,
  GardenBed,
  GardenCanvas,
  GrowerCropItem,
} from '../types/listing';
import {
  defaultRectPolygonPoints,
  defaultsFor,
} from '../components/GardenDesigner/bedDefaults';
import type { DesignerMode, GridSnap } from '../components/GardenDesigner/Toolbar';

const CANVAS_QUERY_KEY = ['my-garden-canvas'];
const BEDS_QUERY_KEY = ['my-garden-beds'];
const CROPS_QUERY_KEY = ['my-crops'];

export interface UseGardenDesignerResult {
  canvas: GardenCanvas | undefined;
  beds: GardenBed[];
  crops: GrowerCropItem[];
  cropsByBedId: Map<string, GrowerCropItem[]>;
  isLoading: boolean;
  loadError: Error | null;
  selectedBedId: string | null;
  setSelectedBedId: (id: string | null) => void;
  selectedBed: GardenBed | undefined;
  mode: DesignerMode;
  setMode: (mode: DesignerMode) => void;
  snap: GridSnap;
  setSnap: (snap: GridSnap) => void;
  isMobile: boolean;
  editUnlocked: boolean;
  toggleEditUnlocked: () => void;
  isEditable: boolean;
  isSaving: boolean;
  addBed: (type: BedType) => Promise<void>;
  commitPolygon: (points: BedPolygonPoint[]) => Promise<void>;
  moveBed: (bedId: string, positionX: number, positionY: number) => void;
  patchBed: (bedId: string, patch: Partial<GardenBed>) => void;
  deleteBed: (bedId: string) => Promise<void>;
  patchCanvas: (patch: UpsertGardenCanvasRequest) => void;
  uploadBackgroundImage: (file: File) => Promise<void>;
  clearBackgroundImage: () => Promise<void>;
}

const MOBILE_BREAKPOINT = 768;

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : window.innerWidth < MOBILE_BREAKPOINT
  );
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    function handleResize() {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return isMobile;
}

function bedToUpsertPayload(bed: GardenBed): UpsertGardenBedRequest {
  return {
    name: bed.name,
    description: bed.description,
    sunExposure: bed.sunExposure,
    soilType: bed.soilType,
    lengthInches: bed.lengthInches,
    widthInches: bed.widthInches,
    locationNotes: bed.locationNotes,
    sortOrder: bed.sortOrder,
    bedType: bed.bedType,
    shape: bed.shape,
    positionX: bed.positionX,
    positionY: bed.positionY,
    rotationDeg: bed.rotationDeg,
    points: bed.points,
    color: bed.color,
  };
}

/**
 * Owns all designer state — selection, mode, snap, edit-lock — and wraps
 * react-query mutations for canvas/bed CRUD with optimistic updates.
 *
 * Separating this from the page keeps GardenDesignerPage rendering-focused
 * and makes it easier to reason about side effects.
 */
export function useGardenDesigner(): UseGardenDesignerResult {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [editUnlocked, setEditUnlocked] = useState(false);
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);
  const [mode, setMode] = useState<DesignerMode>('idle');
  const [snap, setSnap] = useState<GridSnap>('12');

  const canvasQuery = useQuery({
    queryKey: CANVAS_QUERY_KEY,
    queryFn: getMyGardenCanvas,
    staleTime: 30_000,
  });
  const bedsQuery = useQuery({
    queryKey: BEDS_QUERY_KEY,
    queryFn: listMyBeds,
    staleTime: 30_000,
  });
  const cropsQuery = useQuery({
    queryKey: CROPS_QUERY_KEY,
    queryFn: listMyCrops,
    staleTime: 30_000,
  });

  // Pending mutation count drives the "Saving…" indicator. We keep the
  // count in state (rather than a ref) so React schedules a re-render
  // each time it changes.
  const [pendingMutations, setPendingMutations] = useState(0);
  const startMutation = useCallback(() => {
    setPendingMutations((count) => count + 1);
  }, []);
  const endMutation = useCallback(() => {
    setPendingMutations((count) => Math.max(0, count - 1));
  }, []);

  const createBedMutation = useMutation({
    mutationFn: createMyBed,
    onMutate: startMutation,
    onSettled: () => {
      endMutation();
      void queryClient.invalidateQueries({ queryKey: BEDS_QUERY_KEY });
    },
  });

  const updateBedMutation = useMutation({
    mutationFn: ({ bedId, payload }: { bedId: string; payload: UpsertGardenBedRequest }) =>
      updateMyBed(bedId, payload),
    onMutate: ({ bedId, payload }) => {
      startMutation();
      const previous = queryClient.getQueryData<GardenBed[]>(BEDS_QUERY_KEY);
      if (previous) {
        const next = previous.map((bed) =>
          bed.id === bedId
            ? {
                ...bed,
                name: payload.name,
                description: payload.description ?? null,
                sunExposure: payload.sunExposure ?? null,
                soilType: payload.soilType ?? null,
                lengthInches: payload.lengthInches ?? null,
                widthInches: payload.widthInches ?? null,
                locationNotes: payload.locationNotes ?? null,
                sortOrder: payload.sortOrder ?? bed.sortOrder,
                bedType: payload.bedType ?? bed.bedType,
                shape: payload.shape ?? bed.shape,
                positionX: payload.positionX ?? null,
                positionY: payload.positionY ?? null,
                rotationDeg: payload.rotationDeg ?? bed.rotationDeg,
                points: payload.points ?? null,
                color: payload.color ?? null,
              }
            : bed
        );
        queryClient.setQueryData(BEDS_QUERY_KEY, next);
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(BEDS_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      endMutation();
      void queryClient.invalidateQueries({ queryKey: BEDS_QUERY_KEY });
    },
  });

  const deleteBedMutation = useMutation({
    mutationFn: deleteMyBed,
    onMutate: (bedId) => {
      startMutation();
      const previous = queryClient.getQueryData<GardenBed[]>(BEDS_QUERY_KEY);
      if (previous) {
        queryClient.setQueryData(
          BEDS_QUERY_KEY,
          previous.filter((bed) => bed.id !== bedId)
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(BEDS_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      endMutation();
      void queryClient.invalidateQueries({ queryKey: BEDS_QUERY_KEY });
    },
  });

  const updateCanvasMutation = useMutation({
    mutationFn: updateMyGardenCanvas,
    onMutate: (payload) => {
      startMutation();
      const previous = queryClient.getQueryData<GardenCanvas>(CANVAS_QUERY_KEY);
      if (previous) {
        queryClient.setQueryData<GardenCanvas>(CANVAS_QUERY_KEY, {
          ...previous,
          widthInches: payload.widthInches ?? previous.widthInches,
          heightInches: payload.heightInches ?? previous.heightInches,
          backgroundImageKey:
            payload.backgroundImageKey === undefined
              ? previous.backgroundImageKey
              : payload.backgroundImageKey,
          backgroundOpacity: payload.backgroundOpacity ?? previous.backgroundOpacity,
          northOffsetDeg: payload.northOffsetDeg ?? previous.northOffsetDeg,
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(CANVAS_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      endMutation();
      void queryClient.invalidateQueries({ queryKey: CANVAS_QUERY_KEY });
    },
  });

  const beds = useMemo(() => bedsQuery.data ?? [], [bedsQuery.data]);
  const crops = useMemo(() => cropsQuery.data ?? [], [cropsQuery.data]);

  const cropsByBedId = useMemo(() => {
    const map = new Map<string, GrowerCropItem[]>();
    for (const crop of crops) {
      if (!crop.bedId) continue;
      const existing = map.get(crop.bedId);
      if (existing) {
        existing.push(crop);
      } else {
        map.set(crop.bedId, [crop]);
      }
    }
    return map;
  }, [crops]);

  const selectedBed = useMemo(
    () => beds.find((b) => b.id === selectedBedId),
    [beds, selectedBedId]
  );

  const isEditable = !isMobile || editUnlocked;

  const toggleEditUnlocked = useCallback(() => setEditUnlocked((v) => !v), []);

  const addBed = useCallback(
    async (type: BedType) => {
      if (!isEditable) return;
      const defaults = defaultsFor(type);
      const canvas = canvasQuery.data;
      const positionX = canvas
        ? Math.max(0, Math.round((canvas.widthInches - defaults.lengthInches) / 2))
        : 12;
      const positionY = canvas
        ? Math.max(0, Math.round((canvas.heightInches - defaults.widthInches) / 2))
        : 12;
      const created = await createBedMutation.mutateAsync({
        name: `${defaults.label} ${beds.length + 1}`,
        bedType: defaults.bedType,
        shape: defaults.shape,
        lengthInches: defaults.lengthInches,
        widthInches: defaults.widthInches,
        positionX,
        positionY,
        rotationDeg: 0,
        points:
          defaults.shape === 'polygon'
            ? defaultRectPolygonPoints(defaults.lengthInches, defaults.widthInches)
            : null,
      });
      setSelectedBedId(created.id);
    },
    [beds.length, canvasQuery.data, createBedMutation, isEditable]
  );

  const commitPolygon = useCallback(
    async (points: BedPolygonPoint[]) => {
      if (!isEditable || points.length < 3) return;
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      const normalized = points.map((p) => ({ x: p.x - minX, y: p.y - minY }));
      const created = await createBedMutation.mutateAsync({
        name: `In-ground bed ${beds.length + 1}`,
        bedType: 'in_ground',
        shape: 'polygon',
        lengthInches: maxX - minX,
        widthInches: maxY - minY,
        positionX: minX,
        positionY: minY,
        rotationDeg: 0,
        points: normalized,
      });
      setSelectedBedId(created.id);
      setMode('idle');
    },
    [beds.length, createBedMutation, isEditable]
  );

  const moveBed = useCallback(
    (bedId: string, positionX: number, positionY: number) => {
      const bed = beds.find((b) => b.id === bedId);
      if (!bed) return;
      const payload = bedToUpsertPayload({ ...bed, positionX, positionY });
      updateBedMutation.mutate({ bedId, payload });
    },
    [beds, updateBedMutation]
  );

  const patchBed = useCallback(
    (bedId: string, patch: Partial<GardenBed>) => {
      const bed = beds.find((b) => b.id === bedId);
      if (!bed) return;
      const payload = bedToUpsertPayload({ ...bed, ...patch });
      updateBedMutation.mutate({ bedId, payload });
    },
    [beds, updateBedMutation]
  );

  const deleteBed = useCallback(
    async (bedId: string) => {
      if (!isEditable) return;
      await deleteBedMutation.mutateAsync(bedId);
      if (selectedBedId === bedId) {
        setSelectedBedId(null);
      }
    },
    [deleteBedMutation, isEditable, selectedBedId]
  );

  const patchCanvas = useCallback(
    (patch: UpsertGardenCanvasRequest) => {
      updateCanvasMutation.mutate(patch);
    },
    [updateCanvasMutation]
  );

  const uploadBackgroundImage = useCallback(
    async (file: File) => {
      if (!isEditable) return;
      const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
      if (!allowed.has(file.type)) {
        throw new Error('Only JPEG, PNG, or WebP images are accepted.');
      }
      if (file.size > 8 * 1024 * 1024) {
        throw new Error('Images must be 8 MB or smaller.');
      }
      const intent = await requestBackgroundUploadUrl({
        contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
        contentLength: file.size,
      });
      const upload = await fetch(intent.uploadUrl, {
        method: intent.method,
        headers: intent.headers,
        body: file,
      });
      if (!upload.ok) {
        throw new Error(`Background upload failed: ${upload.status}`);
      }
      updateCanvasMutation.mutate({ backgroundImageKey: intent.s3Key });
    },
    [isEditable, updateCanvasMutation]
  );

  const clearBackgroundImage = useCallback(async () => {
    if (!isEditable) return;
    updateCanvasMutation.mutate({ backgroundImageKey: null });
  }, [isEditable, updateCanvasMutation]);

  const isSaving = pendingMutations > 0;

  return {
    canvas: canvasQuery.data,
    beds,
    crops,
    cropsByBedId,
    isLoading: canvasQuery.isLoading || bedsQuery.isLoading,
    loadError:
      (canvasQuery.error as Error | null) ??
      (bedsQuery.error as Error | null) ??
      null,
    selectedBedId,
    setSelectedBedId,
    selectedBed,
    mode,
    setMode,
    snap,
    setSnap,
    isMobile,
    editUnlocked,
    toggleEditUnlocked,
    isEditable,
    isSaving,
    addBed,
    commitPolygon,
    moveBed,
    patchBed,
    deleteBed,
    patchCanvas,
    uploadBackgroundImage,
    clearBackgroundImage,
  };
}
