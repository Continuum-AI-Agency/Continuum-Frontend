import { describe, expect, it } from 'bun:test';
import { fanOut } from './fanout';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

// Deferreds rather than timers: the pool ceiling is a scheduling invariant, and
// a timer-based test would only prove it on a machine that happened to be idle.
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('fanOut', () => {
  it('never has more than `pool` runs in flight at once', async () => {
    const gates = Array.from({ length: 9 }, () => deferred<string>());
    let inFlight = 0;
    let observedPeak = 0;

    const settled = fanOut(
      gates,
      async (gate) => {
        inFlight += 1;
        observedPeak = Math.max(observedPeak, inFlight);
        try {
          return await gate.promise;
        } finally {
          inFlight -= 1;
        }
      },
      { pool: 3 },
    );

    // Release the gates one at a time so a fresh worker starts between each
    // check — the peak must still never exceed the pool.
    for (const [index, gate] of gates.entries()) {
      expect(inFlight).toBeLessThanOrEqual(3);
      gate.resolve(`v${index}`);
      await Promise.resolve();
      await Promise.resolve();
    }

    const result = await settled;
    expect(observedPeak).toBe(3);
    expect(result.results).toEqual(['v0', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8']);
  });

  it('keeps results in input order when items finish out of order', async () => {
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
    const settled = fanOut(gates, (gate) => gate.promise, { pool: 3 });

    gates[2].resolve('third');
    gates[0].resolve('first');
    gates[1].resolve('second');

    const result = await settled;
    expect(result.results).toEqual(['first', 'second', 'third']);
    expect(result.failures).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it('isolates a rejection to its own slot and still runs every other item', async () => {
    const result = await fanOut(['a', 'b', 'c'], async (item) => {
      if (item === 'b') throw new Error('item b blew up');
      return item.toUpperCase();
    });

    expect(result.results).toEqual(['A', null, 'C']);
    expect(result.failures).toBe(1);
  });

  it('reports truncation and never invokes the over-cap items', async () => {
    const seen: number[] = [];
    const result = await fanOut(
      [0, 1, 2, 3, 4],
      async (item) => {
        seen.push(item);
        return item;
      },
      { cap: 2 },
    );

    expect(result.truncated).toBe(true);
    expect(result.results).toEqual([0, 1]);
    expect(seen.sort()).toEqual([0, 1]);
  });

  it('defaults the cap to the contract limit of 100 items', async () => {
    const items = Array.from({ length: 101 }, (_, index) => index);
    const result = await fanOut(items, async (item) => item, { pool: 10 });

    expect(result.truncated).toBe(true);
    expect(result.results).toHaveLength(100);
  });

  it('returns an empty result and never calls `run` for empty input', async () => {
    let calls = 0;
    const result = await fanOut([], async () => {
      calls += 1;
      return 'never';
    });

    expect(result).toEqual({ results: [], truncated: false, failures: 0 });
    expect(calls).toBe(0);
  });

  it('serialises completely with a pool of 1', async () => {
    const order: string[] = [];
    const result = await fanOut(
      ['a', 'b', 'c'],
      async (item) => {
        order.push(`start:${item}`);
        await Promise.resolve();
        order.push(`end:${item}`);
        return item;
      },
      { pool: 1 },
    );

    expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c']);
    expect(result.results).toEqual(['a', 'b', 'c']);
  });
});
