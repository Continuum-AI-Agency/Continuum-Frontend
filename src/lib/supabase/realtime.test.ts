import { afterEach, describe, expect, it, jest, mock } from 'bun:test';

type FakeChannel = {
  topic: string;
  options?: unknown;
  joining: boolean;
  /** Statuses this channel will report, in order. Defaults to a clean join. */
  statuses: string[];
  handlers: ((payload: Record<string, unknown>) => void)[];
  filters: Record<string, unknown>[];
  on: (
    type: string,
    filter: Record<string, unknown>,
    callback: (payload: Record<string, unknown>) => void,
  ) => FakeChannel;
  subscribe: (callback?: (status: string) => void) => FakeChannel;
};

const channels: FakeChannel[] = [];
const removed: string[] = [];
/** Statuses the NEXT created channel will report. Reset per test. */
let nextStatuses: string[] | null = null;

const makeChannel = (topic: string, options?: unknown): FakeChannel => {
  const channel: FakeChannel = {
    topic,
    options,
    joining: false,
    statuses: nextStatuses ?? ['SUBSCRIBED'],
    handlers: [],
    filters: [],
    on: (type, filter, callback) => {
      if (channel.joining && type === 'postgres_changes') {
        throw new Error(
          `cannot add \`${type}\` callbacks for realtime:${channel.topic} after \`subscribe()\`.`,
        );
      }
      channel.filters.push(filter);
      channel.handlers.push(callback);
      return channel;
    },
    subscribe: (callback) => {
      channel.joining = true;
      for (const status of channel.statuses) callback?.(status);
      return channel;
    },
  };
  return channel;
};

let setAuthImpl: () => Promise<unknown> = () => Promise.resolve();
const setAuth = mock(() => setAuthImpl());

const fakeClient = {
  realtime: { setAuth },
  channel: (topic: string, options?: unknown): FakeChannel => {
    const existing = channels.find((candidate) => candidate.topic === topic);
    if (existing) return existing;
    const created = makeChannel(topic, options);
    channels.push(created);
    return created;
  },
  removeChannel: async (channel: FakeChannel) => {
    removed.push(channel.topic);
    const index = channels.indexOf(channel);
    if (index >= 0) channels.splice(index, 1);
  },
};

/** setAuth → catch → subscribe is two microtasks when setAuth is already resolved. */
const flushAuth = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => fakeClient,
}));

import { HIDDEN_PAUSE_MS, subscribeToPostgresChanges, subscribeToRowBroadcasts } from './realtime';

const binding = (onRow: (row: Record<string, unknown>) => void) => ({
  event: 'INSERT' as const,
  schema: 'organic',
  table: 'organic_agent_run_events',
  filter: 'run_id=eq.run_1',
  onRow,
});

afterEach(() => {
  channels.length = 0;
  removed.length = 0;
  nextStatuses = null;
  setAuthImpl = () => Promise.resolve();
  setAuth.mockClear();
  fakeClient.realtime = { setAuth };
});

describe('subscribeToPostgresChanges', () => {
  it('gives every subscription its own topic even when the label repeats', () => {
    const first = subscribeToPostgresChanges({
      label: 'run-events:run_1',
      bindings: [binding(() => {})],
    });
    const second = subscribeToPostgresChanges({
      label: 'run-events:run_1',
      bindings: [binding(() => {})],
    });

    expect(channels).toHaveLength(2);
    expect(channels[0]?.topic).not.toBe(channels[1]?.topic);
    // The label survives as a debugging aid.
    expect(channels[0]?.topic.startsWith('run-events:run_1:')).toBe(true);

    first();
    second();
  });

  it('binds before subscribing, so a second binding never hits the joined guard', async () => {
    expect(() =>
      subscribeToPostgresChanges({
        label: 'agent-run:canvas:run_1',
        bindings: [
          binding(() => {}),
          { event: 'UPDATE', schema: 'brand_profiles', table: 'runs', onRow: () => {} },
        ],
      }),
    ).not.toThrow();

    expect(channels[0]?.filters).toHaveLength(2);
    await flushAuth();
    expect(channels[0]?.joining).toBe(true);
  });

  it('forwards new rows on INSERT and old rows on DELETE', () => {
    const seen: Record<string, unknown>[] = [];
    subscribeToPostgresChanges({
      label: 'rows',
      bindings: [
        { event: '*', schema: 'organic', table: 'events', onRow: (row) => seen.push(row) },
      ],
    });

    channels[0]?.handlers[0]?.({ eventType: 'INSERT', new: { seq: 1 }, old: {} });
    channels[0]?.handlers[0]?.({ eventType: 'DELETE', new: {}, old: { seq: 2 } });

    expect(seen).toEqual([{ seq: 1 }, { seq: 2 }]);
  });

  it('hands the caller the event type and the pre-change row', () => {
    const seen: { row: Record<string, unknown>; eventType: string; old: unknown }[] = [];
    subscribeToPostgresChanges({
      label: 'rows',
      bindings: [
        {
          event: '*',
          schema: 'organic',
          table: 'events',
          onRow: (row, meta) => seen.push({ row, eventType: meta.eventType, old: meta.old }),
        },
      ],
    });

    channels[0]?.handlers[0]?.({
      eventType: 'UPDATE',
      new: { status: 'completed' },
      old: { status: 'running' },
    });
    channels[0]?.handlers[0]?.({ eventType: 'INSERT', new: { status: 'queued' }, old: {} });

    // An UPDATE is the case a per-event binding split cannot express: the caller needs
    // BOTH rows to detect the edge.
    expect(seen[0]).toEqual({
      row: { status: 'completed' },
      eventType: 'UPDATE',
      old: { status: 'running' },
    });
    expect(seen[1]?.old).toEqual({});
  });

  it('passes channel options through, so a private channel stays private', () => {
    subscribeToPostgresChanges({
      label: 'goal:g1',
      bindings: [binding(() => {})],
      channelOptions: { config: { private: true } },
    });

    expect(channels[0]?.options).toEqual({ config: { private: true } });
  });

  it('omits the options argument entirely when the caller passes none', () => {
    subscribeToPostgresChanges({ label: 'rows', bindings: [binding(() => {})] });
    expect(channels[0]?.options).toBeUndefined();
  });

  it('reports every status to onStatus but only SUBSCRIBED to onSubscribed', async () => {
    nextStatuses = ['CHANNEL_ERROR', 'SUBSCRIBED', 'CLOSED'];
    const statuses: string[] = [];
    let backfills = 0;

    subscribeToPostgresChanges({
      label: 'rows',
      bindings: [binding(() => {})],
      onStatus: (status) => statuses.push(status),
      onSubscribed: () => {
        backfills += 1;
      },
    });
    await flushAuth();

    expect(statuses).toEqual(['CHANNEL_ERROR', 'SUBSCRIBED', 'CLOSED']);
    expect(backfills).toBe(1);
  });

  it('runs onSubscribed once the channel is live', async () => {
    let live = false;
    subscribeToPostgresChanges({
      label: 'rows',
      bindings: [binding(() => {})],
      onSubscribed: () => {
        live = true;
      },
    });
    await flushAuth();

    expect(live).toBe(true);
  });

  it('removes the channel on teardown and is safe to call twice', async () => {
    const teardown = subscribeToPostgresChanges({ label: 'rows', bindings: [binding(() => {})] });
    const topic = channels[0]?.topic ?? '';

    teardown();
    teardown();

    expect(removed).toEqual([topic]);
    expect(channels).toHaveLength(0);
  });

  it('drops rows delivered after teardown', () => {
    const seen: Record<string, unknown>[] = [];
    const channelBeforeTeardown = (() => {
      const teardown = subscribeToPostgresChanges({
        label: 'rows',
        bindings: [binding((row) => seen.push(row))],
      });
      const channel = channels[0];
      teardown();
      return channel;
    })();

    channelBeforeTeardown?.handlers[0]?.({ eventType: 'INSERT', new: { seq: 1 }, old: {} });

    expect(seen).toEqual([]);
  });

  it('does not subscribe until setAuth resolves, so the join is not anon', async () => {
    let release: (() => void) | undefined;
    setAuthImpl = () =>
      new Promise((resolve) => {
        release = () => resolve(undefined);
      });

    subscribeToPostgresChanges({ label: 'rows', bindings: [binding(() => {})] });

    expect(setAuth).toHaveBeenCalledTimes(1);
    expect(channels[0]?.joining).toBe(false);

    release?.();
    await flushAuth();

    expect(channels[0]?.joining).toBe(true);
  });

  it('still subscribes when setAuth rejects, so a missing session does not mute the channel forever', async () => {
    setAuthImpl = () => Promise.reject(new Error('no session'));

    subscribeToPostgresChanges({ label: 'rows', bindings: [binding(() => {})] });
    await flushAuth();

    expect(channels[0]?.joining).toBe(true);
  });

  it('joins immediately when the client has no setAuth, so a partial mock does not throw', () => {
    (fakeClient as { realtime?: { setAuth: typeof setAuth } }).realtime = undefined;

    expect(() =>
      subscribeToPostgresChanges({ label: 'rows', bindings: [binding(() => {})] }),
    ).not.toThrow();
    expect(channels[0]?.joining).toBe(true);
  });

  it('skips subscribe when torn down before setAuth resolves', async () => {
    let release: (() => void) | undefined;
    setAuthImpl = () =>
      new Promise((resolve) => {
        release = () => resolve(undefined);
      });

    const teardown = subscribeToPostgresChanges({
      label: 'rows',
      bindings: [binding(() => {})],
    });
    const channel = channels[0];
    teardown();
    release?.();
    await flushAuth();

    expect(channel?.joining).toBe(false);
  });
});

describe('pausing a hidden tab', () => {
  let visibility: DocumentVisibilityState = 'visible';
  const setVisibility = (state: DocumentVisibilityState) => {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
  };
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  // Earlier tests leave subscriptions open on the shared document, so assert on this test's
  // own label only.
  const mine = (label: string, topics: readonly string[]) =>
    topics.filter((topic) => topic.startsWith(`${label}:`));

  afterEach(() => {
    jest.useRealTimers();
    visibility = 'visible';
  });

  it('closes a backfilling subscription after the tab is hidden long enough, and rejoins with a backfill when shown', async () => {
    jest.useFakeTimers();
    const onSubscribed = mock(() => {});
    const teardown = subscribeToPostgresChanges({
      label: 'pause-a',
      bindings: [binding(() => {})],
      onSubscribed,
    });
    await flushAuth();
    expect(onSubscribed).toHaveBeenCalledTimes(1);
    const [first] = mine('pause-a', channels.map((c) => c.topic));

    setVisibility('hidden');
    jest.advanceTimersByTime(HIDDEN_PAUSE_MS - 1);
    expect(mine('pause-a', removed)).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(mine('pause-a', removed)).toEqual([first as string]);

    setVisibility('visible');
    await flushAuth();
    const reopened = mine('pause-a', channels.map((c) => c.topic));
    expect(reopened).toHaveLength(1);
    expect(reopened[0]).not.toBe(first);
    expect(onSubscribed).toHaveBeenCalledTimes(2);

    teardown();
    expect(mine('pause-a', removed)).toHaveLength(2);
  });

  it('keeps the channel when the tab comes back before the pause', () => {
    jest.useFakeTimers();
    const teardown = subscribeToPostgresChanges({
      label: 'pause-b',
      bindings: [binding(() => {})],
      onSubscribed: () => {},
    });
    setVisibility('hidden');
    jest.advanceTimersByTime(HIDDEN_PAUSE_MS - 1);
    setVisibility('visible');
    jest.advanceTimersByTime(HIDDEN_PAUSE_MS);
    expect(mine('pause-b', removed)).toEqual([]);
    teardown();
  });

  it('never pauses a subscription that cannot backfill', () => {
    jest.useFakeTimers();
    const teardown = subscribeToPostgresChanges({ label: 'pause-c', bindings: [binding(() => {})] });
    setVisibility('hidden');
    jest.advanceTimersByTime(HIDDEN_PAUSE_MS * 2);
    expect(mine('pause-c', removed)).toEqual([]);
    teardown();
  });

  it('stops listening for visibility after teardown', () => {
    jest.useFakeTimers();
    const teardown = subscribeToPostgresChanges({
      label: 'pause-d',
      bindings: [binding(() => {})],
      onSubscribed: () => {},
    });
    teardown();
    setVisibility('hidden');
    jest.advanceTimersByTime(HIDDEN_PAUSE_MS);
    setVisibility('visible');
    expect(mine('pause-d', channels.map((c) => c.topic))).toEqual([]);
    expect(mine('pause-d', removed)).toHaveLength(1);
  });
});

describe('subscribeToRowBroadcasts', () => {
  const send = (topic: string, payload: unknown) => {
    const channel = channels.find((candidate) => candidate.topic === topic);
    for (const handler of channel?.handlers ?? []) handler({ event: 'x', payload } as never);
  };

  it('joins the trigger topic as a private broadcast channel', async () => {
    const teardown = subscribeToRowBroadcasts({ topic: 'report_jobs:b1', bindings: [] });
    expect(channels[0]?.topic).toBe('report_jobs:b1');
    expect(channels[0]?.options).toEqual({ config: { private: true } });
    expect(channels[0]?.filters).toEqual([{ event: '*' }]);
    await flushAuth();
    expect(channels[0]?.joining).toBe(true);
    teardown();
  });

  it('routes each row to the bindings for its operation, with the old row as meta', () => {
    const inserts: unknown[] = [];
    const updates: unknown[] = [];
    const any: string[] = [];
    const teardown = subscribeToRowBroadcasts({
      topic: 'strategic_analysis_runs:b1',
      bindings: [
        { event: 'INSERT', onRow: (row) => inserts.push(row) },
        { event: 'UPDATE', onRow: (row, meta) => updates.push([row, meta]) },
        { event: '*', onRow: (_row, meta) => any.push(meta.eventType) },
      ],
    });
    send('strategic_analysis_runs:b1', {
      operation: 'UPDATE',
      record: { id: 'r1', status: 'completed' },
      old_record: { status: 'running' },
    });
    send('strategic_analysis_runs:b1', { operation: 'DELETE', record: { id: 'r1' } });

    expect(inserts).toEqual([]);
    expect(updates).toEqual([
      [{ id: 'r1', status: 'completed' }, { eventType: 'UPDATE', old: { status: 'running' } }],
    ]);
    expect(any).toEqual(['UPDATE', 'DELETE']);
    teardown();
  });

  it('drops a message that is not a row change', () => {
    const onRow = mock(() => {});
    const teardown = subscribeToRowBroadcasts({ topic: 't:1', bindings: [{ event: '*', onRow }] });
    send('t:1', { operation: 'TRUNCATE', record: {} });
    send('t:1', { operation: 'INSERT', record: null });
    send('t:1', 'nonsense');
    expect(onRow).not.toHaveBeenCalled();
    teardown();
  });

  it('shares one channel per topic and closes it with the last subscriber', async () => {
    const a = mock(() => {});
    const b = mock(() => {});
    const lateSubscribed = mock(() => {});
    const first = subscribeToRowBroadcasts({ topic: 'notifications:u1', bindings: [{ event: 'INSERT', onRow: a }] });
    await flushAuth();
    const second = subscribeToRowBroadcasts({
      topic: 'notifications:u1',
      bindings: [{ event: 'INSERT', onRow: b }],
      onSubscribed: lateSubscribed,
    });
    expect(channels).toHaveLength(1);
    // Joined before the second arrived: it is told at once instead of waiting forever.
    expect(lateSubscribed).toHaveBeenCalledTimes(1);

    send('notifications:u1', { operation: 'INSERT', record: { id: 'n1' } });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    first();
    first();
    expect(removed).toHaveLength(0);
    send('notifications:u1', { operation: 'INSERT', record: { id: 'n2' } });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);

    second();
    expect(removed).toEqual(['notifications:u1']);
  });

  it('does not join a topic everyone left before setAuth resolved', async () => {
    let release: (() => void) | undefined;
    setAuthImpl = () =>
      new Promise((resolve) => {
        release = () => resolve(undefined);
      });
    const teardown = subscribeToRowBroadcasts({ topic: 't:2', bindings: [] });
    const channel = channels[0];
    teardown();
    release?.();
    await flushAuth();
    expect(channel?.joining).toBe(false);
  });
});
