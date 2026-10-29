import { afterEach, describe, expect, it, mock } from 'bun:test';

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
  subscribe: (callback?: (status: string, error?: Error) => void) => FakeChannel;
};

const channels: FakeChannel[] = [];
const removed: string[] = [];
/** Statuses the NEXT created channel will report. Reset per test. */
let nextStatuses: string[] | null = null;
/** When set, removeChannel keeps the channel registered until it resolves (the leave ack). */
let leaveAck: Promise<void> | null = null;
/** The error a CHANNEL_ERROR status carries, as realtime-js passes it. Reset per test. */
let channelError: Error | undefined;

const makeChannel = (topic: string, options?: unknown): FakeChannel => {
  const channel: FakeChannel = {
    topic,
    options,
    joining: false,
    statuses: nextStatuses ?? ['SUBSCRIBED'],
    handlers: [],
    filters: [],
    on: (_type, filter, callback) => {
      channel.filters.push(filter);
      channel.handlers.push(callback);
      return channel;
    },
    subscribe: (callback) => {
      // realtime-js: a second subscribe() on a live (or still leaving) channel does nothing.
      if (channel.joining) return channel;
      channel.joining = true;
      for (const status of channel.statuses)
        callback?.(status, status === 'CHANNEL_ERROR' ? channelError : undefined);
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
    if (leaveAck) await leaveAck;
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

import { subscribeToRowBroadcasts } from './realtime';

afterEach(() => {
  channels.length = 0;
  removed.length = 0;
  nextStatuses = null;
  leaveAck = null;
  channelError = undefined;
  setAuthImpl = () => Promise.resolve();
  setAuth.mockClear();
  fakeClient.realtime = { setAuth };
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

  it('hands a DELETE the deleted row as meta.old too, as postgres_changes did', () => {
    const olds: unknown[] = [];
    const teardown = subscribeToRowBroadcasts({
      topic: 'asset_field_values:b1',
      bindings: [{ event: 'DELETE', onRow: (_row, meta) => olds.push(meta.old) }],
    });
    send('asset_field_values:b1', {
      operation: 'DELETE',
      record: { asset_id: 'a1', field_id: 'f1' },
      old_record: {},
    });
    expect(olds).toEqual([{ asset_id: 'a1', field_id: 'f1' }]);
    teardown();
  });

  it('reports every status to onStatus but only SUBSCRIBED to onSubscribed', async () => {
    nextStatuses = ['CHANNEL_ERROR', 'SUBSCRIBED'];
    const statuses: string[] = [];
    const onSubscribed = mock(() => {});
    const teardown = subscribeToRowBroadcasts({
      topic: 'assets:b1',
      bindings: [],
      onStatus: (status) => statuses.push(status),
      onSubscribed,
    });
    await flushAuth();
    expect(statuses).toEqual(['CHANNEL_ERROR', 'SUBSCRIBED']);
    expect(onSubscribed).toHaveBeenCalledTimes(1);
    // A transient error is left to realtime-js to rejoin.
    expect(removed).toEqual([]);
    teardown();
  });

  it('gives up on a topic the server refuses instead of rejoining it forever', async () => {
    nextStatuses = ['CHANNEL_ERROR'];
    channelError = new Error(
      'Unauthorized: You do not have permissions to read from this Channel topic: assets:b1',
    );
    const teardown = subscribeToRowBroadcasts({ topic: 'assets:b1', bindings: [] });
    await flushAuth();
    expect(removed).toEqual(['assets:b1']);
    teardown();
  });

  it('does not subscribe until setAuth resolves, so the join is not anon', async () => {
    let release: (() => void) | undefined;
    setAuthImpl = () =>
      new Promise((resolve) => {
        release = () => resolve(undefined);
      });
    const teardown = subscribeToRowBroadcasts({ topic: 'assets:b1', bindings: [] });
    expect(setAuth).toHaveBeenCalledTimes(1);
    expect(channels[0]?.joining).toBe(false);
    release?.();
    await flushAuth();
    expect(channels[0]?.joining).toBe(true);
    teardown();
  });

  it('still subscribes when setAuth rejects, so a missing session does not mute the topic', async () => {
    setAuthImpl = () => Promise.reject(new Error('no session'));
    const teardown = subscribeToRowBroadcasts({ topic: 'assets:b1', bindings: [] });
    await flushAuth();
    expect(channels[0]?.joining).toBe(true);
    teardown();
  });

  it('joins immediately when the client has no setAuth, so a partial mock does not throw', () => {
    (fakeClient as { realtime?: { setAuth: typeof setAuth } }).realtime = undefined;
    const teardown = subscribeToRowBroadcasts({ topic: 'assets:b1', bindings: [] });
    expect(channels[0]?.joining).toBe(true);
    teardown();
  });

  it('rejoins a topic on a fresh channel only once the old one has left', async () => {
    let ack: (() => void) | undefined;
    leaveAck = new Promise((resolve) => {
      ack = resolve;
    });
    const first = subscribeToRowBroadcasts({ topic: 'assets:b1', bindings: [] });
    await flushAuth();
    const old = channels[0];
    first();
    // An effect re-running on a dependency change: same topic, same tick.
    const onRow = mock(() => {});
    const second = subscribeToRowBroadcasts({
      topic: 'assets:b1',
      bindings: [{ event: 'INSERT', onRow }],
    });
    // The client would hand back the leaving channel, whose subscribe() is a no-op.
    expect(channels).toEqual([old as FakeChannel]);

    ack?.();
    await flushAuth();
    await flushAuth();
    expect(channels).toHaveLength(1);
    expect(channels[0]).not.toBe(old);
    expect(channels[0]?.joining).toBe(true);
    send('assets:b1', { operation: 'INSERT', record: { id: 'a1' } });
    expect(onRow).toHaveBeenCalledTimes(1);
    second();
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
