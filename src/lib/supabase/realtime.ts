'use client';

// The one place that owns Supabase Realtime row subscriptions.
//
// Every table the app watches is pushed by a database trigger: each change goes to a private
// Broadcast topic `<table>:<scope>` that the `realtime.messages` policy admits exactly the
// row's audience to (supabase/migrations/20261028070000_realtime_row_broadcasts.sql and
// 20261028092000_realtime_row_broadcasts_rest.sql). There are no `postgres_changes`
// subscriptions left: while ANY exists, Realtime polls the database and decodes the whole
// WAL several times a second, which was a quarter of all DB time. Broadcast costs one insert
// per change instead, so nothing here pauses while a tab is hidden.
//
// The topic is the rendezvous, so two subscribers to one topic must share one channel:
// `supabase.channel(topic)` silently hands back an EXISTING channel for a matching topic; a
// late binding on a joined channel threw (that crashed the whole authenticated app to the
// global 500 boundary more than once), and a second `.subscribe()` on it does nothing. Peer
// channels (canvas cursors, presence) keep their own hand-built topics. Teardown always goes
// through `removeChannel`: `unsubscribe()` leaves the dead channel in the client's registry,
// where the next `channel()` for that topic finds it.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from './client';

type ChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

/** What a row arrived as, for the caller whose handler serves more than one event. */
export type PostgresChangeMeta = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  /**
   * The pre-change row. On DELETE it is the deleted row (the same object the binding gets);
   * on UPDATE, only the columns the table's trigger sends as `old_record` (usually none).
   */
  old: Record<string, unknown>;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

/**
 * Join once the socket carries the viewer's token. A join sent before setAuth is
 * `claims_role = anon`: a private topic is refused, a public one delivers nothing until the
 * next heartbeat. Measured on the render queue; every subscriber here gets the wait.
 */
const afterAuth = (
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  join: () => void,
): void => {
  const pending = supabase.realtime?.setAuth?.();
  if (pending != null && typeof (pending as PromiseLike<unknown>).then === 'function') {
    void Promise.resolve(pending)
      .catch(() => undefined)
      .then(join);
  } else {
    join();
  }
};

export type RowBroadcastBinding = {
  event: ChangeEvent;
  /** A Realtime row is untrusted JSON — narrow it in the caller, never cast it. */
  onRow: (row: Record<string, unknown>, meta: PostgresChangeMeta) => void;
};

export type RowBroadcastSubscription = {
  /**
   * `<table>:<scope>`, exactly as the table's trigger sends it. The scope is the ONE column
   * the topic is keyed on (usually the brand); filter anything finer in `onRow`.
   */
  topic: string;
  bindings: readonly RowBroadcastBinding[];
  /** Runs once the channel is live, and again after every rejoin: the place to backfill. */
  onSubscribed?: () => void | Promise<void>;
  onStatus?: (status: string) => void;
};

type SharedTopic = {
  /** Null while the topic's previous channel is still leaving (see `leaving`). */
  channel: RealtimeChannel | null;
  subscribers: Set<RowBroadcastSubscription>;
  status: string | null;
};

const sharedTopics = new Map<string, SharedTopic>();

/**
 * Topics whose last channel is still leaving. `removeChannel` drops a joined channel from
 * the client's registry only when the server acks the leave, and until then
 * `supabase.channel(topic)` hands that leaving channel back, on which `subscribe()` is a
 * silent no-op. An effect that re-runs on a dependency change does exactly that, so a new
 * channel for the topic waits for the old one to be gone.
 */
const leaving = new Map<string, Promise<unknown>>();

const isOperation = (value: unknown): value is PostgresChangeMeta['eventType'] =>
  value === 'INSERT' || value === 'UPDATE' || value === 'DELETE';

/** `{ operation, record, old_record }` from the trigger; anything else is dropped. */
const deliver = (shared: SharedTopic, message: unknown): void => {
  const payload = asRecord(asRecord(message).payload);
  const operation = payload.operation;
  const record = payload.record;
  if (!isOperation(operation) || !record || typeof record !== 'object') return;
  const meta: PostgresChangeMeta = {
    eventType: operation,
    old: operation === 'DELETE' ? (record as Record<string, unknown>) : asRecord(payload.old_record),
  };
  for (const subscriber of shared.subscribers) {
    for (const binding of subscriber.bindings) {
      if (binding.event === '*' || binding.event === operation) {
        binding.onRow(record as Record<string, unknown>, meta);
      }
    }
  }
};

/**
 * Subscribe to the rows a database trigger broadcasts on a private topic.
 *
 * Returns an idempotent teardown; the channel closes when its last subscriber leaves.
 */
export function subscribeToRowBroadcasts(subscription: RowBroadcastSubscription): () => void {
  // A copy, so the same object passed twice still counts as two subscribers.
  const subscriber = { ...subscription };
  const { topic } = subscriber;
  let shared = sharedTopics.get(topic);

  if (shared) {
    shared.subscribers.add(subscriber);
    if (shared.status === 'SUBSCRIBED') {
      subscriber.onStatus?.('SUBSCRIBED');
      void subscriber.onSubscribed?.();
    }
  } else {
    const entry: SharedTopic = { channel: null, subscribers: new Set([subscriber]), status: null };
    shared = entry;
    sharedTopics.set(topic, entry);
    const open = () => {
      if (sharedTopics.get(topic) !== entry) return;
      const supabase = createSupabaseBrowserClient();
      const channel = supabase.channel(topic, { config: { private: true } });
      entry.channel = channel;
      channel.on('broadcast', { event: '*' }, (message) => deliver(entry, message));
      afterAuth(supabase, () => {
        if (sharedTopics.get(topic) !== entry) return;
        channel.subscribe((status, error) => {
          if (sharedTopics.get(topic) !== entry) return;
          entry.status = status;
          // A refused join is final: realtime-js would otherwise rejoin every ~10 s for the
          // life of the tab, and each attempt re-runs the topic policy in the database.
          if (status === 'CHANNEL_ERROR' && /unauthori[sz]ed/i.test(error?.message ?? '')) {
            void supabase.removeChannel(channel);
          }
          for (const each of entry.subscribers) {
            each.onStatus?.(status);
            if (status === 'SUBSCRIBED') void each.onSubscribed?.();
          }
        });
      });
    };
    const previous = leaving.get(topic);
    if (previous) void previous.then(open);
    else open();
  }

  const entry = shared;
  return () => {
    if (!entry.subscribers.delete(subscriber) || entry.subscribers.size > 0) return;
    if (sharedTopics.get(topic) === entry) sharedTopics.delete(topic);
    if (!entry.channel) return;
    const left = Promise.resolve(createSupabaseBrowserClient().removeChannel(entry.channel)).catch(
      () => undefined,
    );
    leaving.set(topic, left);
    void left.then(() => {
      if (leaving.get(topic) === left) leaving.delete(topic);
    });
  };
}
