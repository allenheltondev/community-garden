import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CropForm } from './CropForm';
import { createMyCrop, listCatalogCrops, listMyBeds } from '../../services/api';

vi.mock('../../services/api', () => ({
  createMyBed: vi.fn(),
  createMyCrop: vi.fn(),
  listCatalogCrops: vi.fn(),
  listMyBeds: vi.fn(),
}));

vi.mock('../../hooks/useGrowerCropSignals', () => ({
  useGrowerCropSignals: () => ({
    geoKey: null,
    scarcityByCropId: new Map(),
    scarceCropIds: new Set(),
    topScarce: [],
    growingCatalogCropIds: new Set(),
    isLoading: false,
    isError: false,
  }),
}));

describe('CropForm user-defined crops', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a custom crop without a catalog identifier', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const createdCrop = {
      id: 'grower-custom-1',
      userId: 'grower-1',
      canonicalId: null,
      cropName: 'Purple yard bean',
      varietyId: null,
      status: 'planning' as const,
      visibility: 'local' as const,
      surplusEnabled: false,
      nickname: null,
      defaultUnit: null,
      notes: null,
      bedId: null,
      bedName: null,
      plantingDate: null,
      expectedHarvestDate: null,
      plantCount: null,
      spacingInches: null,
      pyramidTier: null,
      createdAt: '2026-07-15T00:00:00Z',
      updatedAt: '2026-07-15T00:00:00Z',
    };

    vi.mocked(listCatalogCrops).mockResolvedValue([]);
    vi.mocked(listMyBeds).mockResolvedValue([]);
    vi.mocked(createMyCrop).mockResolvedValue(createdCrop);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <CropForm onSuccess={onSuccess} onCancel={vi.fn()} />
      </QueryClientProvider>
    );

    const picker = await screen.findByRole('combobox', { name: /what are you growing/i });
    await waitFor(() => expect(picker).not.toBeDisabled());
    await user.type(picker, 'Purple yard bean');
    await user.click(
      await screen.findByRole('option', {
        name: /add .*purple yard bean.* as a custom crop/i,
      })
    );
    await user.click(screen.getByRole('button', { name: /add to my garden/i }));

    await waitFor(() => expect(createMyCrop).toHaveBeenCalledTimes(1));
    expect(createMyCrop).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: undefined,
        cropName: 'Purple yard bean',
        status: 'planning',
      }),
      expect.anything()
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(createdCrop));
  });

  it('links a route-provided seasonal suggestion to its catalog crop', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const createdCrop = {
      id: 'grower-okra-1',
      userId: 'grower-1',
      canonicalId: 'catalog-okra',
      cropName: 'Okra',
      varietyId: null,
      status: 'planning',
      visibility: 'local',
      surplusEnabled: false,
      nickname: null,
      defaultUnit: null,
      notes: null,
      bedId: null,
      bedName: null,
      plantingDate: null,
      expectedHarvestDate: null,
      plantCount: null,
      spacingInches: null,
      pyramidTier: null,
      createdAt: '2026-07-15T00:00:00Z',
      updatedAt: '2026-07-15T00:00:00Z',
    };

    vi.mocked(listCatalogCrops).mockResolvedValue([
      {
        id: 'catalog-okra',
        slug: 'okra',
        commonName: 'Okra',
        scientificName: 'Abelmoschus esculentus',
        category: 'vegetable',
        description: null,
        pyramidTier: 2,
      },
    ]);
    vi.mocked(listMyBeds).mockResolvedValue([]);
    vi.mocked(createMyCrop).mockResolvedValue(createdCrop);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <CropForm
          initialCropName="Okra"
          onSuccess={onSuccess}
          onCancel={vi.fn()}
        />
      </QueryClientProvider>
    );

    const picker = await screen.findByRole('combobox', { name: /what are you growing/i });
    await waitFor(() => expect(picker).toHaveValue('Okra'));
    await waitFor(() => expect(picker).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: /add to my garden/i }));

    await waitFor(() => expect(createMyCrop).toHaveBeenCalledTimes(1));
    expect(createMyCrop).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'catalog-okra',
        cropName: 'Okra',
        status: 'planning',
      }),
      expect.anything()
    );
  });
});
