// Pooled fan-out over a work-list. Deliberately knows nothing about the canvas
// executor — it takes a `run` closure, so the caller keeps ownership of what a
// "run" is, including its own abort signal. The cap default comes from the
// contracts package rather than a local literal, because a runtime cap that
// disagrees with the schema cap is a silently truncated batch.

import { MAX_BATCH_ITEMS } from '@continuum/contracts';

const DEFAULT_POOL = 3;

export interface FanOutResult<R> {
  /** One slot per input item, in item order. `null` where that item's run threw. */
  results: (R | null)[];
  /** True when `cap` cut the input short. Reported, never silent. */
  truncated: boolean;
  failures: number;
}

export interface FanOutOptions {
  /** Maximum runs in flight at once. Defaults to 3. */
  pool?: number;
  /** Maximum items processed. Defaults to the contract's `MAX_BATCH_ITEMS`. */
  cap?: number;
}

/**
 * Runs `run` over `items` with at most `pool` in flight, preserving input order
 * in the result regardless of completion order.
 *
 * A rejection isolates to its own slot (`null`, `failures += 1`) instead of
 * sinking the batch: a 40-item batch where item 7 fails should still deliver
 * 39 outputs, because throwing away 39 good renders to report one bad one is
 * the worse trade for the person waiting on them.
 */
export async function fanOut<T, R>(
  items: readonly T[],
  run: (item: T, index: number) => Promise<R>,
  options: FanOutOptions = {},
): Promise<FanOutResult<R>> {
  const cap = Math.max(0, options.cap ?? MAX_BATCH_ITEMS);
  const pool = Math.max(1, options.pool ?? DEFAULT_POOL);

  const truncated = items.length > cap;
  const queue = truncated ? items.slice(0, cap) : items;

  const results: (R | null)[] = new Array(queue.length).fill(null);
  let failures = 0;
  let next = 0;

  // Each worker pulls the next unclaimed index, so a slow item stalls only its
  // own worker rather than a whole fixed-size chunk.
  const worker = async (): Promise<void> => {
    while (next < queue.length) {
      const index = next;
      next += 1;
      try {
        results[index] = await run(queue[index], index);
      } catch {
        failures += 1;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(pool, queue.length) }, worker));

  return { results, truncated, failures };
}
