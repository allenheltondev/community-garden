import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReminderPanel } from './ReminderPanel';
import { listReminders } from '../../services/api';

vi.mock('../../services/api', () => ({
  createReminder: vi.fn(),
  listReminders: vi.fn(),
  updateReminderStatus: vi.fn(),
}));

describe('ReminderPanel deep links', () => {
  it('prefills and focuses a new reminder from garden context', async () => {
    vi.mocked(listReminders).mockResolvedValue({ items: [] });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[
            '/today/reminders?new=true&type=harvest&title=Harvest+Kitchen+bed',
          ]}
        >
          <ReminderPanel />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const title = screen.getByLabelText(/reminder title/i);
    await waitFor(() => expect(title).toHaveValue('Harvest Kitchen bed'));
    expect(screen.getByLabelText(/^type$/i)).toHaveValue('harvest');
    expect(title).toHaveFocus();
  });

  it('focuses the linked reminder record', async () => {
    vi.mocked(listReminders).mockResolvedValue({
      items: [
        {
          id: 'reminder-1',
          title: 'Water the raised beds',
          reminderType: 'watering',
          cadenceDays: 1,
          startDate: '2026-07-14',
          timezone: 'UTC',
          status: 'active',
          nextRunAt: '2026-07-14T09:00:00Z',
          lastRunAt: null,
          createdAt: '2026-07-01T00:00:00Z',
        },
      ],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/today/reminders?reminder=reminder-1']}>
          <ReminderPanel />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const reminder = await screen.findByText('Water the raised beds');
    const reminderRow = reminder.closest('li');
    expect(reminderRow).toHaveAttribute('aria-current', 'true');
    await waitFor(() => expect(document.activeElement).toBe(reminderRow));
  });
});
