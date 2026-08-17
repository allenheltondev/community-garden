import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiKeysPanel } from './ApiKeysPanel';

const listApiKeys = vi.hoisted(() => vi.fn());
const createApiKey = vi.hoisted(() => vi.fn());
const renameApiKey = vi.hoisted(() => vi.fn());
const deleteApiKey = vi.hoisted(() => vi.fn());
const listApiAccessRequests = vi.hoisted(() => vi.fn());

vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/api')>();
  return {
    ...actual,
    listApiKeys,
    createApiKey,
    renameApiKey,
    deleteApiKey,
    listApiAccessRequests,
  };
});

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiKeysPanel />
    </QueryClientProvider>
  );
}

describe('ApiKeysPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listApiKeys.mockResolvedValue({ items: [] });
    // An approved, unclaimed request is what unlocks key creation.
    listApiAccessRequests.mockResolvedValue([
      {
        id: 'request-1',
        status: 'approved',
        integrationName: 'Harvest Sync',
        intendedUse: 'Mirror my harvest log',
        contactEmail: null,
        decisionNote: null,
        decidedAt: '2026-08-02T00:00:00Z',
        createdAt: '2026-08-01T00:00:00Z',
        apiKeyId: null,
      },
    ]);
  });

  it('lists existing keys without exposing secrets', async () => {
    listApiKeys.mockResolvedValue({
      items: [
        {
          id: 'key-1',
          name: 'Laptop script',
          keyPrefix: 'grnk_1a2b3c4d',
          lastUsedAt: null,
          createdAt: '2026-06-22T00:00:00Z',
        },
      ],
    });

    renderPanel();

    expect(await screen.findByText('Laptop script')).toBeInTheDocument();
    expect(screen.getByText(/grnk_1a2b3c4d/)).toBeInTheDocument();
    expect(screen.getByText(/last used never/i)).toBeInTheDocument();
  });

  it('shows the one-time secret after creating a key', async () => {
    createApiKey.mockResolvedValue({
      id: 'key-2',
      name: 'New key',
      keyPrefix: 'grnk_99887766',
      key: 'grnk_99887766aabbccddeeff00112233445566778899aabbccddeeff0011',
      lastUsedAt: null,
      createdAt: '2026-06-22T00:00:00Z',
    });

    renderPanel();
    await screen.findByText(/no api keys yet/i);

    await userEvent.type(screen.getByLabelText(/key name/i), 'New key');
    await userEvent.click(screen.getByRole('button', { name: /create key/i }));

    expect(createApiKey).toHaveBeenCalledWith('New key');
    const status = await screen.findByRole('status');
    expect(within(status).getByText(/you won't be able to see it again/i)).toBeInTheDocument();
    expect(
      within(status).getByText('grnk_99887766aabbccddeeff00112233445566778899aabbccddeeff0011')
    ).toBeInTheDocument();
  });

  it('refetches the approval after creating a key, since creation spends it', async () => {
    createApiKey.mockResolvedValue({
      id: 'key-2',
      name: 'New key',
      keyPrefix: 'grnk_99887766',
      key: 'grnk_99887766aabbccddeeff00112233445566778899aabbccddeeff0011',
      lastUsedAt: null,
      createdAt: '2026-06-22T00:00:00Z',
    });

    renderPanel();
    await screen.findByText(/no api keys yet/i);
    await waitFor(() => expect(listApiAccessRequests).toHaveBeenCalledTimes(1));

    await userEvent.type(screen.getByLabelText(/key name/i), 'New key');
    await userEvent.click(screen.getByRole('button', { name: /create key/i }));

    // Without this the panel keeps offering a create the API now refuses,
    // because the approval it read is stale.
    await waitFor(() => expect(listApiAccessRequests.mock.calls.length).toBeGreaterThan(1));
  });

  it('validates that a name is required before creating', async () => {
    renderPanel();
    await screen.findByText(/no api keys yet/i);

    await userEvent.click(screen.getByRole('button', { name: /create key/i }));

    expect(createApiKey).not.toHaveBeenCalled();
    expect(screen.getByText(/name is required/i)).toBeInTheDocument();
  });

  it('renames a key', async () => {
    listApiKeys.mockResolvedValue({
      items: [
        {
          id: 'key-1',
          name: 'Old name',
          keyPrefix: 'grnk_1a2b3c4d',
          lastUsedAt: null,
          createdAt: '2026-06-22T00:00:00Z',
        },
      ],
    });
    renameApiKey.mockResolvedValue({
      id: 'key-1',
      name: 'Renamed',
      keyPrefix: 'grnk_1a2b3c4d',
      lastUsedAt: null,
      createdAt: '2026-06-22T00:00:00Z',
    });

    renderPanel();
    await screen.findByText('Old name');

    await userEvent.click(screen.getByRole('button', { name: /rename/i }));
    const input = screen.getByLabelText(/new key name/i);
    await userEvent.clear(input);
    await userEvent.type(input, 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(renameApiKey).toHaveBeenCalledWith('key-1', 'Renamed')
    );
  });

  it('offers no key form until access has been approved', async () => {
    listApiAccessRequests.mockResolvedValue([]);
    renderPanel();

    expect(await screen.findByText(/issued once your API access request is approved/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create key/i })).not.toBeInTheDocument();
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it('offers no key form once the approval has been claimed', async () => {
    listApiAccessRequests.mockResolvedValue([
      {
        id: 'request-1',
        status: 'approved',
        integrationName: 'Harvest Sync',
        intendedUse: 'Mirror my harvest log',
        contactEmail: null,
        decisionNote: null,
        decidedAt: '2026-08-02T00:00:00Z',
        createdAt: '2026-08-01T00:00:00Z',
        apiKeyId: 'key-1',
      },
    ]);
    renderPanel();

    await waitFor(() => expect(listApiAccessRequests).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /create key/i })).not.toBeInTheDocument();
  });
});
