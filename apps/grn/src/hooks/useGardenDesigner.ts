import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EMPTY_HISTORY,
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  peekRedo,
  peekUndo,
  pushEntry,
  remapEntityId,
  steppedBack,
  steppedForward,
  type DesignerHistory,
  type HistoryEntityKind,
  type HistoryEntry,
} from './designerHistory';
import {
  createMyAnnotation,
  createMyBed,
  deleteMyAnnotation,
  deleteMyBed,
  getMyGardenCanvas,
  listMyAnnotations,
  listMyBeds,
  listMyCrops,
  requestBackgroundUploadUrl,
  updateMyAnnotation,
  updateMyBed,
  updateMyGardenCanvas,
  type UpsertGardenAnnotationRequest,
  type UpsertGardenBedRequest,
  type UpsertGardenCanvasRequest,
} from '../services/api';
import type {
  BedPolygonPoint,
  BedShape,
  GardenAnnotation,
  GardenBed,
  GardenCanvas,
  GrowerCropItem,
} from '../types/listing';
import {
  defaultRectPolygonPoints,
  normalizePolygonGeometry,
  shapeDefaults,
} from '../components/GardenDesigner/bedDefaults';
import {
  ANNOTATION_PRESETS,
  presetById,
} from '../components/GardenDesigner/annotationPresets';
import type { DesignerMode, GridSnap } from '../components/GardenDesigner/Toolbar';

const CANVAS_QUERY_KEY = ['my-garden-canvas'];
const BEDS_QUERY_KEY = ['my-garden-beds'];
const ANNOTATIONS_QUERY_KEY = ['my-garden-annotations'];
const CROPS_QUERY_KEY = ['my-crops'];

export type SelectedItem =
  | { kind: 'bed'; id: string }
  | { kind: 'annotation'; id: string }
  | null;

export interface UseGardenDesignerResult {
  canvas: GardenCanvas | undefined;
  beds: GardenBed[];
  annotations: GardenAnnotation[];
  crops: GrowerCropItem[];
  cropsByBedId: Map<string, GrowerCropItem[]>;
  isLoading: boolean;
  loadError: Error | null;
  selected: SelectedItem;
  setSelected: (next: SelectedItem) => void;
  selectedBed: GardenBed | undefined;
  selectedAnnotation: GardenAnnotation | undefined;
  mode: DesignerMode;
  setMode: (mode: DesignerMode) => void;
  snap: GridSnap;
  setSnap: (snap: GridSnap) => void;
  isMobile: boolean;
  isEditable: boolean;
  isSaving: boolean;
  addBed: (shape: BedShape) => Promise<void>;
  commitPolygon: (points: BedPolygonPoint[]) => Promise<void>;
  moveBed: (bedId: string, positionX: number, positionY: number) => void;
  resizeBed: (
    bedId: string,
    next: {
      positionX: number;
      positionY: number;
      lengthInches: number;
      widthInches: number;
      rotationDeg: number;
      points: BedPolygonPoint[] | null;
    }
  ) => void;
  patchBed: (bedId: string, patch: Partial<GardenBed>) => void;
  updateBedPoints: (bedId: string, points: BedPolygonPoint[]) => void;
  deleteBed: (bedId: string) => Promise<void>;
  addAnnotation: (presetId: string) => Promise<void>;
  moveAnnotation: (annotationId: string, positionX: number, positionY: number) => void;
  resizeAnnotation: (
    annotationId: string,
    next: {
      positionX: number;
      positionY: number;
      lengthInches: number;
      widthInches: number;
      rotationDeg: number;
      points: BedPolygonPoint[] | null;
    }
  ) => void;
  patchAnnotation: (annotationId: string, patch: Partial<GardenAnnotation>) => void;
  deleteAnnotation: (annotationId: string) => Promise<void>;
  patchCanvas: (patch: UpsertGardenCanvasRequest) => void;
  uploadBackgroundImage: (file: File) => Promise<void>;
  clearBackgroundImage: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
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

function annotationToUpsertPayload(a: GardenAnnotation): UpsertGardenAnnotationRequest {
  return {
    label: a.label,
    icon: a.icon,
    shape: a.shape,
    positionX: a.positionX,
    positionY: a.positionY,
    lengthInches: a.lengthInches,
    widthInches: a.widthInches,
    rotationDeg: a.rotationDeg,
    points: a.points,
    color: a.color,
    sortOrder: a.sortOrder,
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
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [mode, setMode] = useState<DesignerMode>('idle');
  const [snap, setSnap] = useState<GridSnap>('12');

  // All selection changes funnel through this wrapper so vertex editing
  // ends the moment focus moves off the bed being reshaped (deselect,
  // another element, a freshly created one). Re-clicking the same bed
  // keeps the handles up.
  const selectItem = useCallback(
    (next: SelectedItem) => {
      setMode((current) => {
        if (current !== 'editing-vertices') return current;
        const sameBed =
          next?.kind === 'bed' && selected?.kind === 'bed' && next.id === selected.id;
        return sameBed ? current : 'idle';
      });
      setSelected(next);
    },
    [selected]
  );

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
  const annotationsQuery = useQuery({
    queryKey: ANNOTATIONS_QUERY_KEY,
    queryFn: listMyAnnotations,
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

  const createAnnotationMutation = useMutation({
    mutationFn: createMyAnnotation,
    onMutate: startMutation,
    onSettled: () => {
      endMutation();
      void queryClient.invalidateQueries({ queryKey: ANNOTATIONS_QUERY_KEY });
    },
  });

  const updateAnnotationMutation = useMutation({
    mutationFn: ({
      annotationId,
      payload,
    }: {
      annotationId: string;
      payload: UpsertGardenAnnotationRequest;
    }) => updateMyAnnotation(annotationId, payload),
    onMutate: ({ annotationId, payload }) => {
      startMutation();
      const previous = queryClient.getQueryData<GardenAnnotation[]>(ANNOTATIONS_QUERY_KEY);
      if (previous) {
        const next = previous.map((a) =>
          a.id === annotationId
            ? {
                ...a,
                label: payload.label,
                icon: payload.icon ?? null,
                shape: payload.shape ?? a.shape,
                positionX: payload.positionX ?? null,
                positionY: payload.positionY ?? null,
                lengthInches: payload.lengthInches ?? null,
                widthInches: payload.widthInches ?? null,
                rotationDeg: payload.rotationDeg ?? a.rotationDeg,
                points: payload.points ?? null,
                color: payload.color ?? null,
                sortOrder: payload.sortOrder ?? a.sortOrder,
              }
            : a
        );
        queryClient.setQueryData(ANNOTATIONS_QUERY_KEY, next);
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(ANNOTATIONS_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      endMutation();
      void queryClient.invalidateQueries({ queryKey: ANNOTATIONS_QUERY_KEY });
    },
  });

  const deleteAnnotationMutation = useMutation({
    mutationFn: deleteMyAnnotation,
    onMutate: (annotationId) => {
      startMutation();
      const previous = queryClient.getQueryData<GardenAnnotation[]>(ANNOTATIONS_QUERY_KEY);
      if (previous) {
        queryClient.setQueryData(
          ANNOTATIONS_QUERY_KEY,
          previous.filter((a) => a.id !== annotationId)
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(ANNOTATIONS_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      endMutation();
      void queryClient.invalidateQueries({ queryKey: ANNOTATIONS_QUERY_KEY });
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

  // --- Undo/redo -----------------------------------------------------------
  // Geometry-level history over bed/annotation mutations. Canvas settings
  // and crop assignments are deliberately out of scope. Entries are
  // recorded at the commit helpers below; undo/redo replays them through
  // the raw mutations so nothing re-records.
  const [history, setHistory] = useState<DesignerHistory>(EMPTY_HISTORY);
  const historyBusyRef = useRef(false);

  const record = useCallback((entry: HistoryEntry) => {
    setHistory((h) => pushEntry(h, entry));
  }, []);

  const commitBedUpdate = useCallback(
    (bed: GardenBed, payload: UpsertGardenBedRequest, coalesceKey?: string) => {
      const before = bedToUpsertPayload(bed);
      if (JSON.stringify(before) === JSON.stringify(payload)) return;
      record({
        kind: 'bed-update',
        id: bed.id,
        before,
        after: payload,
        at: Date.now(),
        coalesceKey,
      });
      updateBedMutation.mutate({ bedId: bed.id, payload });
    },
    [record, updateBedMutation]
  );

  const commitAnnotationUpdate = useCallback(
    (
      annotation: GardenAnnotation,
      payload: UpsertGardenAnnotationRequest,
      coalesceKey?: string
    ) => {
      const before = annotationToUpsertPayload(annotation);
      if (JSON.stringify(before) === JSON.stringify(payload)) return;
      record({
        kind: 'annotation-update',
        id: annotation.id,
        before,
        after: payload,
        at: Date.now(),
        coalesceKey,
      });
      updateAnnotationMutation.mutate({ annotationId: annotation.id, payload });
    },
    [record, updateAnnotationMutation]
  );

  const beds = useMemo(() => bedsQuery.data ?? [], [bedsQuery.data]);
  const annotations = useMemo(
    () => annotationsQuery.data ?? [],
    [annotationsQuery.data]
  );
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
    () =>
      selected?.kind === 'bed' ? beds.find((b) => b.id === selected.id) : undefined,
    [beds, selected]
  );

  const selectedAnnotation = useMemo(
    () =>
      selected?.kind === 'annotation'
        ? annotations.find((a) => a.id === selected.id)
        : undefined,
    [annotations, selected]
  );

  // The designer is always editable — earlier iterations had a mobile-only
  // "edit lock" that gated drag/resize behind a manual unlock toggle, but
  // it confused users (the same canvas appeared inert until they spotted
  // the lock button). Konva.dragDistance and the bottom-sheet inspector
  // already prevent the accidental-edit cases the lock was guarding.
  const isEditable = true;

  const addBed = useCallback(
    async (shape: BedShape) => {
      if (!isEditable) return;
      const defaults = shapeDefaults(shape);
      const canvas = canvasQuery.data;
      const positionX = canvas
        ? Math.max(0, Math.round((canvas.widthInches - defaults.lengthInches) / 2))
        : 12;
      const positionY = canvas
        ? Math.max(0, Math.round((canvas.heightInches - defaults.widthInches) / 2))
        : 12;
      // New beds default to bed_type='raised' since "raised" is the most
      // common starting point. Users change it via the inspector.
      const created = await createBedMutation.mutateAsync({
        name: `Bed ${beds.length + 1}`,
        bedType: 'raised',
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
      record({
        kind: 'bed-create',
        id: created.id,
        payload: bedToUpsertPayload(created),
        at: Date.now(),
      });
      selectItem({ kind: 'bed', id: created.id });
    },
    [beds.length, canvasQuery.data, createBedMutation, isEditable, record, selectItem]
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
      record({
        kind: 'bed-create',
        id: created.id,
        payload: bedToUpsertPayload(created),
        at: Date.now(),
      });
      selectItem({ kind: 'bed', id: created.id });
      setMode('idle');
    },
    [beds.length, createBedMutation, isEditable, record, selectItem]
  );

  const moveBed = useCallback(
    (bedId: string, positionX: number, positionY: number) => {
      const bed = beds.find((b) => b.id === bedId);
      if (!bed) return;
      const payload = bedToUpsertPayload({ ...bed, positionX, positionY });
      commitBedUpdate(bed, payload);
    },
    [beds, commitBedUpdate]
  );

  const resizeBed = useCallback(
    (
      bedId: string,
      next: {
        positionX: number;
        positionY: number;
        lengthInches: number;
        widthInches: number;
        rotationDeg: number;
        points: BedPolygonPoint[] | null;
      }
    ) => {
      const bed = beds.find((b) => b.id === bedId);
      if (!bed) return;
      const payload = bedToUpsertPayload({
        ...bed,
        positionX: next.positionX,
        positionY: next.positionY,
        lengthInches: next.lengthInches,
        widthInches: next.widthInches,
        rotationDeg: next.rotationDeg,
        points: next.points,
      });
      commitBedUpdate(bed, payload);
    },
    [beds, commitBedUpdate]
  );

  const patchBed = useCallback(
    (bedId: string, patch: Partial<GardenBed>) => {
      const bed = beds.find((b) => b.id === bedId);
      if (!bed) return;
      const payload = bedToUpsertPayload({ ...bed, ...patch });
      commitBedUpdate(bed, payload);
    },
    [beds, commitBedUpdate]
  );

  // Vertex edits arrive as the full reshaped point list (in the bed's
  // local frame). Re-anchor it to (0,0) and refresh the bounding box so
  // the inspector dimensions and iso footprint stay truthful.
  const updateBedPoints = useCallback(
    (bedId: string, points: BedPolygonPoint[]) => {
      const bed = beds.find((b) => b.id === bedId);
      if (!bed || bed.shape !== 'polygon' || points.length < 3) return;
      const geometry = normalizePolygonGeometry({
        positionX: bed.positionX ?? 12,
        positionY: bed.positionY ?? 12,
        rotationDeg: bed.rotationDeg,
        points,
      });
      const payload = bedToUpsertPayload({ ...bed, ...geometry });
      commitBedUpdate(bed, payload);
    },
    [beds, commitBedUpdate]
  );

  const deleteBed = useCallback(
    async (bedId: string) => {
      if (!isEditable) return;
      const bed = beds.find((b) => b.id === bedId);
      await deleteBedMutation.mutateAsync(bedId);
      if (bed) {
        record({
          kind: 'bed-delete',
          id: bedId,
          payload: bedToUpsertPayload(bed),
          at: Date.now(),
        });
      }
      if (selected?.kind === 'bed' && selected.id === bedId) {
        selectItem(null);
      }
    },
    [beds, deleteBedMutation, isEditable, record, selected, selectItem]
  );

  const addAnnotation = useCallback(
    async (presetId: string) => {
      if (!isEditable) return;
      const preset = presetById(presetId) ?? ANNOTATION_PRESETS[ANNOTATION_PRESETS.length - 1];
      const canvasData = canvasQuery.data;
      const positionX = canvasData
        ? Math.max(0, Math.round((canvasData.widthInches - preset.defaultLength) / 2))
        : 12;
      const positionY = canvasData
        ? Math.max(0, Math.round((canvasData.heightInches - preset.defaultWidth) / 2))
        : 12;
      const points = preset.buildPoints
        ? preset.buildPoints(preset.defaultLength, preset.defaultWidth)
        : null;
      const created = await createAnnotationMutation.mutateAsync({
        label: preset.label,
        icon: preset.icon,
        shape: preset.shape,
        lengthInches: preset.defaultLength,
        widthInches: preset.defaultWidth,
        positionX,
        positionY,
        rotationDeg: 0,
        color: preset.defaultColor,
        points,
      });
      record({
        kind: 'annotation-create',
        id: created.id,
        payload: annotationToUpsertPayload(created),
        at: Date.now(),
      });
      selectItem({ kind: 'annotation', id: created.id });
    },
    [canvasQuery.data, createAnnotationMutation, isEditable, record, selectItem]
  );

  const moveAnnotation = useCallback(
    (annotationId: string, positionX: number, positionY: number) => {
      const annotation = annotations.find((a) => a.id === annotationId);
      if (!annotation) return;
      const payload = annotationToUpsertPayload({
        ...annotation,
        positionX,
        positionY,
      });
      commitAnnotationUpdate(annotation, payload);
    },
    [annotations, commitAnnotationUpdate]
  );

  const resizeAnnotation = useCallback(
    (
      annotationId: string,
      next: {
        positionX: number;
        positionY: number;
        lengthInches: number;
        widthInches: number;
        rotationDeg: number;
        points: BedPolygonPoint[] | null;
      }
    ) => {
      const annotation = annotations.find((a) => a.id === annotationId);
      if (!annotation) return;
      const payload = annotationToUpsertPayload({
        ...annotation,
        positionX: next.positionX,
        positionY: next.positionY,
        lengthInches: next.lengthInches,
        widthInches: next.widthInches,
        rotationDeg: next.rotationDeg,
        points: next.points,
      });
      commitAnnotationUpdate(annotation, payload);
    },
    [annotations, commitAnnotationUpdate]
  );

  const patchAnnotation = useCallback(
    (annotationId: string, patch: Partial<GardenAnnotation>) => {
      const annotation = annotations.find((a) => a.id === annotationId);
      if (!annotation) return;
      const payload = annotationToUpsertPayload({ ...annotation, ...patch });
      commitAnnotationUpdate(annotation, payload);
    },
    [annotations, commitAnnotationUpdate]
  );

  const deleteAnnotation = useCallback(
    async (annotationId: string) => {
      if (!isEditable) return;
      const annotation = annotations.find((a) => a.id === annotationId);
      await deleteAnnotationMutation.mutateAsync(annotationId);
      if (annotation) {
        record({
          kind: 'annotation-delete',
          id: annotationId,
          payload: annotationToUpsertPayload(annotation),
          at: Date.now(),
        });
      }
      if (selected?.kind === 'annotation' && selected.id === annotationId) {
        selectItem(null);
      }
    },
    [annotations, deleteAnnotationMutation, isEditable, record, selected, selectItem]
  );

  const patchCanvas = useCallback(
    (patch: UpsertGardenCanvasRequest) => {
      updateCanvasMutation.mutate(patch);
    },
    [updateCanvasMutation]
  );

  // Applies one history entry in the given direction through the raw
  // mutations (so nothing re-records). Recreating an entity returns an id
  // remap that the caller must fold back into the stack.
  const applyEntry = useCallback(
    async (
      entry: HistoryEntry,
      direction: 'undo' | 'redo'
    ): Promise<{ kind: HistoryEntityKind; oldId: string; newId: string } | null> => {
      switch (entry.kind) {
        case 'bed-update':
          await updateBedMutation.mutateAsync({
            bedId: entry.id,
            payload: direction === 'undo' ? entry.before : entry.after,
          });
          return null;
        case 'annotation-update':
          await updateAnnotationMutation.mutateAsync({
            annotationId: entry.id,
            payload: direction === 'undo' ? entry.before : entry.after,
          });
          return null;
        case 'bed-create':
        case 'bed-delete': {
          const recreate =
            (entry.kind === 'bed-create') === (direction === 'redo');
          if (!recreate) {
            await deleteBedMutation.mutateAsync(entry.id);
            if (selected?.kind === 'bed' && selected.id === entry.id) {
              setSelected(null);
            }
            return null;
          }
          const created = await createBedMutation.mutateAsync(entry.payload);
          return { kind: 'bed', oldId: entry.id, newId: created.id };
        }
        case 'annotation-create':
        case 'annotation-delete': {
          const recreate =
            (entry.kind === 'annotation-create') === (direction === 'redo');
          if (!recreate) {
            await deleteAnnotationMutation.mutateAsync(entry.id);
            if (selected?.kind === 'annotation' && selected.id === entry.id) {
              setSelected(null);
            }
            return null;
          }
          const created = await createAnnotationMutation.mutateAsync(entry.payload);
          return { kind: 'annotation', oldId: entry.id, newId: created.id };
        }
      }
    },
    [
      createAnnotationMutation,
      createBedMutation,
      deleteAnnotationMutation,
      deleteBedMutation,
      selected,
      updateAnnotationMutation,
      updateBedMutation,
    ]
  );

  const stepHistory = useCallback(
    async (direction: 'undo' | 'redo') => {
      if (historyBusyRef.current || !isEditable) return;
      const entry = direction === 'undo' ? peekUndo(history) : peekRedo(history);
      if (!entry) return;
      historyBusyRef.current = true;
      setHistory(direction === 'undo' ? steppedBack : steppedForward);
      try {
        const remap = await applyEntry(entry, direction);
        if (remap) {
          setHistory((h) => remapEntityId(h, remap.kind, remap.oldId, remap.newId));
          setSelected((prev) =>
            prev && prev.id === remap.oldId ? { ...prev, id: remap.newId } : prev
          );
        }
      } catch {
        // The mutation failed (and its optimistic update rolled back), so
        // put the pointer back where it was. If the user managed to push a
        // new entry in the same instant, the pointer is already correct.
        setHistory((h) =>
          direction === 'undo' ? steppedForward(h) : steppedBack(h)
        );
      } finally {
        historyBusyRef.current = false;
      }
    },
    [applyEntry, history, isEditable]
  );

  const undo = useCallback(() => {
    void stepHistory('undo');
  }, [stepHistory]);

  const redo = useCallback(() => {
    void stepHistory('redo');
  }, [stepHistory]);

  // Arrow-key nudging for the selected element. Rapid presses coalesce
  // into a single undo step (see designerHistory).
  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (!isEditable) return;
      if (selected?.kind === 'bed' && selectedBed) {
        const payload = bedToUpsertPayload({
          ...selectedBed,
          positionX: Math.max(0, (selectedBed.positionX ?? 12) + dx),
          positionY: Math.max(0, (selectedBed.positionY ?? 12) + dy),
        });
        commitBedUpdate(selectedBed, payload, 'nudge');
      } else if (selected?.kind === 'annotation' && selectedAnnotation) {
        const payload = annotationToUpsertPayload({
          ...selectedAnnotation,
          positionX: Math.max(0, (selectedAnnotation.positionX ?? 12) + dx),
          positionY: Math.max(0, (selectedAnnotation.positionY ?? 12) + dy),
        });
        commitAnnotationUpdate(selectedAnnotation, payload, 'nudge');
      }
    },
    [
      commitAnnotationUpdate,
      commitBedUpdate,
      isEditable,
      selected,
      selectedAnnotation,
      selectedBed,
    ]
  );

  // Keyboard shortcuts:
  //   Esc           - deselect (when not in drawing-polygon mode; the
  //                   Canvas owns Esc-to-cancel for that mode)
  //   Cmd/Ctrl+Z    - undo; with Shift (or Ctrl+Y) - redo
  //   Arrow keys    - nudge the selected element 1 inch (Shift = 12)
  //   Delete /
  //   Backspace     - prompt for confirmation, then delete the selected
  //                   bed or annotation. Skipped when focus is in a text
  //                   input/editor so it doesn't fight normal text editing.
  useEffect(() => {
    function isEditingText(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      return target.isContentEditable;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (mode === 'drawing-polygon') return;
      if (isEditingText(event.target)) return;

      const meta = event.metaKey || event.ctrlKey;
      if (meta && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (meta && (event.key === 'y' || event.key === 'Y')) {
        event.preventDefault();
        redo();
        return;
      }

      if (
        selected &&
        (event.key === 'ArrowUp' ||
          event.key === 'ArrowDown' ||
          event.key === 'ArrowLeft' ||
          event.key === 'ArrowRight')
      ) {
        event.preventDefault();
        const step = event.shiftKey ? 12 : 1;
        const dx =
          event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy =
          event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        nudgeSelected(dx, dy);
        return;
      }

      if (event.key === 'Escape') {
        // Step out of vertex editing first; a second Esc deselects.
        if (mode === 'editing-vertices') {
          event.preventDefault();
          setMode('idle');
          return;
        }
        if (selected !== null) {
          event.preventDefault();
          setSelected(null);
        }
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        // While reshaping, Delete is too close to "remove that vertex" to
        // risk it nuking the whole bed.
        if (mode === 'editing-vertices') return;
        if (!isEditable || !selected) return;
        if (selected.kind === 'bed' && selectedBed) {
          event.preventDefault();
          const label = selectedBed.name.trim() || 'this bed';
          if (window.confirm(`Delete "${label}"? This can't be undone.`)) {
            void deleteBed(selectedBed.id);
          }
        } else if (selected.kind === 'annotation' && selectedAnnotation) {
          event.preventDefault();
          const label = selectedAnnotation.label.trim() || 'this annotation';
          if (window.confirm(`Delete "${label}"? This can't be undone.`)) {
            void deleteAnnotation(selectedAnnotation.id);
          }
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    mode,
    selected,
    selectedBed,
    selectedAnnotation,
    isEditable,
    deleteBed,
    deleteAnnotation,
    undo,
    redo,
    nudgeSelected,
  ]);

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
    annotations,
    crops,
    cropsByBedId,
    isLoading:
      canvasQuery.isLoading || bedsQuery.isLoading || annotationsQuery.isLoading,
    loadError:
      (canvasQuery.error as Error | null) ??
      (bedsQuery.error as Error | null) ??
      (annotationsQuery.error as Error | null) ??
      null,
    selected,
    setSelected: selectItem,
    selectedBed,
    selectedAnnotation,
    mode,
    setMode,
    snap,
    setSnap,
    isMobile,
    isEditable,
    isSaving,
    addBed,
    commitPolygon,
    moveBed,
    resizeBed,
    patchBed,
    updateBedPoints,
    deleteBed,
    addAnnotation,
    moveAnnotation,
    resizeAnnotation,
    patchAnnotation,
    deleteAnnotation,
    patchCanvas,
    uploadBackgroundImage,
    clearBackgroundImage,
    undo,
    redo,
    canUndo: historyCanUndo(history),
    canRedo: historyCanRedo(history),
  };
}
