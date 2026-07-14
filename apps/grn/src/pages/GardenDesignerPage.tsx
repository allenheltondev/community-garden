import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PlantLoader } from '../components/branding/PlantLoader';
import { GardenMasterplan } from '../components/GardenMasterplan/GardenMasterplan';
import { useGardenDesigner } from '../hooks/useGardenDesigner';

const LAYOUT_EDITING_STORAGE_KEY = 'og-grn-layout-editing';
const LAYOUT_HELP_STORAGE_KEY = 'og-grn-layout-help-seen';

function readSessionFlag(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function writeSessionFlag(key: string, value: boolean) {
  try {
    window.sessionStorage.setItem(key, String(value));
  } catch {
    // The mode still works when storage is unavailable.
  }
}

/**
 * The Map view separates everyday crop care from less-frequent structural
 * design. Tend is the calm default; Edit layout explicitly enables direct
 * manipulation, precise dimensions, landmarks, and history controls.
 */
export function GardenDesignerPage() {
  const designer = useGardenDesigner();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const appliedContext = useRef<string | null>(null);
  const [layoutEditing, setLayoutEditing] = useState(() =>
    readSessionFlag(LAYOUT_EDITING_STORAGE_KEY)
  );
  const [showLayoutHelp, setShowLayoutHelp] = useState(
    () => !readSessionFlag(LAYOUT_HELP_STORAGE_KEY)
  );
  const [layoutMessage, setLayoutMessage] = useState<string | null>(null);
  const [hasLayoutDraft, setHasLayoutDraft] = useState(false);
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

  useEffect(() => {
    if (!layoutEditing || !hasLayoutDraft) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasLayoutDraft, layoutEditing]);

  function enterLayoutEditing() {
    setLayoutEditing(true);
    setShowLayoutHelp(false);
    setLayoutMessage(null);
    writeSessionFlag(LAYOUT_EDITING_STORAGE_KEY, true);
    writeSessionFlag(LAYOUT_HELP_STORAGE_KEY, true);
  }

  function exitLayoutEditing() {
    if (designer.isSaving) {
      setLayoutMessage(
        'Wait for your current changes to finish saving before leaving Edit layout.'
      );
      return;
    }
    if (
      hasLayoutDraft &&
      !window.confirm('You have unapplied layout changes. Leave Edit layout anyway?')
    ) {
      return;
    }

    designer.setMode('idle');
    setLayoutEditing(false);
    setHasLayoutDraft(false);
    setLayoutMessage(null);
    writeSessionFlag(LAYOUT_EDITING_STORAGE_KEY, false);
  }

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
            {layoutEditing
              ? 'Move, resize, and shape the permanent parts of your garden.'
              : 'Select a bed to update crops, log a harvest, set a reminder, or share food.'}
          </p>
        </div>
        {designer.isEditable && (
          <div className="grn-designer-page__mode">
            <button
              type="button"
              className={`grn-designer-page__mode-button${
                layoutEditing ? ' is-editing' : ''
              }`}
              aria-pressed={layoutEditing}
              onClick={layoutEditing ? exitLayoutEditing : enterLayoutEditing}
            >
              {layoutEditing ? 'Done editing layout' : 'Edit layout'}
            </button>
            {showLayoutHelp && !layoutEditing && (
              <p className="grn-designer-page__mode-help">
                Need to move beds or change dimensions? Start here.
              </p>
            )}
          </div>
        )}
      </header>

      {layoutEditing && (
        <p className="grn-designer-page__mode-status" role="status">
          Edit layout is on. Crop tending stays available when you finish.
        </p>
      )}
      {layoutMessage && (
        <p className="grn-designer-page__mode-message" role="alert">
          {layoutMessage}
        </p>
      )}

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
        tending={
          designer.isEditable && !layoutEditing
            ? {
                onAddCrop: async (input) => {
                  const bedId = designer.selectedBed?.id;
                  if (!bedId) return;
                  await designer.addCrop({ ...input, bedId });
                },
                onOpenCrop: (cropId) => navigate(`/garden/plants?crop=${cropId}`),
                onLogHarvest: (cropId) =>
                  navigate(`/garden/plants?crop=${cropId}&action=harvest`),
                onAddReminder: (bed) => {
                  const params = new URLSearchParams({
                    new: 'true',
                    type: 'watering',
                    title: `Water ${bed.name}`,
                  });
                  navigate(`/today/reminders?${params.toString()}`);
                },
                onShareCrop: (cropId) => navigate(`/share/listings?crop=${cropId}`),
              }
            : undefined
        }
        onLayoutDraftChange={setHasLayoutDraft}
        editing={
          designer.isEditable && layoutEditing
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
