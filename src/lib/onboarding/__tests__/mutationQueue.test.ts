import { describe, expect, test } from 'bun:test';
import { createSerializedMutationQueue } from '@/lib/onboarding/mutationQueue';

describe('createSerializedMutationQueue', () => {
  test('commits overlapping mutations in call order', async () => {
    const queue = createSerializedMutationQueue();
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;

    const first = queue.enqueue(async () => {
      events.push('first:start');
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      events.push('first:end');
      return 1;
    });
    const second = queue.enqueue(async () => {
      events.push('second');
      return 2;
    });

    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    releaseFirst?.();

    expect(await first).toBe(1);
    expect(await second).toBe(2);
    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });

  test('rejects the failed caller but continues with the next mutation', async () => {
    const queue = createSerializedMutationQueue();

    const failed = queue.enqueue(async () => {
      throw new Error('write failed');
    });
    const recovered = queue.enqueue(async () => 'committed');

    await expect(failed).rejects.toThrow('write failed');
    expect(await recovered).toBe('committed');
  });
});
