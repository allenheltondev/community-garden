import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  GardenAnnotation,
  GardenBed,
  GardenCanvas,
  GrowerCropItem,
} from '../../types/listing';
import { GARDEN_TEMPLATES } from '../GardenDesigner/gardenTemplates';
import { GardenMasterplan, type MasterplanEditing } from './GardenMasterplan';
import { screenDeltaToWorld } from './iso';

beforeAll(() => {
  // jsdom has no ResizeObserver; the viewport hook only needs construct/observe.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  // jsdom lacks matchMedia; IsoCritters queries prefers-reduced-motion.
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }))
  );
});

const canvas: GardenCanvas = {
  id: 'canvas-1',
  userId: 'u1',
  widthInches: 360,
  heightInches: 240,
  backgroundImageKey: null,
  backgroundImageUrl: null,
  backgroundOpacity: 0.5,
  northOffsetDeg: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function makeBed(overrides: Partial<GardenBed>): GardenBed {
  return {
    id: 'bed-1',
    userId: 'u1',
    name: 'Herb spiral',
    description: null,
    sunExposure: 'full_sun',
    soilType: 'loam,compost_amended',
    lengthInches: 96,
    widthInches: 48,
    locationNotes: null,
    sortOrder: 0,
    bedType: 'raised',
    shape: 'rect',
    positionX: 24,
    positionY: 24,
    rotationDeg: 0,
    points: null,
    color: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeAnnotation(overrides: Partial<GardenAnnotation>): GardenAnnotation {
  return {
    id: 'ann-1',
    userId: 'u1',
    label: 'Old oak',
    icon: '🌳',
    shape: 'circle',
    positionX: 200,
    positionY: 60,
    lengthInches: 60,
    widthInches: 60,
    rotationDeg: 0,
    points: null,
    color: null,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeCrop(overrides: Partial<GrowerCropItem>): GrowerCropItem {
  return {
    id: 'crop-1',
    userId: 'u1',
    canonicalId: null,
    cropName: 'Tomato',
    varietyId: null,
    status: 'active',
    visibility: 'private',
    surplusEnabled: false,
    nickname: null,
    defaultUnit: null,
    notes: null,
    bedId: 'bed-1',
    bedName: 'Herb spiral',
    plantingDate: null,
    expectedHarvestDate: null,
    plantCount: 4,
    spacingInches: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderMasterplan(args?: {
  beds?: GardenBed[];
  annotations?: GardenAnnotation[];
  crops?: GrowerCropItem[];
  selected?: { kind: 'bed' | 'annotation'; id: string } | null;
  onSelect?: (next: unknown) => void;
  onPatchBed?: (
    bedId: string,
    patch: Partial<GardenBed>
  ) => void | Promise<boolean>;
  onPatchAnnotation?: (
    annotationId: string,
    patch: Partial<GardenAnnotation>
  ) => void | Promise<boolean>;
  onApplyTemplate?: (templateId: string) => Promise<void>;
  editing?: Partial<MasterplanEditing>;
}) {
  const beds = args?.beds ?? [makeBed({})];
  const annotations = args?.annotations ?? [makeAnnotation({})];
  const crops = args?.crops ?? [makeCrop({})];
  const cropsByBedId = new Map<string, GrowerCropItem[]>();
  for (const crop of crops) {
    if (!crop.bedId) continue;
    cropsByBedId.set(crop.bedId, [...(cropsByBedId.get(crop.bedId) ?? []), crop]);
  }
  const selected = args?.selected ?? null;
  const editing: MasterplanEditing | undefined = args?.editing
    ? {
        snap: 'off',
        onSnapChange: () => {},
        mode: 'idle',
        onSetMode: () => {},
        onMoveBed: () => {},
        onMoveAnnotation: () => {},
        onResizeBed: () => {},
        onResizeAnnotation: () => {},
        onUpdateBedPoints: () => {},
        onAddBed: () => {},
        onAddAnnotation: () => {},
        onDeleteBed: () => {},
        onDeleteAnnotation: () => {},
        onAddCrop: async () => {},
        onDuplicate: () => {},
        onPatchCanvas: () => {},
        canUndo: false,
        canRedo: false,
        onUndo: () => {},
        onRedo: () => {},
        isSaving: false,
        saveError: null,
        ...args.editing,
      }
    : undefined;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GardenMasterplan
        canvas={canvas}
        beds={beds}
        annotations={annotations}
        cropsByBedId={cropsByBedId}
        selected={selected as never}
        selectedBed={
          selected?.kind === 'bed' ? beds.find((b) => b.id === selected.id) : undefined
        }
        selectedAnnotation={
          selected?.kind === 'annotation'
            ? annotations.find((a) => a.id === selected.id)
            : undefined
        }
        onSelect={(args?.onSelect ?? (() => {})) as never}
        onPatchBed={args?.onPatchBed ?? (() => {})}
        onPatchAnnotation={args?.onPatchAnnotation ?? (() => {})}
        onApplyTemplate={args?.onApplyTemplate ?? (async () => {})}
        editing={editing}
      />
    </QueryClientProvider>
  );
}

describe('GardenMasterplan', () => {
  it('renders every bed and annotation as a focusable, labelled map element', () => {
    renderMasterplan();
    expect(
      screen.getByRole('button', { name: /herb spiral \(raised bed, 1 crop\)/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /old oak \(tree\)/i })).toBeInTheDocument();
  });

  it('selects a bed when its map element is clicked', async () => {
    const onSelect = vi.fn();
    renderMasterplan({ onSelect });
    await userEvent.click(
      screen.getByRole('button', { name: /herb spiral/i })
    );
    expect(onSelect).toHaveBeenCalledWith({ kind: 'bed', id: 'bed-1' });
  });

  it('supports keyboard selection with Enter', async () => {
    const onSelect = vi.fn();
    renderMasterplan({ onSelect });
    const element = screen.getByRole('button', { name: /old oak/i });
    element.focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith({ kind: 'annotation', id: 'ann-1' });
  });

  it('shows the floating detail panel for the selected bed', () => {
    renderMasterplan({ selected: { kind: 'bed', id: 'bed-1' } });
    const panel = screen.getByTestId('masterplan-detail-panel');
    expect(panel).toHaveTextContent('Herb spiral');
    expect(panel).toHaveTextContent(/raised bed/i);
    expect(panel).toHaveTextContent('Full sun');
    expect(panel).toHaveTextContent('Loam');
    expect(panel).toHaveTextContent('Compost-amended');
    expect(panel).toHaveTextContent('Tomato');
    expect(panel).toHaveTextContent('×4');
  });

  it('shows a capacity line in the detail panel when crops have spacing data', () => {
    renderMasterplan({
      // 96×48 bed → 4147.2 usable sq in; 4 plants × 12in spacing = 576 → ~14%.
      crops: [makeCrop({ plantCount: 4, spacingInches: 12 })],
      selected: { kind: 'bed', id: 'bed-1' },
    });
    const panel = screen.getByTestId('masterplan-detail-panel');
    expect(panel).toHaveTextContent('Using ~14% of this bed · Room for more');
  });

  it('flags an overplanted bed in the detail panel', () => {
    renderMasterplan({
      // 40 plants × 144 sq in = 5760 > 4147.2 usable → 139%.
      crops: [makeCrop({ plantCount: 40, spacingInches: 12 })],
      selected: { kind: 'bed', id: 'bed-1' },
    });
    const panel = screen.getByTestId('masterplan-detail-panel');
    expect(panel).toHaveTextContent('Using ~139% of this bed · Overplanted');
  });

  it('omits the capacity line when no crop has spacing data', () => {
    renderMasterplan({
      crops: [makeCrop({ plantCount: 4, spacingInches: null })],
      selected: { kind: 'bed', id: 'bed-1' },
    });
    const panel = screen.getByTestId('masterplan-detail-panel');
    expect(panel).not.toHaveTextContent(/of this bed/);
  });

  it('keeps tabbed dimension edits together and applies one complete payload', async () => {
    const user = userEvent.setup();
    const onPatchBed = vi.fn().mockResolvedValue(true);
    renderMasterplan({
      selected: { kind: 'bed', id: 'bed-1' },
      onPatchBed,
      editing: {},
    });
    const lengthField = screen.getByLabelText(/length \(in\)/i);
    await user.clear(lengthField);
    await user.type(lengthField, '120');
    await user.tab();

    expect(screen.getByLabelText(/length \(in\)/i)).toHaveValue(120);
    expect(screen.getByLabelText(/width \(in\)/i)).toHaveFocus();
    expect(onPatchBed).not.toHaveBeenCalled();

    const widthField = screen.getByLabelText(/width \(in\)/i);
    await user.clear(widthField);
    await user.type(widthField, '72');
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(onPatchBed).toHaveBeenCalledWith('bed-1', {
        lengthInches: 120,
        widthInches: 72,
        rotationDeg: 0,
      })
    );
  });

  it('keeps an invalid dimension editable with an actionable error', async () => {
    const user = userEvent.setup();
    const onPatchBed = vi.fn().mockResolvedValue(true);
    renderMasterplan({
      selected: { kind: 'bed', id: 'bed-1' },
      onPatchBed,
      editing: {},
    });

    const lengthField = screen.getByLabelText(/length \(in\)/i);
    await user.clear(lengthField);
    await user.click(screen.getByRole('button', { name: /apply dimensions/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/valid length/i);
    expect(lengthField).toHaveValue(null);
    expect(onPatchBed).not.toHaveBeenCalled();
  });

  it('retains the complete dimension draft when saving fails', async () => {
    const user = userEvent.setup();
    const onPatchBed = vi.fn().mockResolvedValue(false);
    renderMasterplan({
      selected: { kind: 'bed', id: 'bed-1' },
      onPatchBed,
      editing: {},
    });

    const lengthField = screen.getByLabelText(/length \(in\)/i);
    await user.clear(lengthField);
    await user.type(lengthField, '120');
    await user.click(screen.getByRole('button', { name: /apply dimensions/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t save/i);
    expect(lengthField).toHaveValue(120);
    expect(screen.getByRole('button', { name: /apply dimensions/i })).toBeEnabled();
  });

  it('applies overall garden width and height as one mobile-friendly action', async () => {
    const user = userEvent.setup();
    const onPatchCanvas = vi.fn().mockResolvedValue(true);
    renderMasterplan({ editing: { onPatchCanvas } });

    const widthField = screen.getByLabelText(/garden width/i);
    await user.clear(widthField);
    await user.type(widthField, '40 ft');
    await user.tab();
    expect(onPatchCanvas).not.toHaveBeenCalled();

    const heightField = screen.getByLabelText(/garden height/i);
    await user.clear(heightField);
    await user.type(heightField, '30 ft');
    await user.click(screen.getByRole('button', { name: /apply size/i }));

    await waitFor(() =>
      expect(onPatchCanvas).toHaveBeenCalledWith({
        widthInches: 480,
        heightInches: 360,
      })
    );
  });

  it('offers precise resize/rotate handles only for an editable selection', () => {
    const { container, rerender } = renderMasterplan({
      selected: { kind: 'bed', id: 'bed-1' },
    });
    // Read-only: no on-scene transform handles.
    expect(container.querySelector('.mp-transform')).not.toBeInTheDocument();
    rerender(<></>);
    const editable = renderMasterplan({
      selected: { kind: 'bed', id: 'bed-1' },
      editing: {},
    });
    expect(editable.container.querySelector('.mp-transform')).toBeInTheDocument();
  });

  it('closes the detail panel via its close button', async () => {
    const onSelect = vi.fn();
    renderMasterplan({ selected: { kind: 'bed', id: 'bed-1' }, onSelect });
    await userEvent.click(screen.getByRole('button', { name: /close details/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('gives an unselected editable garden a clear next step', async () => {
    const onAddBed = vi.fn();
    renderMasterplan({ editing: { onAddBed } });

    expect(screen.getByText(/your garden at a glance/i)).toBeInTheDocument();
    expect(screen.getByText(/1 bed.*1 landmark.*1 bed planted/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /add a raised bed/i }));

    expect(onAddBed).toHaveBeenCalledWith('rect');
  });

  it('keeps alternate bed shapes available without crowding the design dock', () => {
    const onAddBed = vi.fn();
    renderMasterplan({ editing: { onAddBed } });

    fireEvent.change(screen.getByLabelText(/add a different bed shape/i), {
      target: { value: 'circle' },
    });

    expect(onAddBed).toHaveBeenCalledWith('circle');
  });

  it('shows an inviting empty state when the garden has no elements', () => {
    renderMasterplan({ beds: [], annotations: [], crops: [] });
    expect(screen.getByText(/your property, beautifully mapped/i)).toBeInTheDocument();
  });

  it('offers starter template cards in the empty state', () => {
    renderMasterplan({ beds: [], annotations: [], crops: [] });
    expect(screen.getByText(/start from a template/i)).toBeInTheDocument();
    for (const template of GARDEN_TEMPLATES) {
      expect(screen.getByText(template.name)).toBeInTheDocument();
      expect(screen.getByText(template.description)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button', { name: /use this layout/i })).toHaveLength(
      GARDEN_TEMPLATES.length
    );
  });

  it('offers a start-from-scratch action in the empty state when editable', async () => {
    const onAddBed = vi.fn();
    renderMasterplan({ beds: [], annotations: [], crops: [], editing: { onAddBed } });
    await userEvent.click(screen.getByRole('button', { name: /add a raised bed/i }));
    expect(onAddBed).toHaveBeenCalledWith('rect');
  });

  it('does not offer templates once the garden has elements', () => {
    renderMasterplan();
    expect(screen.queryByText(/start from a template/i)).not.toBeInTheDocument();
  });

  it('applies the clicked template by id', async () => {
    const onApplyTemplate = vi.fn(async () => {});
    renderMasterplan({ beds: [], annotations: [], crops: [], onApplyTemplate });
    const buttons = screen.getAllByRole('button', { name: /use this layout/i });
    await userEvent.click(buttons[1]);
    expect(onApplyTemplate).toHaveBeenCalledTimes(1);
    expect(onApplyTemplate).toHaveBeenCalledWith(GARDEN_TEMPLATES[1].id);
  });

  it('disables all template cards and shows progress while applying', async () => {
    let resolveApply: () => void = () => {};
    const onApplyTemplate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveApply = resolve;
        })
    );
    renderMasterplan({ beds: [], annotations: [], crops: [], onApplyTemplate });
    const buttons = screen.getAllByRole('button', { name: /use this layout/i });
    await userEvent.click(buttons[0]);

    expect(screen.getByText(/planting your starter garden/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /planting/i })).toBeDisabled();
    for (const button of screen.getAllByRole('button', { name: /use this layout/i })) {
      expect(button).toBeDisabled();
    }

    resolveApply();
    await waitFor(() =>
      expect(screen.queryByText(/planting your starter garden/i)).not.toBeInTheDocument()
    );
  });

  it('paints elements back-to-front by depth when no layer order is set', () => {
    const { container } = renderMasterplan({
      beds: [
        // South-east bed is "nearer" the camera, so it paints last.
        makeBed({ id: 'near', name: 'Near bed', positionX: 200, positionY: 160 }),
        makeBed({ id: 'far', name: 'Far bed', positionX: 24, positionY: 24 }),
      ],
      annotations: [],
      crops: [],
    });
    const labels = Array.from(container.querySelectorAll('.mp-el')).map((el) =>
      el.getAttribute('aria-label')
    );
    expect(labels[0]).toMatch(/far bed/i);
    expect(labels[1]).toMatch(/near bed/i);
  });

  it('lets sortOrder override the geometric paint order', () => {
    const { container } = renderMasterplan({
      beds: [
        makeBed({ id: 'near', name: 'Near bed', positionX: 200, positionY: 160 }),
        // Raised a layer, the far bed now paints on top of the near one.
        makeBed({ id: 'far', name: 'Far bed', positionX: 24, positionY: 24, sortOrder: 1 }),
      ],
      annotations: [],
      crops: [],
    });
    const labels = Array.from(container.querySelectorAll('.mp-el')).map((el) =>
      el.getAttribute('aria-label')
    );
    expect(labels[0]).toMatch(/near bed/i);
    expect(labels[1]).toMatch(/far bed/i);
  });

  it('lets a raised flat annotation paint above beds', () => {
    const { container } = renderMasterplan({
      beds: [makeBed({})],
      annotations: [
        makeAnnotation({
          id: 'path-1',
          label: 'Gravel path',
          icon: '🛤️',
          shape: 'line',
          points: [
            { x: 0, y: 0 },
            { x: 240, y: 0 },
          ],
          sortOrder: 1,
        }),
      ],
      crops: [],
    });
    const labels = Array.from(container.querySelectorAll('.mp-el')).map((el) =>
      el.getAttribute('aria-label')
    );
    // Paths normally paint first (under everything); sortOrder lifts it above.
    expect(labels[0]).toMatch(/herb spiral/i);
    expect(labels[1]).toMatch(/gravel path/i);
  });

  it('changes stacking order from the detail panel', async () => {
    const onPatchBed = vi.fn();
    renderMasterplan({ selected: { kind: 'bed', id: 'bed-1' }, onPatchBed });
    await userEvent.click(screen.getByRole('button', { name: /bring forward/i }));
    expect(onPatchBed).toHaveBeenCalledWith('bed-1', { sortOrder: 1 });
    await userEvent.click(screen.getByRole('button', { name: /send backward/i }));
    expect(onPatchBed).toHaveBeenCalledWith('bed-1', { sortOrder: -1 });
  });

  it('changes annotation stacking order from the detail panel', async () => {
    const onPatchAnnotation = vi.fn();
    renderMasterplan({
      selected: { kind: 'annotation', id: 'ann-1' },
      onPatchAnnotation,
    });
    await userEvent.click(screen.getByRole('button', { name: /send backward/i }));
    expect(onPatchAnnotation).toHaveBeenCalledWith('ann-1', { sortOrder: -1 });
  });

  it('renders a polygon bed with custom vertices in the scene', () => {
    renderMasterplan({
      beds: [
        makeBed({
          id: 'poly',
          name: 'L-shaped bed',
          shape: 'polygon',
          points: [
            { x: 0, y: 0 },
            { x: 96, y: 0 },
            { x: 96, y: 24 },
            { x: 48, y: 24 },
            { x: 48, y: 48 },
            { x: 0, y: 48 },
          ],
        }),
      ],
      annotations: [],
      crops: [],
    });
    expect(
      screen.getByRole('button', { name: /l-shaped bed \(raised bed\)/i })
    ).toBeInTheDocument();
  });

  it('reshapes a custom bed via the vertex editor and commits the new points', async () => {
    const onUpdateBedPoints = vi.fn();
    const points = [
      { x: 0, y: 0 },
      { x: 96, y: 0 },
      { x: 96, y: 48 },
      { x: 0, y: 48 },
    ];
    const { container } = renderMasterplan({
      beds: [makeBed({ id: 'poly', name: 'Custom bed', shape: 'polygon', points })],
      annotations: [],
      crops: [],
      selected: { kind: 'bed', id: 'poly' },
      editing: { mode: 'editing-vertices', onUpdateBedPoints },
    });
    // The reshaping overlay appears with a handle per vertex.
    const overlay = container.querySelector('.mp-vertex');
    expect(overlay).toBeInTheDocument();
    expect(overlay!.querySelectorAll('.mp-vertex__handle')).toHaveLength(points.length);
    // Splitting an edge via its midpoint commits one extra vertex.
    const midpoint = container.querySelector('.mp-vertex__midpoint')!;
    fireEvent.pointerDown(midpoint, { pointerId: 1, button: 0 });
    expect(onUpdateBedPoints).toHaveBeenCalledTimes(1);
    expect(onUpdateBedPoints.mock.calls[0][0]).toBe('poly');
    expect(onUpdateBedPoints.mock.calls[0][1]).toHaveLength(points.length + 1);
  });

  describe('season scrubber', () => {
    const summerCrop = makeCrop({
      id: 'tomato',
      cropName: 'Tomato',
      plantingDate: '2026-05-10',
      expectedHarvestDate: '2026-09-20',
    });

    it('defaults to "All season" and shows every crop, dates or not', () => {
      renderMasterplan({ crops: [summerCrop, makeCrop({ id: 'undated' })] });
      expect(screen.getByRole('button', { name: 'All season' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(
        screen.getByRole('button', { name: /herb spiral \(raised bed, 2 crops\)/i })
      ).toBeInTheDocument();
    });

    it('hides crops outside their planting-to-harvest window in the scrubbed month', async () => {
      renderMasterplan({ crops: [summerCrop] });
      await userEvent.click(screen.getByRole('button', { name: 'March' }));
      // Bed renders as bare soil: the label no longer mentions crops.
      expect(
        screen.getByRole('button', { name: /^herb spiral \(raised bed\)$/i })
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'July' }));
      expect(
        screen.getByRole('button', { name: /herb spiral \(raised bed, 1 crop\)/i })
      ).toBeInTheDocument();
    });

    it('keeps undated crops standing all year', async () => {
      renderMasterplan({ crops: [makeCrop({ id: 'undated' })] });
      await userEvent.click(screen.getByRole('button', { name: 'February' }));
      expect(
        screen.getByRole('button', { name: /herb spiral \(raised bed, 1 crop\)/i })
      ).toBeInTheDocument();
    });

    it('restores the full map when returning to "All season"', async () => {
      renderMasterplan({ crops: [summerCrop] });
      await userEvent.click(screen.getByRole('button', { name: 'March' }));
      await userEvent.click(screen.getByRole('button', { name: 'All season' }));
      expect(
        screen.getByRole('button', { name: /herb spiral \(raised bed, 1 crop\)/i })
      ).toBeInTheDocument();
    });

    it('glows crops in their harvest month and counts them in the detail panel', async () => {
      const { container } = renderMasterplan({
        crops: [summerCrop],
        selected: { kind: 'bed', id: 'bed-1' },
      });
      expect(container.querySelector('.mp-crop--harvest')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'September' }));
      expect(container.querySelector('.mp-crop--harvest')).toBeInTheDocument();
      expect(screen.getByTestId('masterplan-detail-panel')).toHaveTextContent(
        '1 crop ready to harvest in September'
      );
      await userEvent.click(screen.getByRole('button', { name: 'July' }));
      expect(container.querySelector('.mp-crop--harvest')).not.toBeInTheDocument();
      expect(screen.getByTestId('masterplan-detail-panel')).not.toHaveTextContent(
        /ready to harvest/i
      );
    });
  });

  describe('sun shadows', () => {
    it('defaults to noon shadows cast onto the ground layer', () => {
      const { container } = renderMasterplan();
      expect(
        screen.getByRole('button', { name: /midday sun/i })
      ).toHaveAttribute('aria-pressed', 'true');
      expect(container.querySelector('.mp-sun-shadows')).toBeInTheDocument();
    });

    it('can switch sun times or turn shadows off', async () => {
      const { container } = renderMasterplan();
      await userEvent.click(screen.getByRole('button', { name: /morning sun/i }));
      expect(container.querySelector('.mp-sun-shadows')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /hide sun shadows/i }));
      expect(container.querySelector('.mp-sun-shadows')).not.toBeInTheDocument();
    });

    it('casts no shadows when nothing has height', () => {
      const { container } = renderMasterplan({
        beds: [makeBed({ bedType: 'in_ground' })],
        annotations: [],
        crops: [],
      });
      expect(container.querySelector('.mp-sun-shadows')).not.toBeInTheDocument();
    });

    it('warns when a full-sun bed sits mostly in noon shade', () => {
      const bed = makeBed({
        positionX: 40,
        positionY: 60,
        lengthInches: 48,
        widthInches: 24,
        sunExposure: 'full_sun',
      });
      const shed = makeAnnotation({
        id: 'shed',
        label: 'Tool shed',
        icon: '🏚️',
        shape: 'rect',
        positionX: 0,
        positionY: 88,
        lengthInches: 160,
        widthInches: 96,
      });
      renderMasterplan({
        beds: [bed],
        annotations: [shed],
        crops: [],
        selected: { kind: 'bed', id: 'bed-1' },
      });
      expect(screen.getByTestId('masterplan-detail-panel')).toHaveTextContent(
        /labeled full sun, but sits mostly in shade at midday/i
      );
    });

    it('shows no shade warning for an unshaded bed', () => {
      renderMasterplan({
        annotations: [],
        selected: { kind: 'bed', id: 'bed-1' },
      });
      expect(screen.getByTestId('masterplan-detail-panel')).not.toHaveTextContent(
        /mostly in shade/i
      );
    });
  });

  describe('ambient critters', () => {
    it('renders an aria-hidden decorative critter layer for a lively garden', () => {
      const { container } = renderMasterplan({
        annotations: [
          makeAnnotation({ id: 'coop', label: 'Chicken coop', icon: '🐔', shape: 'rect' }),
        ],
      });
      const layer = container.querySelector('.mp-critters');
      expect(layer).toBeInTheDocument();
      expect(layer).toHaveAttribute('aria-hidden', 'true');
      // Coop + planted bed → one flyer and the chicken, never more.
      expect(layer!.querySelectorAll('.mp-critter')).toHaveLength(2);
    });

    it('renders no critters for an empty garden', () => {
      const { container } = renderMasterplan({ beds: [], annotations: [], crops: [] });
      expect(container.querySelector('.mp-critters')).not.toBeInTheDocument();
    });
  });

  it('labels annotation kinds for assistive tech', () => {
    renderMasterplan({
      annotations: [
        makeAnnotation({ id: 'gh', label: 'Glass house', icon: '🪴' }),
        makeAnnotation({ id: 'fence', label: 'Back fence', icon: '🚧', shape: 'line' }),
      ],
    });
    expect(
      screen.getByRole('button', { name: /glass house \(greenhouse\)/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /back fence \(fence\)/i })
    ).toBeInTheDocument();
  });

  describe('editable plan', () => {
    it('shows the design bar only when editing is enabled', () => {
      const { rerender } = renderMasterplan();
      expect(
        screen.queryByRole('toolbar', { name: /design tools/i })
      ).not.toBeInTheDocument();
      rerender(<></>);
      renderMasterplan({ editing: {} });
      expect(
        screen.getByRole('toolbar', { name: /design tools/i })
      ).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /add a landmark/i })).toBeInTheDocument();
    });

    it('marks elements draggable and commits a dragged bed to onMoveBed', () => {
      const onMoveBed = vi.fn();
      renderMasterplan({ editing: { onMoveBed } });
      const bed = screen.getByRole('button', { name: /herb spiral/i });
      expect(bed).toHaveClass('mp-el--draggable');

      // jsdom has no layout/CTM, so client deltas map 1:1 to scene units.
      fireEvent.pointerDown(bed, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(bed, { pointerId: 1, clientX: 150, clientY: 130 });
      fireEvent.pointerUp(bed, { pointerId: 1, clientX: 150, clientY: 130 });

      const world = screenDeltaToWorld(50, 30);
      // Base bed position is (24, 24); the move adds the unprojected delta.
      expect(onMoveBed).toHaveBeenCalledTimes(1);
      expect(onMoveBed).toHaveBeenCalledWith(
        'bed-1',
        Math.round(24 + world.x),
        Math.round(24 + world.y)
      );
    });

    it('treats a press without movement as a selection, not a move', () => {
      const onMoveBed = vi.fn();
      const onSelect = vi.fn();
      renderMasterplan({ editing: { onMoveBed }, onSelect });
      const bed = screen.getByRole('button', { name: /herb spiral/i });
      fireEvent.pointerDown(bed, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
      fireEvent.pointerUp(bed, { pointerId: 1, clientX: 101, clientY: 100 });
      expect(onMoveBed).not.toHaveBeenCalled();
      expect(onSelect).toHaveBeenCalledWith({ kind: 'bed', id: 'bed-1' });
    });

    it('shows a live size readout while resizing the selected element', () => {
      const { container } = renderMasterplan({
        selected: { kind: 'bed', id: 'bed-1' },
        editing: {},
      });
      const handle = container.querySelector('.mp-transform__resize')!;
      expect(container.querySelector('[data-testid="transform-readout"]')).toBeNull();
      fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 200, clientY: 200 });
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 260, clientY: 230 });
      expect(
        container.querySelector('[data-testid="transform-readout"]')
      ).toBeInTheDocument();
    });

    it('double-clicking a custom-shape bed enters vertex editing', () => {
      const onSetMode = vi.fn();
      const onSelect = vi.fn();
      renderMasterplan({
        beds: [makeBed({ id: 'poly', name: 'Custom bed', shape: 'polygon',
          points: [
            { x: 0, y: 0 },
            { x: 96, y: 0 },
            { x: 96, y: 48 },
            { x: 0, y: 48 },
          ] })],
        annotations: [],
        crops: [],
        onSelect,
        editing: { onSetMode },
      });
      fireEvent.doubleClick(screen.getByRole('button', { name: /custom bed/i }));
      expect(onSelect).toHaveBeenCalledWith({ kind: 'bed', id: 'poly' });
      expect(onSetMode).toHaveBeenCalledWith('editing-vertices');
    });
  });
});
