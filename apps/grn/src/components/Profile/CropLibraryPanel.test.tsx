import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CropLibraryPanel } from './CropLibraryPanel';
import { listMyBeds, listMyCrops } from '../../services/api';

vi.mock('../../services/api', () => ({
  deleteMyCrop: vi.fn(),
  listMyBeds: vi.fn(),
  listMyCrops: vi.fn(),
}));

vi.mock('../Harvests/HarvestLogModal', () => ({
  HarvestLogModal: ({ cropName }: { cropName: string }) => (
    <div role="dialog" aria-label={`Harvest ${cropName}`}>Harvest {cropName}</div>
  ),
}));

describe('CropLibraryPanel deep links', () => {
  it('opens the harvest workflow for the linked crop', async () => {
    vi.mocked(listMyBeds).mockResolvedValue([]);
    vi.mocked(listMyCrops).mockResolvedValue([
      {
        id: 'crop-1',
        userId: 'grower-1',
        canonicalId: null,
        cropName: 'Tomato',
        varietyId: null,
        status: 'growing',
        visibility: 'private',
        surplusEnabled: false,
        nickname: 'Cherry tomatoes',
        defaultUnit: 'lb',
        notes: null,
        bedId: null,
        bedName: null,
        plantingDate: null,
        expectedHarvestDate: null,
        plantCount: null,
        spacingInches: null,
        pyramidTier: null,
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-01T00:00:00Z',
      },
    ]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/garden/plants?crop=crop-1&action=harvest']}>
          <CropLibraryPanel viewerUserId="grower-1" />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByRole('dialog', { name: 'Harvest Cherry tomatoes' })).toBeInTheDocument();
  });
});
