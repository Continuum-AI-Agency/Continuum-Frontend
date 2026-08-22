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

const fakeClient = {
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

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => fakeClient,
}));

import { subscribeToPostgresChanges } from './realtime';

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

  it('binds before subscribing, so a second binding never hits the joined guard', () => {
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

  it('reports every status to onStatus but only SUBSCRIBED to onSubscribed', () => {
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

    expect(statuses).toEqual(['CHANNEL_ERROR', 'SUBSCRIBED', 'CLOSED']);
    expect(backfills).toBe(1);
  });

  it('runs onSubscribed once the channel is live', () => {
    let live = false;
    subscribeToPostgresChanges({
      label: 'rows',
      bindings: [binding(() => {})],
      onSubscribed: () => {
        live = true;
      },
    });

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
});
