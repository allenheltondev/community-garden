import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGardenDesigner, type UseGardenDesignerResult } from '../hooks/useGardenDesigner';
import { GardenDesignerPage } from './GardenDesignerPage';

vi.mock('../hooks/useGardenDesigner', () => ({
  useGardenDesigner: vi.fn(),
}));

vi.mock('../components/GardenMasterplan/GardenMasterplan', () => ({
  GardenMasterplan: (props: {
    editing?: unknown;
    tending?: {
      onAddReminder: (bed: { name: string }) => void;
      onShareCrop: (cropId: string) => void;
    };
    onLayoutDraftChange?: (hasDraft: boolean) => void;
  }) => (
    <div
      data-testid="garden-masterplan"
      data-editing={props.editing ? 'true' : 'false'}
      data-tending={props.tending ? 'true' : 'false'}
    >
      Illustrated map
      <button type="button" onClick={() => props.onLayoutDraftChange?.(true)}>
        Create layout draft
      </button>
      {props.tending && (
        <>
          <button
            type="button"
            onClick={() => props.tending?.onAddReminder({ name: 'Kitchen bed' })}
          >
            Reminder link
          </button>
          <button type="button" onClick={() => props.tending?.onShareCrop('crop-1')}>
            Share link
          </button>
        </>
      )}
    </div>
  ),
}));

const mockUseGardenDesigner = vi.mocked(useGardenDesigner);

function designerResult(overrides: Partial<UseGardenDesignerResult> = {}): UseGardenDesignerResult {
  return {
    canvas: {
      id: 'canvas-1',
      userId: 'grower-1',
      widthInches: 240,
      heightInches: 180,
      backgroundImageKey: null,
      backgroundImageUrl: null,
      backgroundOpacity: 1,
      northOffsetDeg: 0,
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-01T00:00:00Z',
    },
    beds: [
      {
        id: 'bed-1',
        userId: 'grower-1',
        name: 'Kitchen bed',
        description: null,
        sunExposure: null,
        soilType: null,
        lengthInches: 96,
        widthInches: 48,
        locationNotes: null,
        sortOrder: 0,
        bedType: 'raised',
        shape: 'rect',
        positionX: 12,
        positionY: 12,
        rotationDeg: 0,
        points: null,
        color: null,
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-01T00:00:00Z',
      },
    ],
    annotations: [],
    crops: [
      {
        id: 'crop-1',
        userId: 'grower-1',
        canonicalId: null,
        cropName: 'Tomato',
        varietyId: null,
        status: 'growing',
        visibility: 'private',
        surplusEnabled: false,
        nickname: null,
        defaultUnit: null,
        notes: null,
        bedId: 'bed-1',
        bedName: 'Kitchen bed',
        plantingDate: null,
        expectedHarvestDate: null,
        plantCount: null,
        spacingInches: null,
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-01T00:00:00Z',
      },
    ],
    cropsByBedId: new Map(),
    isLoading: false,
    loadError: null,
    selected: null,
    setSelected: vi.fn(),
    groupSelection: [],
    toggleSelected: vi.fn(),
    marqueeSelect: vi.fn(),
    moveSelectedGroup: vi.fn(),
    selectedBed: undefined,
    selectedAnnotation: undefined,
    mode: 'idle',
    setMode: vi.fn(),
    snap: '12',
    setSnap: vi.fn(),
    isMobile: false,
    isEditable: true,
    isSaving: false,
    saveError: null,
    addBed: vi.fn(),
    addCrop: vi.fn(),
    duplicateSelected: vi.fn(),
    applyTemplate: vi.fn(),
    moveBed: vi.fn(),
    resizeBed: vi.fn(),
    patchBed: vi.fn(),
    updateBedPoints: vi.fn(),
    deleteBed: vi.fn(),
    addAnnotation: vi.fn(),
    moveAnnotation: vi.fn(),
    resizeAnnotation: vi.fn(),
    patchAnnotation: vi.fn(),
    deleteAnnotation: vi.fn(),
    patchCanvas: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderPage(path = '/garden') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <GardenDesignerPage />
      <LocationProbe />
    </MemoryRouter>
  );
}

describe('GardenDesignerPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it('opens the bed containing a directly linked crop', async () => {
    const designer = designerResult();
    mockUseGardenDesigner.mockReturnValue(designer);

    renderPage('/garden?crop=crop-1');

    expect(screen.getByRole('heading', { level: 2, name: 'Map' })).toBeInTheDocument();
    await waitFor(() =>
      expect(designer.setSelected).toHaveBeenCalledWith({ kind: 'bed', id: 'bed-1' })
    );
  });

  it('starts in Tend and enables structural controls only after an explicit action', async () => {
    const user = userEvent.setup();
    mockUseGardenDesigner.mockReturnValue(designerResult());
    renderPage();

    const map = screen.getByTestId('garden-masterplan');
    expect(map).toHaveAttribute('data-tending', 'true');
    expect(map).toHaveAttribute('data-editing', 'false');
    expect(screen.getByText(/need to move beds/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit layout' }));

    expect(map).toHaveAttribute('data-tending', 'false');
    expect(map).toHaveAttribute('data-editing', 'true');
    expect(window.sessionStorage.getItem('og-grn-layout-editing')).toBe('true');
    expect(screen.queryByText(/need to move beds/i)).not.toBeInTheDocument();
  });

  it('keeps Edit layout active while navigating during the same session', () => {
    window.sessionStorage.setItem('og-grn-layout-editing', 'true');
    mockUseGardenDesigner.mockReturnValue(designerResult());
    renderPage();

    expect(screen.getByRole('button', { name: 'Done editing layout' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('garden-masterplan')).toHaveAttribute('data-editing', 'true');
  });

  it('lets a mobile keyboard user enter and exit Edit layout', async () => {
    const user = userEvent.setup();
    mockUseGardenDesigner.mockReturnValue(designerResult({ isMobile: true }));
    renderPage();

    const page = screen.getByRole('heading', { name: 'Map' }).closest('.grn-designer-page');
    expect(page).toHaveClass('is-mobile');

    const enterButton = screen.getByRole('button', { name: 'Edit layout' });
    enterButton.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('garden-masterplan')).toHaveAttribute('data-editing', 'true');

    const exitButton = screen.getByRole('button', { name: 'Done editing layout' });
    exitButton.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('garden-masterplan')).toHaveAttribute('data-editing', 'false');
  });

  it('does not leave Edit layout while a save is active', async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem('og-grn-layout-editing', 'true');
    const designer = designerResult({ isSaving: true });
    mockUseGardenDesigner.mockReturnValue(designer);
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Done editing layout' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/finish saving/i);
    expect(screen.getByTestId('garden-masterplan')).toHaveAttribute('data-editing', 'true');
    expect(designer.setMode).not.toHaveBeenCalled();
  });

  it('confirms before discarding an unapplied layout draft', async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem('og-grn-layout-editing', 'true');
    const designer = designerResult();
    mockUseGardenDesigner.mockReturnValue(designer);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();

    await user.click(screen.getByRole('button', { name: /create layout draft/i }));
    await user.click(screen.getByRole('button', { name: 'Done editing layout' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('garden-masterplan')).toHaveAttribute('data-editing', 'true');

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Done editing layout' }));
    expect(screen.getByTestId('garden-masterplan')).toHaveAttribute('data-editing', 'false');
    expect(designer.setMode).toHaveBeenCalledWith('idle');
    expect(window.sessionStorage.getItem('og-grn-layout-editing')).toBe('false');
  });

  it('creates contextual reminder and sharing links from Tend', async () => {
    const user = userEvent.setup();
    mockUseGardenDesigner.mockReturnValue(designerResult());
    renderPage();

    await user.click(screen.getByRole('button', { name: /reminder link/i }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/today/reminders?new=true&type=watering&title=Water+Kitchen+bed'
    );
  });
});
