import { useRef, useState } from 'react';
import { PlantLoader } from '../components/branding/PlantLoader';
import { BedInspector } from '../components/GardenDesigner/BedInspector';
import {
  DesignerCanvas,
  type DesignerCanvasHandle,
} from '../components/GardenDesigner/Canvas';
import { GardenPropertiesBar } from '../components/GardenDesigner/GardenPropertiesBar';
import { Toolbar } from '../components/GardenDesigner/Toolbar';
import { useGardenDesigner } from '../hooks/useGardenDesigner';

export function GardenDesignerPage() {
  const designer = useGardenDesigner();
  const canvasRef = useRef<DesignerCanvasHandle | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

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

  const inspectorOpen = designer.selectedBed !== undefined;

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
          <h1 className="grn-designer-page__title">Garden designer</h1>
          <p className="grn-designer-page__subtitle">
            Lay out your beds, drop in crops, and watch it come together.
          </p>
        </div>
        {designer.beds.length === 0 && (
          <p className="grn-designer-page__hint">
            Start by adding a bed from the toolbar on the left.
          </p>
        )}
      </header>

      <GardenPropertiesBar
        canvas={designer.canvas}
        beds={designer.beds}
        isEditable={designer.isEditable}
        isSaving={designer.isSaving}
        onCanvasChange={designer.patchCanvas}
        hasBackground={Boolean(designer.canvas.backgroundImageKey)}
        onPickBackgroundFile={handlePickBackgroundFile}
        onClearBackground={() => {
          setUploadError(null);
          void designer.clearBackgroundImage();
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
          editUnlocked={designer.editUnlocked}
          onToggleEditUnlocked={designer.toggleEditUnlocked}
          mode={designer.mode}
          onAddBed={(shape) => {
            void designer.addBed(shape);
          }}
          onStartDrawingPolygon={() => designer.setMode('drawing-polygon')}
          onCancelDrawingPolygon={() => designer.setMode('idle')}
          gridSnap={designer.snap}
          onGridSnapChange={designer.setSnap}
          onFitToScreen={() => canvasRef.current?.fitToScreen()}
        />

        <DesignerCanvas
          ref={canvasRef}
          canvas={designer.canvas}
          beds={designer.beds}
          cropsByBedId={designer.cropsByBedId}
          selectedBedId={designer.selectedBedId}
          isEditable={designer.isEditable}
          mode={designer.mode}
          snap={designer.snap}
          backgroundImageUrl={designer.canvas.backgroundImageUrl}
          onSelect={designer.setSelectedBedId}
          onMoveBed={designer.moveBed}
          onResizeBed={designer.resizeBed}
          onCommitPolygon={(points) => {
            void designer.commitPolygon(points);
          }}
          onCancelPolygon={() => designer.setMode('idle')}
        />

        {designer.selectedBed && (
          <BedInspector
            key={designer.selectedBed.id}
            bed={designer.selectedBed}
            cropsForBed={designer.cropsByBedId.get(designer.selectedBed.id) ?? []}
            isEditable={designer.isEditable}
            isSaving={designer.isSaving}
            onChange={(patch) => {
              if (designer.selectedBed) {
                designer.patchBed(designer.selectedBed.id, patch);
              }
            }}
            onDelete={() => {
              if (designer.selectedBed) {
                void designer.deleteBed(designer.selectedBed.id);
              }
            }}
            onClose={() => designer.setSelectedBedId(null)}
          />
        )}
      </div>
    </div>
  );
}
