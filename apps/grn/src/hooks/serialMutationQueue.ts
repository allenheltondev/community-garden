/**
 * Serializes mutations that target the same entity while allowing unrelated
 * entities to save in parallel. This keeps an older response from arriving
 * after and overwriting a newer edit to the same bed, annotation, or canvas.
 */
export interface SerialMutationQueue<Key, Payload, Result> {
  enqueue: (key: Key, payload: Payload) => Promise<Result>;
  hasPending: (key?: Key) => boolean;
}

export function createSerialMutationQueue<Key, Payload, Result>(
  worker: (key: Key, payload: Payload) => Promise<Result>
): SerialMutationQueue<Key, Payload, Result> {
  const tails = new Map<Key, Promise<void>>();
  const pending = new Map<Key, number>();

  return {
    enqueue(key, payload) {
      pending.set(key, (pending.get(key) ?? 0) + 1);

      const previous = tails.get(key) ?? Promise.resolve();
      const result = previous.catch(() => undefined).then(() => worker(key, payload));
      const tail = result.then(
        () => undefined,
        () => undefined
      );
      tails.set(key, tail);

      return result.finally(() => {
        const remaining = (pending.get(key) ?? 1) - 1;
        if (remaining > 0) pending.set(key, remaining);
        else pending.delete(key);
        if (tails.get(key) === tail) tails.delete(key);
      });
    },

    hasPending(key) {
      if (key !== undefined) return (pending.get(key) ?? 0) > 0;
      return pending.size > 0;
    },
  };
}
