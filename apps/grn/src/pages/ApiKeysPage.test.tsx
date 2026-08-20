import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { ApiKeysPage } from './ApiKeysPage';
import { createApiAccessRequest, listApiAccessRequests, listApiKeys } from '../services/api';

vi.mock('../services/api', () => ({
  listApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  renameApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  listApiAccessRequests: vi.fn(),
  createApiAccessRequest: vi.fn(),
}));

const mockListKeys = vi.mocked(listApiKeys);
const mockListRequests = vi.mocked(listApiAccessRequests);
const mockCreateRequest = vi.mocked(createApiAccessRequest);

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ApiKeysPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('ApiKeysPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListKeys.mockResolvedValue({ items: [] });
    mockListRequests.mockResolvedValue([]);
    mockCreateRequest.mockResolvedValue({
      id: 'request-1',
      status: 'pending',
      integrationName: 'Harvest Sync',
      intendedUse: 'Mirror my harvest log',
      contactEmail: null,
      decisionNote: null,
      decidedAt: null,
      createdAt: '2026-08-01T00:00:00Z',
      apiKeyId: null,
    });
  });

  it('is a page a grower can land on, with the request behind a button', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'API keys' })).toBeInTheDocument();
    // The panel resolves its own query first, so wait for the button rather
    // than assuming it lands with the heading.
    expect(await screen.findByRole('button', { name: 'Request a key' })).toBeInTheDocument();
  });

  it('takes the grower from button to form to a pending status', async () => {
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Request a key' }));
    await userEvent.type(screen.getByLabelText(/What are you building/i), 'Harvest Sync');
    await userEvent.type(screen.getByLabelText(/Why do you need a key/i), 'Mirror my harvest log');

    // Once sent, the refetched list is what drives the pending state.
    mockListRequests.mockResolvedValue([
      {
        id: 'request-1',
        status: 'pending',
        integrationName: 'Harvest Sync',
        intendedUse: 'Mirror my harvest log',
        contactEmail: null,
        decisionNote: null,
        decidedAt: null,
        createdAt: '2026-08-01T00:00:00Z',
        apiKeyId: null,
      },
    ]);
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByText(/Pending review/i)).toBeInTheDocument();
  });

  it('does not offer key creation while the request is pending', async () => {
    mockListRequests.mockResolvedValue([
      {
        id: 'request-1',
        status: 'pending',
        integrationName: 'Harvest Sync',
        intendedUse: 'Mirror my harvest log',
        contactEmail: null,
        decidedAt: null,
        decisionNote: null,
        createdAt: '2026-08-01T00:00:00Z',
        apiKeyId: null,
      },
    ]);
    renderPage();

    expect(await screen.findByText(/Pending review/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create key/i })).not.toBeInTheDocument();
  });
});
