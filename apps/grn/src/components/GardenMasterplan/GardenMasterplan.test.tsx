import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  GardenAnnotation,
  GardenBed,
  GardenCanvas,
  GrowerCropItem,
} from '../../types/listing';
import { GardenMasterplan } from './GardenMasterplan';

beforeAll(() => {
  // jsdom has no ResizeObserver; the viewport hook only needs construct/observe.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
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
  onPatchBed?: (bedId: string, patch: Partial<GardenBed>) => void;
  onPatchAnnotation?: (annotationId: string, patch: Partial<GardenAnnotation>) => void;
  onOpenLayoutEditor?: () => void;
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
  return render(
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
      onOpenLayoutEditor={args?.onOpenLayoutEditor ?? (() => {})}
    />
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

  it('jumps to the layout editor from the detail panel', async () => {
    const onOpenLayoutEditor = vi.fn();
    renderMasterplan({
      selected: { kind: 'bed', id: 'bed-1' },
      onOpenLayoutEditor,
    });
    await userEvent.click(
      screen.getByRole('button', { name: /edit in layout editor/i })
    );
    expect(onOpenLayoutEditor).toHaveBeenCalled();
  });

  it('closes the detail panel via its close button', async () => {
    const onSelect = vi.fn();
    renderMasterplan({ selected: { kind: 'bed', id: 'bed-1' }, onSelect });
    await userEvent.click(screen.getByRole('button', { name: /close details/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('shows an inviting empty state when the garden has no elements', () => {
    const onOpenLayoutEditor = vi.fn();
    renderMasterplan({ beds: [], annotations: [], crops: [], onOpenLayoutEditor });
    expect(screen.getByText(/your property, beautifully mapped/i)).toBeInTheDocument();
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
});
