import { describe, expect, it } from 'vitest';
import {
  EMPTY_HISTORY,
  canRedo,
  canUndo,
  peekRedo,
  peekUndo,
  pushEntry,
  remapEntityId,
  steppedBack,
  steppedForward,
  type HistoryEntry,
} from './designerHistory';

function bedUpdate(
  id: string,
  x: number,
  at: number,
  coalesceKey?: string
): HistoryEntry {
  return {
    kind: 'bed-update',
    id,
    before: { name: 'Bed', positionX: x - 1 },
    after: { name: 'Bed', positionX: x },
    at,
    coalesceKey,
  };
}

describe('designerHistory', () => {
  it('starts empty with nothing to undo or redo', () => {
    expect(canUndo(EMPTY_HISTORY)).toBe(false);
    expect(canRedo(EMPTY_HISTORY)).toBe(false);
    expect(peekUndo(EMPTY_HISTORY)).toBeNull();
    expect(peekRedo(EMPTY_HISTORY)).toBeNull();
  });

  it('pushes entries and steps back and forward through them', () => {
    let h = pushEntry(EMPTY_HISTORY, bedUpdate('a', 1, 0));
    h = pushEntry(h, bedUpdate('a', 2, 5000));
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(false);

    expect(peekUndo(h)?.at).toBe(5000);
    h = steppedBack(h);
    expect(peekUndo(h)?.at).toBe(0);
    expect(peekRedo(h)?.at).toBe(5000);

    h = steppedForward(h);
    expect(canRedo(h)).toBe(false);
  });

  it('drops the redo tail when a new entry is pushed after undo', () => {
    let h = pushEntry(EMPTY_HISTORY, bedUpdate('a', 1, 0));
    h = pushEntry(h, bedUpdate('a', 2, 5000));
    h = steppedBack(h);
    h = pushEntry(h, bedUpdate('a', 9, 10000));
    expect(h.entries).toHaveLength(2);
    expect(canRedo(h)).toBe(false);
    expect((peekUndo(h) as { after: { positionX?: number } }).after.positionX).toBe(9);
  });

  it('coalesces rapid same-key updates into one entry keeping first before and last after', () => {
    let h = pushEntry(EMPTY_HISTORY, bedUpdate('a', 1, 0, 'nudge'));
    h = pushEntry(h, bedUpdate('a', 2, 200, 'nudge'));
    h = pushEntry(h, bedUpdate('a', 3, 400, 'nudge'));
    expect(h.entries).toHaveLength(1);
    const entry = h.entries[0] as Extract<HistoryEntry, { kind: 'bed-update' }>;
    expect(entry.before.positionX).toBe(0);
    expect(entry.after.positionX).toBe(3);
  });

  it('does not coalesce across the time window, different keys, or different entities', () => {
    let h = pushEntry(EMPTY_HISTORY, bedUpdate('a', 1, 0, 'nudge'));
    h = pushEntry(h, bedUpdate('a', 2, 5000, 'nudge'));
    h = pushEntry(h, bedUpdate('a', 3, 5100, 'resize'));
    h = pushEntry(h, bedUpdate('b', 4, 5200, 'resize'));
    expect(h.entries).toHaveLength(4);
  });

  it('caps the stack at 50 entries, dropping the oldest', () => {
    let h = EMPTY_HISTORY;
    for (let i = 0; i < 60; i += 1) {
      h = pushEntry(h, bedUpdate('a', i, i * 5000));
    }
    expect(h.entries).toHaveLength(50);
    expect((h.entries[0] as { after: { positionX?: number } }).after.positionX).toBe(10);
  });

  it('remaps entity ids only for the matching entity kind', () => {
    let h = pushEntry(EMPTY_HISTORY, bedUpdate('old', 1, 0));
    h = pushEntry(h, {
      kind: 'annotation-update',
      id: 'old',
      before: { label: 'Tree' },
      after: { label: 'Oak' },
      at: 5000,
    });
    h = remapEntityId(h, 'bed', 'old', 'new');
    expect(h.entries[0].id).toBe('new');
    expect(h.entries[1].id).toBe('old');
  });
});

import { remapEntityId as remapBatch, pushEntry as pushBatch, EMPTY_HISTORY as EMPTY } from './designerHistory';

describe('batch entries', () => {
  it('remaps ids inside batch entries recursively', () => {
    let h = pushBatch(EMPTY, {
      kind: 'batch',
      at: 0,
      entries: [
        {
          kind: 'bed-update',
          id: 'old',
          before: { name: 'Bed', positionX: 0 },
          after: { name: 'Bed', positionX: 12 },
          at: 0,
        },
        {
          kind: 'annotation-update',
          id: 'old',
          before: { label: 'Tree' },
          after: { label: 'Oak' },
          at: 0,
        },
      ],
    });
    h = remapBatch(h, 'bed', 'old', 'new');
    const batch = h.entries[0];
    if (batch.kind !== 'batch') throw new Error('expected batch');
    expect(batch.entries[0].id).toBe('new');
    expect(batch.entries[1].id).toBe('old');
  });
});
