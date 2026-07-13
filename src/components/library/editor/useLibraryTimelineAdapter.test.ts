import { describe, expect, it } from 'bun:test';
import { createDraftSaveScheduler, renderedFileName } from './useLibraryTimelineAdapter';

// A hand-driven clock: the debounce is asserted by advancing time, never by
// waiting on it.
function createFakeTimers() {
  let now = 0;
  let nextId = 1;
  const scheduled = new Map<number, { at: number; fn: () => void }>();

  const setTimeoutImpl = ((fn: () => void, ms: number) => {
    const id = nextId++;
    scheduled.set(id, { at: now + ms, fn });
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;

  const clearTimeoutImpl = (handle: ReturnType<typeof setTimeout>) => {
    scheduled.delete(handle as unknown as number);
  };

  const advance = (ms: number) => {
    now += ms;
    for (const [id, entry] of [...scheduled.entries()]) {
      if (entry.at <= now) {
        scheduled.delete(id);
        entry.fn();
      }
    }
  };

  return { setTimeoutImpl, clearTimeoutImpl, advance, pending: () => scheduled.size };
}

function createRecordingSave() {
  const saves: number[] = [];
  const save = () => {
    saves.push(saves.length + 1);
    return Promise.resolve();
  };
  return { save, saves };
}

describe('createDraftSaveScheduler', () => {
  it('coalesces a burst of edits into a single save after the delay', async () => {
    const timers = createFakeTimers();
    const { save, saves } = createRecordingSave();
    const scheduler = createDraftSaveScheduler({
      delayMs: 800,
      save,
      setTimeoutImpl: timers.setTimeoutImpl,
      clearTimeoutImpl: timers.clearTimeoutImpl,
    });

    scheduler.schedule();
    timers.advance(300);
    scheduler.schedule();
    timers.advance(300);
    scheduler.schedule();
    expect(saves).toHaveLength(0);

    timers.advance(799);
    expect(saves).toHaveLength(0);

    timers.advance(1);
    await scheduler.flush();
    expect(saves).toHaveLength(1);
  });

  it('flush writes a pending edit immediately, before the timer fires', async () => {
    const timers = createFakeTimers();
    const { save, saves } = createRecordingSave();
    const scheduler = createDraftSaveScheduler({
      delayMs: 800,
      save,
      setTimeoutImpl: timers.setTimeoutImpl,
      clearTimeoutImpl: timers.clearTimeoutImpl,
    });

    scheduler.schedule();
    await scheduler.flush();

    expect(saves).toHaveLength(1);
    // The pending timer is retired, so it cannot fire a second write later.
    expect(timers.pending()).toBe(0);
    timers.advance(5_000);
    expect(saves).toHaveLength(1);
  });

  it('flush is a no-op when nothing is pending', async () => {
    const timers = createFakeTimers();
    const { save, saves } = createRecordingSave();
    const scheduler = createDraftSaveScheduler({
      delayMs: 800,
      save,
      setTimeoutImpl: timers.setTimeoutImpl,
      clearTimeoutImpl: timers.clearTimeoutImpl,
    });

    await scheduler.flush();
    expect(saves).toHaveLength(0);
  });

  it('cancel drops the pending write (discard must not resurrect the draft)', async () => {
    const timers = createFakeTimers();
    const { save, saves } = createRecordingSave();
    const scheduler = createDraftSaveScheduler({
      delayMs: 800,
      save,
      setTimeoutImpl: timers.setTimeoutImpl,
      clearTimeoutImpl: timers.clearTimeoutImpl,
    });

    scheduler.schedule();
    scheduler.cancel();
    timers.advance(5_000);
    await scheduler.flush();

    expect(saves).toHaveLength(0);
  });

  it('serializes saves so two writes cannot land out of order', async () => {
    const timers = createFakeTimers();
    const order: string[] = [];
    let release: (() => void) | null = null;
    let call = 0;

    const scheduler = createDraftSaveScheduler({
      delayMs: 800,
      save: () => {
        call += 1;
        const id = call;
        order.push(`start-${id}`);
        if (id === 1) {
          return new Promise<void>((resolve) => {
            release = () => {
              order.push('end-1');
              resolve();
            };
          });
        }
        order.push(`end-${id}`);
        return Promise.resolve();
      },
      setTimeoutImpl: timers.setTimeoutImpl,
      clearTimeoutImpl: timers.clearTimeoutImpl,
    });

    // Saves are queued behind the in-flight one, so they start on a microtask.
    const settle = () => Promise.resolve().then(() => undefined);

    scheduler.schedule();
    timers.advance(800);
    await settle();
    expect(order).toEqual(['start-1']);

    scheduler.schedule();
    timers.advance(800);
    await settle();
    // The second save must wait for the first to settle.
    expect(order).toEqual(['start-1']);

    release?.();
    await scheduler.flush();
    expect(order).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
  });

  it('a failing save never rejects the flush that closes the dialog', async () => {
    const timers = createFakeTimers();
    const scheduler = createDraftSaveScheduler({
      delayMs: 800,
      save: () => Promise.reject(new Error('offline')),
      setTimeoutImpl: timers.setTimeoutImpl,
      clearTimeoutImpl: timers.clearTimeoutImpl,
    });

    scheduler.schedule();
    await expect(scheduler.flush()).resolves.toBeUndefined();
  });
});

describe('renderedFileName', () => {
  it('suffixes the base name and forces the mp4 the compositor emits', () => {
    expect(renderedFileName('hero.mp4')).toBe('hero-edit.mp4');
    expect(renderedFileName('promo.final.mov')).toBe('promo.final-edit.mp4');
    expect(renderedFileName('clip')).toBe('clip-edit.mp4');
    expect(renderedFileName('.mp4')).toBe('video-edit.mp4');
  });
});
