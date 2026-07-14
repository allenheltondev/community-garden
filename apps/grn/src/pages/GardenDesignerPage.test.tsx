import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGardenDesigner, type UseGardenDesignerResult } from '../hooks/useGardenDesigner';
import { GardenDesignerPage } from './GardenDesignerPage';

vi.mock('../hooks/useGardenDesigner', () => ({
  useGardenDesigner: vi.fn(),
}));

vi.mock('../components/GardenMasterplan/GardenMasterplan', () => ({
  GardenMasterplan: () => <div data-testid="garden-masterplan">Illustrated map</div>,
}));

const mockUseGardenDesigner = vi.mocked(useGardenDesigner);

function designerResult(): UseGardenDesignerResult {
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
  };
}

describe('GardenDesignerPage garden context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the bed containing a directly linked crop', async () => {
    const designer = designerResult();
    mockUseGardenDesigner.mockReturnValue(designer);

    render(
      <MemoryRouter initialEntries={['/garden?crop=crop-1']}>
        <GardenDesignerPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Map' })).toBeInTheDocument();
    await waitFor(() =>
      expect(designer.setSelected).toHaveBeenCalledWith({ kind: 'bed', id: 'bed-1' })
    );
  });
});
