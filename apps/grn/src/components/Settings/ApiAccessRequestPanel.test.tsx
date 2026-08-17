import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiAccessRequestPanel } from './ApiAccessRequestPanel';
import {
  createApiAccessRequest,
  listApiAccessRequests,
  type ApiAccessRequestItem,
} from '../../services/api';

vi.mock('../../services/api', () => ({
  createApiAccessRequest: vi.fn(),
  listApiAccessRequests: vi.fn(),
}));

const mockList = vi.mocked(listApiAccessRequests);
const mockCreate = vi.mocked(createApiAccessRequest);

function request(overrides: Partial<ApiAccessRequestItem> = {}): ApiAccessRequestItem {
  return {
    id: 'request-1',
    status: 'pending',
    integrationName: 'Harvest Sync',
    intendedUse: 'Mirror my harvest log',
    contactEmail: null,
    decisionNote: null,
    decidedAt: null,
    createdAt: '2026-08-01T00:00:00Z',
    apiKeyId: null,
    ...overrides,
  };
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiAccessRequestPanel />
    </QueryClientProvider>
  );
}

describe('ApiAccessRequestPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([]);
    mockCreate.mockResolvedValue(request());
  });

  it('invites a grower with no history to ask for access', async () => {
    renderPanel();

    expect(
      await screen.findByRole('button', { name: 'Request API access' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/What are you building/i)).toBeInTheDocument();
  });

  it('sends what the admin needs to decide', async () => {
    renderPanel();

    await userEvent.type(
      await screen.findByLabelText(/What are you building/i),
      'Harvest Sync'
    );
    await userEvent.type(
      screen.getByLabelText(/What would you use the API for/i),
      'Mirror my harvest log into a spreadsheet'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Request API access' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toEqual({
      integrationName: 'Harvest Sync',
      intendedUse: 'Mirror my harvest log into a spreadsheet',
    });
  });

  it('will not send a request with nothing to review', async () => {
    renderPanel();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Request API access' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/what you are building/i);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('shows a pending request instead of the form', async () => {
    mockList.mockResolvedValue([request()]);
    renderPanel();

    expect(await screen.findByText(/is with the team/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Request API access' })
    ).not.toBeInTheDocument();
  });

  it('tells an approved grower to create their key', async () => {
    mockList.mockResolvedValue([
      request({ status: 'approved', decidedAt: '2026-08-02T00:00:00Z' }),
    ]);
    renderPanel();

    expect(await screen.findByText(/API access is approved/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Request API access' })
    ).not.toBeInTheDocument();
  });

  it('lets a denied grower ask again, and says why it was denied', async () => {
    mockList.mockResolvedValue([
      request({
        status: 'denied',
        decidedAt: '2026-08-02T00:00:00Z',
        decisionNote: 'Tell us more about the use case',
      }),
    ]);
    renderPanel();

    expect(await screen.findByText(/Tell us more about the use case/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request API access' })).toBeInTheDocument();
  });

  it('surfaces a rejected request rather than clearing the form', async () => {
    mockCreate.mockRejectedValue(new Error('You already have an API access request awaiting review'));
    renderPanel();

    await userEvent.type(await screen.findByLabelText(/What are you building/i), 'Harvest Sync');
    await userEvent.type(screen.getByLabelText(/What would you use the API for/i), 'Mirror it');
    await userEvent.click(screen.getByRole('button', { name: 'Request API access' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already have an API access request/i);
  });

  it('says access is live once a key exists, and allows another request', async () => {
    mockList.mockResolvedValue([
      request({ status: 'approved', decidedAt: '2026-08-02T00:00:00Z', apiKeyId: 'key-1' }),
    ]);
    renderPanel();

    // The key exists, so the "create your key" nudge is wrong — but a grower
    // may well be building a second integration.
    expect(await screen.findByText('You have API access. Ask again below if you are building something new.')).toBeInTheDocument();
    expect(screen.queryByText(/Create your key below/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request API access' })).toBeInTheDocument();
  });
});
