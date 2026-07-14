import { beforeEach, describe, expect, it, vi } from 'vitest';
import { completeTodayAction, recordTodayActionOpen } from './todayActionTracking';

describe('Today action tracking', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('logs a privacy-safe completion only for the matching opened action', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    recordTodayActionOpen('harvest', 1, 'garden');
    completeTodayAction('claim');
    expect(info).not.toHaveBeenCalledWith(
      '[today]',
      'Today action completed',
      expect.anything()
    );

    completeTodayAction('harvest');
    expect(info).toHaveBeenCalledWith(
      '[today]',
      'Today action completed',
      { actionKind: 'harvest' }
    );
    expect(window.sessionStorage.length).toBe(0);
  });
});
