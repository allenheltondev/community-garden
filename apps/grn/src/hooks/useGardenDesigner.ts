import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  calibrationFactor,
  rescaledAnnotationPayload,
  rescaledBedPayload,
  rescaledCanvas,
} from '../components/GardenDesigner/calibration';
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
  applyCalibration: (
    drawnLengthInches: number,
    realLengthInches: number,
    rescaleElements: boolean
  ) => void;
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
      selectItem({ kind: 'bed', id: created.id });
    },
    [beds.length, canvasQuery.data, createBedMutation, isEditable, selectItem]
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
      selectItem({ kind: 'bed', id: created.id });
      setMode('idle');
    },
    [beds.length, createBedMutation, isEditable, selectItem]
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
      updateBedMutation.mutate({ bedId, payload });
    },
    [beds, updateBedMutation]
  );

  const deleteBed = useCallback(
    async (bedId: string) => {
      if (!isEditable) return;
      await deleteBedMutation.mutateAsync(bedId);
      if (selected?.kind === 'bed' && selected.id === bedId) {
        selectItem(null);
      }
    },
    [deleteBedMutation, isEditable, selected, selectItem]
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
      selectItem({ kind: 'annotation', id: created.id });
    },
    [canvasQuery.data, createAnnotationMutation, isEditable, selectItem]
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
      updateAnnotationMutation.mutate({ annotationId, payload });
    },
    [annotations, updateAnnotationMutation]
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
      updateAnnotationMutation.mutate({ annotationId, payload });
    },
    [annotations, updateAnnotationMutation]
  );

  const patchAnnotation = useCallback(
    (annotationId: string, patch: Partial<GardenAnnotation>) => {
      const annotation = annotations.find((a) => a.id === annotationId);
      if (!annotation) return;
      const payload = annotationToUpsertPayload({ ...annotation, ...patch });
      updateAnnotationMutation.mutate({ annotationId, payload });
    },
    [annotations, updateAnnotationMutation]
  );

  const deleteAnnotation = useCallback(
    async (annotationId: string) => {
      if (!isEditable) return;
      await deleteAnnotationMutation.mutateAsync(annotationId);
      if (selected?.kind === 'annotation' && selected.id === annotationId) {
        selectItem(null);
      }
    },
    [deleteAnnotationMutation, isEditable, selected, selectItem]
  );

  const patchCanvas = useCallback(
    (patch: UpsertGardenCanvasRequest) => {
      updateCanvasMutation.mutate(patch);
    },
    [updateCanvasMutation]
  );

  // Background-image scale calibration: the user drew a reference line of
  // drawnLengthInches over the photo and told us it's really
  // realLengthInches long. Rescale the canvas by that ratio (clamped to
  // sane bounds) and, when asked, move/resize every bed and annotation by
  // the same factor so they keep their position relative to the photo.
  const applyCalibration = useCallback(
    (
      drawnLengthInches: number,
      realLengthInches: number,
      rescaleElements: boolean
    ) => {
      if (!isEditable) return;
      const canvas = canvasQuery.data;
      if (!canvas) return;
      const factor = calibrationFactor(drawnLengthInches, realLengthInches);
      if (factor === null) return;
      const next = rescaledCanvas(canvas, factor);
      if (
        next.widthInches !== canvas.widthInches ||
        next.heightInches !== canvas.heightInches
      ) {
        updateCanvasMutation.mutate({
          widthInches: next.widthInches,
          heightInches: next.heightInches,
        });
      }
      if (!rescaleElements || next.effectiveFactor === 1) return;
      for (const bed of beds) {
        updateBedMutation.mutate({
          bedId: bed.id,
          payload: rescaledBedPayload(bed, next.effectiveFactor),
        });
      }
      for (const annotation of annotations) {
        updateAnnotationMutation.mutate({
          annotationId: annotation.id,
          payload: rescaledAnnotationPayload(annotation, next.effectiveFactor),
        });
      }
    },
    [
      annotations,
      beds,
      canvasQuery.data,
      isEditable,
      updateAnnotationMutation,
      updateBedMutation,
      updateCanvasMutation,
    ]
  );

  // Keyboard shortcuts:
  //   Esc           - deselect (when not in drawing-polygon mode; the
  //                   Canvas owns Esc-to-cancel for that mode)
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
      // The Canvas owns Esc-to-cancel for drawing and calibration, and
      // Delete shouldn't fire while either gesture is mid-flight.
      if (mode === 'drawing-polygon' || mode === 'calibrating-scale') return;
      if (isEditingText(event.target)) return;

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
  }, [mode, selected, selectedBed, selectedAnnotation, isEditable, deleteBed, deleteAnnotation]);

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
    applyCalibration,
    uploadBackgroundImage,
    clearBackgroundImage,
  };
}
