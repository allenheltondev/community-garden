import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PlantLoader } from '../components/branding/PlantLoader';
import { GardenMasterplan } from '../components/GardenMasterplan/GardenMasterplan';
import { useGardenDesigner } from '../hooks/useGardenDesigner';

/**
 * The Map view is the garden workspace's illustrated isometric masterplan.
 * Explore the whole property, then select any element to tend
 * it and make tight edits in place — drag to move, grab the handles to
 * resize or rotate, reshape custom outlines, and fine-tune every detail in
 * the inspector. There is no separate precision/layout view; everything
 * happens on the map.
 */
export function GardenDesignerPage() {
  const designer = useGardenDesigner();
  const [searchParams] = useSearchParams();
  const appliedContext = useRef<string | null>(null);
  const requestedBedId = searchParams.get('bed') ?? searchParams.get('bedId');
  const requestedCropId = searchParams.get('crop');

  useEffect(() => {
    if (designer.isLoading) return;
    const contextKey = `${requestedBedId ?? ''}:${requestedCropId ?? ''}`;
    if (appliedContext.current === contextKey) return;

    const cropBedId = requestedCropId
      ? designer.crops.find((crop) => crop.id === requestedCropId)?.bedId
      : null;
    const bedId = requestedBedId ?? cropBedId;
    if (bedId && designer.beds.some((bed) => bed.id === bedId)) {
      designer.setSelected({ kind: 'bed', id: bedId });
    }
    appliedContext.current = contextKey;
  }, [designer, requestedBedId, requestedCropId]);

  if (designer.isLoading) {
    return (
      <div className="grn-designer-page">
        <div className="grn-page-status">
          <PlantLoader size="md" />
          <p>Loading your garden…</p>
        </div>
      </div>
    );
  }

  if (designer.loadError || !designer.canvas) {
    return (
      <div className="grn-designer-page">
        <div className="grn-page-status">
          <p className="grn-page-status__error">
            We couldn’t load your garden. Try refreshing the page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`grn-designer-page ${designer.isMobile ? 'is-mobile' : ''}`}>
      <header className="grn-designer-page__header">
        <div className="grn-designer-page__title-block">
          <h2 className="grn-designer-page__title">Map</h2>
          <p className="grn-designer-page__subtitle">
            Explore beds, landmarks, and what is growing. Select anything for its
            details and available actions.
          </p>
        </div>
      </header>

      <GardenMasterplan
        canvas={designer.canvas}
        beds={designer.beds}
        annotations={designer.annotations}
        cropsByBedId={designer.cropsByBedId}
        selected={designer.selected}
        selectedBed={designer.selectedBed}
        selectedAnnotation={designer.selectedAnnotation}
        onSelect={designer.setSelected}
        onPatchBed={designer.patchBed}
        onPatchAnnotation={designer.patchAnnotation}
        onApplyTemplate={designer.applyTemplate}
        editing={
          designer.isEditable
            ? {
                snap: designer.snap,
                onSnapChange: designer.setSnap,
                mode: designer.mode,
                onSetMode: designer.setMode,
                onMoveBed: designer.moveBed,
                onMoveAnnotation: designer.moveAnnotation,
                onResizeBed: designer.resizeBed,
                onResizeAnnotation: designer.resizeAnnotation,
                onUpdateBedPoints: designer.updateBedPoints,
                onAddBed: (shape) => {
                  void designer.addBed(shape);
                },
                onAddAnnotation: (presetId) => {
                  void designer.addAnnotation(presetId);
                },
                onDeleteBed: (bedId) => {
                  void designer.deleteBed(bedId);
                },
                onDeleteAnnotation: (annotationId) => {
                  void designer.deleteAnnotation(annotationId);
                },
                onAddCrop: (input) =>
                  designer.addCrop({
                    ...input,
                    bedId: designer.selectedBed!.id,
                  }),
                onDuplicate: () => {
                  void designer.duplicateSelected();
                },
                onPatchCanvas: designer.patchCanvas,
                canUndo: designer.canUndo,
                canRedo: designer.canRedo,
                onUndo: designer.undo,
                onRedo: designer.redo,
                isSaving: designer.isSaving,
                saveError: designer.saveError,
              }
            : undefined
        }
      />
    </div>
  );
}
