import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createReminder,
  listReminders,
  type ReminderType,
  updateReminderStatus,
} from '../../services/api';
import { Button } from '@olivias/ui';
import { completeTodayAction } from '../../utils/todayActionTracking';

const REMINDER_TYPES: Array<{ value: ReminderType; label: string }> = [
  { value: 'watering', label: 'Watering' },
  { value: 'harvest', label: 'Harvest' },
  { value: 'fertilizer', label: 'Fertilizer' },
  { value: 'checkin', label: 'Garden check-in' },
  { value: 'custom', label: 'Custom' },
];

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function reminderTypeFromQuery(value: string | null): ReminderType {
  return REMINDER_TYPES.some((option) => option.value === value)
    ? (value as ReminderType)
    : 'watering';
}

export function ReminderPanel() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const requestedNewReminder = searchParams.get('new') === 'true';
  const requestedTitle = searchParams.get('title')?.trim() ?? '';
  const requestedType = reminderTypeFromQuery(searchParams.get('type'));
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(() =>
    requestedNewReminder ? requestedTitle : ''
  );
  const [reminderType, setReminderType] = useState<ReminderType>(() =>
    requestedNewReminder ? requestedType : 'watering'
  );
  const [cadenceDays, setCadenceDays] = useState(7);
  const [startDate, setStartDate] = useState(todayIsoDate());
  const [formError, setFormError] = useState<string | null>(null);

  const remindersQuery = useQuery({
    queryKey: ['reminders'],
    queryFn: listReminders,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: createReminder,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reminders'] });
      setTitle('');
      setReminderType('watering');
      setCadenceDays(7);
      setStartDate(todayIsoDate());
      setFormError(null);
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Failed to create reminder');
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ reminderId, status }: { reminderId: string; status: 'active' | 'paused' }) =>
      updateReminderStatus(reminderId, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reminders'] });
      completeTodayAction('reminder');
    },
  });

  const sortedReminders = useMemo(() => {
    const items = remindersQuery.data?.items ?? [];
    return [...items].sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt));
  }, [remindersQuery.data?.items]);
  const linkedReminderId = searchParams.get('reminder');

  useEffect(() => {
    if (!requestedNewReminder) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.scrollIntoView?.({ block: 'center' });
  }, [requestedNewReminder]);

  useEffect(() => {
    if (!linkedReminderId || sortedReminders.length === 0) return;
    const element = document.getElementById(`reminder-${linkedReminderId}`);
    element?.focus();
    element?.scrollIntoView?.({ block: 'center' });
  }, [linkedReminderId, sortedReminders]);

  const submit = () => {
    if (!title.trim()) {
      setFormError('Title is required.');
      return;
    }

    createMutation.mutate({
      title: title.trim(),
      reminderType,
      cadenceDays,
      startDate,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Garden reminders</h3>
        <p className="text-sm text-gray-600 mt-1">
          Set recurring reminders for watering, harvest, fertilizer, and check-ins.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="block text-gray-600 mb-1">Reminder title</span>
          <input
            ref={titleInputRef}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Tomatoes - fertilize"
          />
        </label>

        <label className="text-sm">
          <span className="block text-gray-600 mb-1">Type</span>
          <select
            className="w-full rounded-md border border-gray-300 px-3 py-2"
            value={reminderType}
            onChange={(event) => setReminderType(event.target.value as ReminderType)}
          >
            {REMINDER_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block text-gray-600 mb-1">Every (days)</span>
          <input
            type="number"
            min={1}
            max={365}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
            value={cadenceDays}
            onChange={(event) => setCadenceDays(Number(event.target.value) || 1)}
          />
        </label>

        <label className="text-sm">
          <span className="block text-gray-600 mb-1">Start date</span>
          <input
            type="date"
            className="w-full rounded-md border border-gray-300 px-3 py-2"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
      </div>

      {formError ? <p className="text-sm text-red-600">{formError}</p> : null}

      <Button onClick={submit} disabled={createMutation.isPending} variant="primary">
        {createMutation.isPending ? 'Creating...' : 'Create reminder'}
      </Button>

      <div className="border-t pt-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Upcoming reminders</h4>

        {remindersQuery.isLoading ? <p className="text-sm text-gray-600">Loading reminders...</p> : null}

        {remindersQuery.isError ? (
          <p className="text-sm text-red-600">Could not load reminders right now.</p>
        ) : null}

        {!remindersQuery.isLoading && !remindersQuery.isError && sortedReminders.length === 0 ? (
          <p className="text-sm text-gray-600">No reminders yet. Create one above.</p>
        ) : null}

        <ul className="space-y-2">
          {sortedReminders.map((reminder) => {
            const isPaused = reminder.status === 'paused';
            return (
              <li
                key={reminder.id}
                id={`reminder-${reminder.id}`}
                tabIndex={-1}
                aria-current={linkedReminderId === reminder.id ? 'true' : undefined}
                className={`rounded-md border px-3 py-2 flex items-center justify-between gap-3 ${
                  linkedReminderId === reminder.id
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200'
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{reminder.title}</p>
                  <p className="text-xs text-gray-600">
                    {reminder.reminderType} • every {reminder.cadenceDays} days • next{' '}
                    {new Date(reminder.nextRunAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  variant={isPaused ? 'primary' : 'secondary'}
                  onClick={() =>
                    statusMutation.mutate({
                      reminderId: reminder.id,
                      status: isPaused ? 'active' : 'paused',
                    })
                  }
                  disabled={statusMutation.isPending}
                >
                  {isPaused ? 'Resume' : 'Pause'}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default ReminderPanel;
