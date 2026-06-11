// Undo/redo history for the garden designer.
//
// Pure data + functions so the stack logic is unit-testable apart from
// React Query. Entries describe geometry-level operations on beds and
// annotations; the hook owns *applying* them (and recreating entities on
// undo-of-delete, which mints new server ids — hence remapEntityId).

import type {
  UpsertGardenAnnotationRequest,
  UpsertGardenBedRequest,
} from '../services/api';

export type HistoryEntityKind = 'bed' | 'annotation';

export type HistoryEntry =
  | {
      kind: 'bed-update';
      id: string;
      before: UpsertGardenBedRequest;
      after: UpsertGardenBedRequest;
      at: number;
      coalesceKey?: string;
    }
  | { kind: 'bed-create'; id: string; payload: UpsertGardenBedRequest; at: number }
  | { kind: 'bed-delete'; id: string; payload: UpsertGardenBedRequest; at: number }
  | {
      kind: 'annotation-update';
      id: string;
      before: UpsertGardenAnnotationRequest;
      after: UpsertGardenAnnotationRequest;
      at: number;
      coalesceKey?: string;
    }
  | {
      kind: 'annotation-create';
      id: string;
      payload: UpsertGardenAnnotationRequest;
      at: number;
    }
  | {
      kind: 'annotation-delete';
      id: string;
      payload: UpsertGardenAnnotationRequest;
      at: number;
    };

export interface DesignerHistory {
  entries: HistoryEntry[];
  // Number of entries currently applied; entries[index..] is the redo tail.
  index: number;
}

const MAX_ENTRIES = 50;
// Rapid same-key updates (arrow-key nudges, slider drags) merge into one
// undo step so Cmd+Z doesn't replay them inch by inch.
const COALESCE_WINDOW_MS = 1000;

export const EMPTY_HISTORY: DesignerHistory = { entries: [], index: 0 };

export function canUndo(history: DesignerHistory): boolean {
  return history.index > 0;
}

export function canRedo(history: DesignerHistory): boolean {
  return history.index < history.entries.length;
}

export function pushEntry(history: DesignerHistory, entry: HistoryEntry): DesignerHistory {
  const applied = history.entries.slice(0, history.index);

  const last = applied[applied.length - 1];
  if (
    last &&
    (entry.kind === 'bed-update' || entry.kind === 'annotation-update') &&
    entry.coalesceKey !== undefined &&
    (last.kind === 'bed-update' || last.kind === 'annotation-update') &&
    last.kind === entry.kind &&
    last.id === entry.id &&
    last.coalesceKey === entry.coalesceKey &&
    entry.at - last.at <= COALESCE_WINDOW_MS
  ) {
    const merged = { ...last, after: entry.after, at: entry.at } as HistoryEntry;
    const entries = [...applied.slice(0, -1), merged];
    return { entries, index: entries.length };
  }

  const entries = [...applied, entry].slice(-MAX_ENTRIES);
  return { entries, index: entries.length };
}

export function peekUndo(history: DesignerHistory): HistoryEntry | null {
  return canUndo(history) ? history.entries[history.index - 1] : null;
}

export function peekRedo(history: DesignerHistory): HistoryEntry | null {
  return canRedo(history) ? history.entries[history.index] : null;
}

export function steppedBack(history: DesignerHistory): DesignerHistory {
  if (!canUndo(history)) return history;
  return { ...history, index: history.index - 1 };
}

export function steppedForward(history: DesignerHistory): DesignerHistory {
  if (!canRedo(history)) return history;
  return { ...history, index: history.index + 1 };
}

// Undoing a delete (or redoing a create) recreates the entity server-side
// under a fresh id. Every other entry referring to the old id must follow,
// or the rest of the stack would orphan.
export function remapEntityId(
  history: DesignerHistory,
  kind: HistoryEntityKind,
  oldId: string,
  newId: string
): DesignerHistory {
  return {
    ...history,
    entries: history.entries.map((entry) =>
      entry.kind.startsWith(kind) && entry.id === oldId
        ? { ...entry, id: newId }
        : entry
    ),
  };
}
