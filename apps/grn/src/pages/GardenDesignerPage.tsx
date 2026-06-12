import { useRef, useState } from 'react';
import { PlantLoader } from '../components/branding/PlantLoader';
import { AnnotationInspector } from '../components/GardenDesigner/AnnotationInspector';
import { BedInspector } from '../components/GardenDesigner/BedInspector';
import { CalibrateScaleModal } from '../components/GardenDesigner/CalibrateScaleModal';
import {
  DesignerCanvas,
  type DesignerCanvasHandle,
} from '../components/GardenDesigner/Canvas';
import { GardenPropertiesBar } from '../components/GardenDesigner/GardenPropertiesBar';
import { Toolbar } from '../components/GardenDesigner/Toolbar';
import { GardenMasterplan } from '../components/GardenMasterplan/GardenMasterplan';
import { useGardenDesigner } from '../hooks/useGardenDesigner';

type GardenView = 'masterplan' | 'layout';

/**
 * The garden page hosts two complementary views of the same data:
 *
 * - Masterplan (default): an illustrated isometric map for exploring the
 *   property. Clicking an element opens a floating detail card.
 * - Layout editor: the original top-down canvas for moving, resizing,
 *   drawing, and editing beds and landmarks.
 *
 * Selection is shared, so jumping from the masterplan into the editor
 * lands with the same element selected and its inspector open.
 */
export function GardenDesignerPage() {
  const designer = useGardenDesigner();
  const canvasRef = useRef<DesignerCanvasHandle | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [view, setView] = useState<GardenView>('masterplan');
  // Length of the two-click calibration line, in canvas inches. Non-null
  // while the "how long is this?" dialog is open.
  const [calibrationDrawnLength, setCalibrationDrawnLength] = useState<number | null>(
    null
  );

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

  const inspectorOpen =
    view === 'layout' &&
    (designer.selectedBed !== undefined || designer.selectedAnnotation !== undefined);

  function switchView(next: GardenView) {
    if (next === 'masterplan') {
      // Drawing/calibration only exist in the editor; never leave them armed.
      designer.setMode('idle');
      setCalibrationDrawnLength(null);
    }
    setView(next);
  }

  const isCalibrating = designer.mode === 'calibrating-scale';

  function startCalibration() {
    designer.setSelected(null);
    setCalibrationDrawnLength(null);
    designer.setMode('calibrating-scale');
  }

  function cancelCalibration() {
    setCalibrationDrawnLength(null);
    designer.setMode('idle');
  }

  function handleCalibrationApply(realLengthInches: number, rescaleElements: boolean) {
    if (calibrationDrawnLength !== null) {
      designer.applyCalibration(calibrationDrawnLength, realLengthInches, rescaleElements);
    }
    setCalibrationDrawnLength(null);
    designer.setMode('idle');
  }

  async function handlePickBackgroundFile(file: File) {
    setUploadError(null);
    try {
      await designer.uploadBackgroundImage(file);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Background upload failed';
      setUploadError(message);
    }
  }

  return (
    <div
      className={`grn-designer-page ${inspectorOpen ? 'has-inspector' : ''} ${
        designer.isMobile ? 'is-mobile' : ''
      }`}
    >
      <header className="grn-designer-page__header">
        <div className="grn-designer-page__title-block">
          <h1 className="grn-designer-page__title">Garden</h1>
          <p className="grn-designer-page__subtitle">
            {view === 'masterplan'
              ? 'An illustrated masterplan of your growing space — click anything to explore.'
              : 'Lay out your beds, drop in crops, and watch it come together.'}
          </p>
        </div>
        <div className="grn-view-toggle" role="group" aria-label="Garden view">
          <button
            type="button"
            className={`grn-view-toggle__btn ${
              view === 'masterplan' ? 'is-active' : ''
            }`}
            aria-pressed={view === 'masterplan'}
            onClick={() => switchView('masterplan')}
          >
            Masterplan
          </button>
          <button
            type="button"
            className={`grn-view-toggle__btn ${view === 'layout' ? 'is-active' : ''}`}
            aria-pressed={view === 'layout'}
            onClick={() => switchView('layout')}
          >
            Layout editor
          </button>
        </div>
      </header>

      {view === 'masterplan' ? (
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
          onOpenLayoutEditor={() => switchView('layout')}
          onApplyTemplate={designer.applyTemplate}
        />
      ) : (
        <>
          <GardenPropertiesBar
            canvas={designer.canvas}
            beds={designer.beds}
            annotations={designer.annotations}
            isEditable={designer.isEditable}
            isSaving={designer.isSaving}
            isMobile={designer.isMobile}
            onCanvasChange={designer.patchCanvas}
            hasBackground={Boolean(designer.canvas.backgroundImageKey)}
            onPickBackgroundFile={handlePickBackgroundFile}
            onClearBackground={() => {
              setUploadError(null);
              if (isCalibrating) cancelCalibration();
              void designer.clearBackgroundImage();
            }}
            isCalibrating={isCalibrating}
            onToggleCalibration={() => {
              if (isCalibrating) {
                cancelCalibration();
              } else {
                startCalibration();
              }
            }}
          />

          {uploadError && (
            <div className="grn-designer-page__error" role="alert">
              {uploadError}
            </div>
          )}

          <div className="grn-designer-page__layout">
            <Toolbar
              isMobile={designer.isMobile}
              mode={designer.mode}
              onAddBed={(shape) => {
                void designer.addBed(shape);
              }}
              onAddAnnotation={(presetId) => {
                void designer.addAnnotation(presetId);
              }}
              onStartDrawingPolygon={() => designer.setMode('drawing-polygon')}
              onCancelDrawingPolygon={() => designer.setMode('idle')}
              gridSnap={designer.snap}
              onGridSnapChange={designer.setSnap}
              onFitToScreen={() => canvasRef.current?.fitToScreen()}
              canUndo={designer.canUndo}
              canRedo={designer.canRedo}
              onUndo={designer.undo}
              onRedo={designer.redo}
              onToggleMeasure={() =>
                designer.setMode(designer.mode === 'measuring' ? 'idle' : 'measuring')
              }
            />

            <DesignerCanvas
              ref={canvasRef}
              canvas={designer.canvas}
              beds={designer.beds}
              annotations={designer.annotations}
              cropsByBedId={designer.cropsByBedId}
              selected={designer.selected}
              isEditable={designer.isEditable}
              mode={designer.mode}
              snap={designer.snap}
              backgroundImageUrl={designer.canvas.backgroundImageUrl}
              onSelect={designer.setSelected}
              onMoveBed={designer.moveBed}
              onResizeBed={designer.resizeBed}
              onMoveAnnotation={designer.moveAnnotation}
              onResizeAnnotation={designer.resizeAnnotation}
              onCommitPolygon={(points) => {
                void designer.commitPolygon(points);
              }}
              onCancelPolygon={() => designer.setMode('idle')}
              onUpdateBedPoints={designer.updateBedPoints}
              groupSelection={designer.groupSelection}
              onToggleSelected={designer.toggleSelected}
              onMarqueeSelect={designer.marqueeSelect}
              onMoveGroup={designer.moveSelectedGroup}
              onCalibrationCaptured={setCalibrationDrawnLength}
              onCancelCalibration={cancelCalibration}
            />

            {isCalibrating && calibrationDrawnLength !== null && (
              <CalibrateScaleModal
                canvas={designer.canvas}
                drawnLengthInches={calibrationDrawnLength}
                elementCount={designer.beds.length + designer.annotations.length}
                onApply={handleCalibrationApply}
                onCancel={cancelCalibration}
              />
            )}

            {designer.selectedBed && (
              <BedInspector
                key={designer.selectedBed.id}
                bed={designer.selectedBed}
                cropsForBed={designer.cropsByBedId.get(designer.selectedBed.id) ?? []}
                isEditable={designer.isEditable}
                isSaving={designer.isSaving}
                isMobile={designer.isMobile}
                isVertexEditing={designer.mode === 'editing-vertices'}
                onToggleVertexEditing={() =>
                  designer.setMode(
                    designer.mode === 'editing-vertices' ? 'idle' : 'editing-vertices'
                  )
                }
                onChange={(patch) => {
                  if (designer.selectedBed) {
                    designer.patchBed(designer.selectedBed.id, patch);
                  }
                }}
                onDuplicate={() => {
                  void designer.duplicateSelected();
                }}
                onDelete={() => {
                  if (designer.selectedBed) {
                    void designer.deleteBed(designer.selectedBed.id);
                  }
                }}
                onClose={() => designer.setSelected(null)}
              />
            )}

            {designer.selectedAnnotation && (
              <AnnotationInspector
                key={designer.selectedAnnotation.id}
                annotation={designer.selectedAnnotation}
                isEditable={designer.isEditable}
                isSaving={designer.isSaving}
                isMobile={designer.isMobile}
                onChange={(patch) => {
                  if (designer.selectedAnnotation) {
                    designer.patchAnnotation(designer.selectedAnnotation.id, patch);
                  }
                }}
                onDuplicate={() => {
                  void designer.duplicateSelected();
                }}
                onDelete={() => {
                  if (designer.selectedAnnotation) {
                    void designer.deleteAnnotation(designer.selectedAnnotation.id);
                  }
                }}
                onClose={() => designer.setSelected(null)}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
