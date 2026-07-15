import { createLogger } from './logging';

export type TodayActionKind =
  | 'claim'
  | 'reminder'
  | 'harvest'
  | 'share'
  | 'pickup'
  | 'plan'
  | 'local'
  | 'start'
  | 'review';

const STORAGE_KEY = 'grn-today-action-v1';
const logger = createLogger('today');

interface PendingTodayAction {
  kind: TodayActionKind;
}

export function recordTodayActionOpen(
  kind: TodayActionKind,
  rank: number,
  destination: 'garden' | 'reminders' | 'share'
): void {
  logger.info('Today action opened', { actionKind: kind, rank, destination });
  try {
    const pending: PendingTodayAction = { kind };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // Storage is a best-effort measurement handoff; navigation must still work.
  }
}

export function completeTodayAction(kind: TodayActionKind): void {
  try {
    const serialized = window.sessionStorage.getItem(STORAGE_KEY);
    if (!serialized) return;
    const pending = JSON.parse(serialized) as Partial<PendingTodayAction>;
    if (pending.kind !== kind) return;
    window.sessionStorage.removeItem(STORAGE_KEY);
    logger.info('Today action completed', { actionKind: kind });
  } catch {
    // Completion tracking must never interrupt the underlying workflow.
  }
}
