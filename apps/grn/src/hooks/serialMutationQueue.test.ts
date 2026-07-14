import { describe, expect, it, vi } from 'vitest';
import { createSerialMutationQueue } from './serialMutationQueue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('createSerialMutationQueue', () => {
  it('waits for the older edit before sending the newer edit for the same entity', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const worker = vi
      .fn<(key: string, value: number) => Promise<string>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const queue = createSerialMutationQueue(worker);

    const older = queue.enqueue('bed-1', 120);
    const newer = queue.enqueue('bed-1', 144);

    await vi.waitFor(() => expect(worker).toHaveBeenCalledTimes(1));
    expect(worker).toHaveBeenLastCalledWith('bed-1', 120);
    expect(queue.hasPending('bed-1')).toBe(true);

    first.resolve('older saved');
    await older;
    await Promise.resolve();

    expect(worker).toHaveBeenCalledTimes(2);
    expect(worker).toHaveBeenLastCalledWith('bed-1', 144);

    second.resolve('newer saved');
    await newer;
    expect(queue.hasPending('bed-1')).toBe(false);
  });

  it('continues with the newest edit after an older edit fails', async () => {
    const first = deferred<string>();
    const worker = vi
      .fn<(key: string, value: number) => Promise<string>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce('newest saved');
    const queue = createSerialMutationQueue(worker);

    const older = queue.enqueue('canvas', 360);
    const newer = queue.enqueue('canvas', 480);
    first.reject(new Error('network error'));

    await expect(older).rejects.toThrow('network error');
    await expect(newer).resolves.toBe('newest saved');
    expect(worker).toHaveBeenNthCalledWith(2, 'canvas', 480);
    expect(queue.hasPending()).toBe(false);
  });

  it('allows different entities to save in parallel', async () => {
    const worker = vi.fn(async (key: string) => key);
    const queue = createSerialMutationQueue(worker);

    await Promise.all([queue.enqueue('bed-1', 120), queue.enqueue('bed-2', 144)]);

    expect(worker).toHaveBeenCalledTimes(2);
  });
});
