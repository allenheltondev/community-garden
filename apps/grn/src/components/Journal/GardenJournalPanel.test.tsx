import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GardenJournalPanel } from './GardenJournalPanel';

const getGardenJournal = vi.hoisted(() => vi.fn());
const createJournalNote = vi.hoisted(() => vi.fn());
const deleteJournalNote = vi.hoisted(() => vi.fn());
const requestJournalPhotoUpload = vi.hoisted(() => vi.fn());
const uploadJournalPhoto = vi.hoisted(() => vi.fn());

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>();
  return {
    ...actual,
    getGardenJournal,
    createJournalNote,
    deleteJournalNote,
    requestJournalPhotoUpload,
    uploadJournalPhoto,
  };
});

const summary = {
  season: 2026,
  plantedCount: 2,
  harvestCount: 1,
  reminderCompletionCount: 3,
  completedShareCount: 1,
  foodSharedBeforeExpiryCount: 1,
  activeMonthCount: 4,
  explanation: 'Built from the garden activity you recorded.',
  explanationSource: 'recorded_facts' as const,
  isAiGenerated: false as const,
};

function renderPanel(path = '/garden/journal?season=2026') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <GardenJournalPanel />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('GardenJournalPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('shows a private factual summary and source-linked timeline', async () => {
    getGardenJournal.mockResolvedValue({
      season: 2026,
      summary,
      entries: [{
        id: 'harvest:h1', kind: 'harvest', occurredAt: '2026-07-12',
        title: 'Harvested tomatoes', detail: 'A harvest record was saved.',
        sourceType: 'harvest', sourceId: 'h1',
        sourcePath: '/garden/plants?crop=c1&action=harvest&harvest=h1',
        isPrivate: true, manual: false, photoUrl: null,
      }],
    });

    renderPanel();

    expect(await screen.findByText('Harvested tomatoes')).toBeInTheDocument();
    expect(screen.getByText(/not a score, ranking, or AI estimate/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open source/i })).toHaveAttribute(
      'href', '/garden/plants?crop=c1&action=harvest&harvest=h1'
    );
  });

  it('gives a first-season path when no activity exists', async () => {
    getGardenJournal.mockResolvedValue({ season: 2026, summary: { ...summary, plantedCount: 0 }, entries: [] });

    renderPanel();

    expect(await screen.findByText(/your first season entry starts here/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add a plant/i })).toBeInTheDocument();
  });

  it('moves between seasons and loads the selected year', async () => {
    getGardenJournal.mockImplementation(async (season: number) => ({
      season,
      summary: { ...summary, season },
      entries: [],
    }));
    renderPanel();
    expect(await screen.findByRole('heading', { name: '2026 season' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /previous year/i }));

    expect(await screen.findByRole('heading', { name: '2025 season' })).toBeInTheDocument();
    await waitFor(() => expect(getGardenJournal).toHaveBeenCalledWith(2025));
  });

  it('saves a private note with an idempotency key', async () => {
    getGardenJournal.mockResolvedValue({ season: 2026, summary, entries: [] });
    createJournalNote.mockResolvedValue({
      id: 'note:n1', kind: 'note', occurredAt: '2026-07-14', title: 'Ladybugs arrived',
      detail: null, sourceType: 'note', sourceId: 'n1', sourcePath: null,
      isPrivate: true, manual: true, photoUrl: null,
    });
    renderPanel();
    await screen.findByText(/your first season entry starts here/i);

    await userEvent.type(screen.getByLabelText(/^title$/i), 'Ladybugs arrived');
    await userEvent.click(screen.getByRole('button', { name: /save private note/i }));

    await waitFor(() => expect(createJournalNote).toHaveBeenCalledTimes(1));
    expect(createJournalNote.mock.calls[0][0]).toMatchObject({ title: 'Ladybugs arrived' });
    expect(createJournalNote.mock.calls[0][1]).toEqual(expect.any(String));
  });

  it('keeps cached journal reading available while offline and disables writes', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    getGardenJournal.mockResolvedValue({ season: 2026, summary, entries: [] });
    renderPanel();

    expect(await screen.findByText(/latest season loaded in this session/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save private note/i })).toBeDisabled();
  });
});
