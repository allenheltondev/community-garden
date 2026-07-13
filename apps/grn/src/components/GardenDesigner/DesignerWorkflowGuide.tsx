import type { GardenAnnotation, GardenBed } from '../../types/listing';
import type { DesignerMode } from './Toolbar';

interface DesignerWorkflowGuideProps {
  mode: DesignerMode;
  selectedBed?: GardenBed;
  selectedAnnotation?: GardenAnnotation;
  onAddBed: () => void;
  onCancelMode: () => void;
}

/**
 * A small piece of in-context guidance for the precision editor. The canvas
 * is intentionally powerful, so this keeps the next action visible without
 * turning the editor into a multi-step wizard or obscuring the plan itself.
 */
export function DesignerWorkflowGuide({
  mode,
  selectedBed,
  selectedAnnotation,
  onAddBed,
  onCancelMode,
}: DesignerWorkflowGuideProps) {
  if (mode === 'drawing-polygon') {
    return (
      <section className="grn-designer-workflow is-mode" aria-label="Current design step">
        <p className="grn-designer-workflow__eyebrow">Drawing a custom bed</p>
        <p className="grn-designer-workflow__copy">
          Tap to place each corner. Double-tap the last point to finish the shape.
        </p>
        <button type="button" className="grn-designer-workflow__action" onClick={onCancelMode}>
          Cancel drawing
        </button>
      </section>
    );
  }

  if (mode === 'measuring') {
    return (
      <section className="grn-designer-workflow is-mode" aria-label="Current design step">
        <p className="grn-designer-workflow__eyebrow">Measuring distance</p>
        <p className="grn-designer-workflow__copy">
          Click two points on the plan to measure the space between them.
        </p>
        <button type="button" className="grn-designer-workflow__action" onClick={onCancelMode}>
          Stop measuring
        </button>
      </section>
    );
  }

  if (mode === 'calibrating-scale') {
    return (
      <section className="grn-designer-workflow is-mode" aria-label="Current design step">
        <p className="grn-designer-workflow__eyebrow">Calibrating your plan</p>
        <p className="grn-designer-workflow__copy">
          Draw a line across something with a known length, then tell us how long it is.
        </p>
        <button type="button" className="grn-designer-workflow__action" onClick={onCancelMode}>
          Cancel calibration
        </button>
      </section>
    );
  }

  if (mode === 'editing-vertices') {
    return (
      <section className="grn-designer-workflow is-mode" aria-label="Current design step">
        <p className="grn-designer-workflow__eyebrow">Editing a custom shape</p>
        <p className="grn-designer-workflow__copy">
          Drag a point to reshape it. When it looks right, finish editing to continue.
        </p>
        <button type="button" className="grn-designer-workflow__action" onClick={onCancelMode}>
          Finish editing
        </button>
      </section>
    );
  }

  if (selectedBed) {
    return (
      <section className="grn-designer-workflow" aria-label="Current design step">
        <p className="grn-designer-workflow__eyebrow">Bed selected</p>
        <p className="grn-designer-workflow__title">{selectedBed.name}</p>
        <p className="grn-designer-workflow__copy">
          Drag to reposition it, or use the details panel to plant, resize, and refine it.
        </p>
      </section>
    );
  }

  if (selectedAnnotation) {
    return (
      <section className="grn-designer-workflow" aria-label="Current design step">
        <p className="grn-designer-workflow__eyebrow">Landmark selected</p>
        <p className="grn-designer-workflow__title">{selectedAnnotation.label}</p>
        <p className="grn-designer-workflow__copy">
          Drag to reposition it, or use the details panel to refine its place in your plan.
        </p>
      </section>
    );
  }

  return (
    <section className="grn-designer-workflow" aria-label="Current design step">
      <p className="grn-designer-workflow__eyebrow">Start arranging</p>
      <p className="grn-designer-workflow__copy">
        Add a bed, then drag it into place. Select anything on the plan whenever you want to refine it.
      </p>
      <button type="button" className="grn-designer-workflow__action" onClick={onAddBed}>
        Add a raised bed
      </button>
    </section>
  );
}
