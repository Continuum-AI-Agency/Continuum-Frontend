'use client';

// The one place that owns Supabase Realtime `postgres_changes` subscriptions.
//
// WHY IT EXISTS: a channel topic is a GLOBAL namespace on the browser client, and
// `supabase.channel(topic)` silently hands back an EXISTING channel when the topic
// matches. Two independent subscribers that happen to build the same string therefore
// share one channel object — and because `.subscribe()` flips the channel to `joining`
// synchronously, the second subscriber's `.on('postgres_changes', ...)` throws outright.
// That crashed the whole authenticated app to the global 500 boundary every time a canvas
// composer run went live, because its two tails built the same topic.
//
// A `postgres_changes` topic carries no meaning — the binding filter carries all of it —
// so the fix is to make the topic unique by construction and let the label survive only as
// something greppable in devtools. Broadcast and presence are the opposite: their topic IS
// the rendezvous between peers, so peer channels (canvas cursors, presence) keep
// hand-rolling their own shared channel. The one broadcast kind owned here is the database's
// own row broadcasts — see `subscribeToRowBroadcasts` at the bottom.
//
// The other half of the contract is teardown. `channel.unsubscribe()` leaves the dead
// channel in the client's registry, where a later `channel()` call for the same topic will
// find it; only `removeChannel` evicts it. This helper always does the latter.

import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from './client';

type ChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

/**
 * What a row arrived as, for the rare caller that cannot infer it from its binding.
 *
 * Reach for this ONLY when the event genuinely cannot be split apart — an UPDATE that
 * has to compare the previous row against the new one is the real case. When a handler
 * merely branches on `eventType`, register one binding per event instead: three small
 * handlers read better than one with a switch, and the binding already carries the fact.
 */
export type PostgresChangeMeta = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  /** The pre-change row. Populated on UPDATE and DELETE, `{}` on INSERT. */
  old: Record<string, unknown>;
};

export type PostgresChangesBinding = {
  event: ChangeEvent;
  schema: string;
  table: string;
  /** `column=operator.value`, e.g. `run_id=eq.<uuid>`. */
  filter?: string;
  /** A Realtime row is untrusted JSON — narrow it in the caller, never cast it. */
  onRow: (row: Record<string, unknown>, meta: PostgresChangeMeta) => void;
};

export type PostgresChangesSubscription = {
  /** Human-readable prefix for the generated topic. Debugging aid only — never an identity. */
  label: string;
  /** Every binding is registered BEFORE subscribe, which is the only legal ordering. */
  bindings: readonly PostgresChangesBinding[];
  /** Runs once the channel is live. Suppressed after teardown. */
  onSubscribed?: () => void | Promise<void>;
  /**
   * Every status the socket reports, for callers that show connection state.
   * `onSubscribed` stays the place to run a backfill; this is for the UI.
   */
  onStatus?: (status: string) => void;
  /**
   * Passed straight to `supabase.channel(topic, options)`.
   *
   * Load-bearing for `config: { private: true }` — an authorized channel that loses its
   * option silently becomes a public one, which is a permissions regression no type
   * checks. A `config: { broadcast: … }` on a channel with no broadcast binding is cargo
   * cult; drop it rather than threading it through here.
   */
  channelOptions?: Parameters<ReturnType<typeof createSupabaseBrowserClient>['channel']>[1];
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

/** A DELETE reports the vanished row under `old`; everything else reports it under `new`. */
const rowFromPayload = (
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
): Record<string, unknown> | null => {
  const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
  return row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
};

const bind = (channel: RealtimeChannel, binding: PostgresChangesBinding): void => {
  channel.on<Record<string, unknown>>(
    'postgres_changes',
    {
      event: binding.event,
      schema: binding.schema,
      table: binding.table,
      ...(binding.filter ? { filter: binding.filter } : {}),
    },
    (payload) => {
      const row = rowFromPayload(payload);
      if (row) {
        binding.onRow(row, {
          eventType: payload.eventType,
          old: asRecord(payload.old),
        });
      }
    },
  );
};

/**
 * Join once the socket carries the viewer's token. A join sent before setAuth is
 * `claims_role = anon`: the channel reports SUBSCRIBED and then delivers nothing until the
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

/** How long a tab stays hidden before its postgres_changes channels are dropped. */
export const HIDDEN_PAUSE_MS = 5 * 60_000;

/**
 * While ANY postgres_changes subscription exists, Realtime polls the database and decodes
 * the whole WAL several times a second — it was a quarter of all DB time. A tab left in the
 * background is the subscription nobody is reading, so after {@link HIDDEN_PAUSE_MS}
 * hidden it closes, and it reopens when the tab is shown again.
 */
function pauseWhileHidden(open: () => void, close: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  let paused = false;
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      timer ??= setTimeout(() => {
        timer = null;
        paused = true;
        close();
      }, HIDDEN_PAUSE_MS);
      return;
    }
    if (timer) clearTimeout(timer);
    timer = null;
    if (paused) {
      paused = false;
      open();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/**
 * Subscribe to one or more `postgres_changes` streams on a channel nobody else can reach.
 *
 * A subscription with `onSubscribed` closes while its tab is hidden (see
 * {@link pauseWhileHidden}) and rejoins on a fresh channel when shown, where
 * `onSubscribed` backfills what it missed. One without it stays open: it has no way to
 * catch up.
 *
 * Returns an idempotent teardown. Callers that tear down early (a terminal event, a
 * watchdog) can call it and still return it from their effect cleanup.
 */
export function subscribeToPostgresChanges({
  label,
  bindings,
  onSubscribed,
  onStatus,
  channelOptions,
}: PostgresChangesSubscription): () => void {
  const supabase = createSupabaseBrowserClient();
  // The live channel; null once paused or torn down. Every callback checks it is still
  // the one it was made for, so nothing from a closed channel reaches the caller.
  let channel: RealtimeChannel | null = null;
  let closed = false;

  const open = () => {
    const topic = `${label}:${crypto.randomUUID()}`;
    const current = channelOptions
      ? supabase.channel(topic, channelOptions)
      : supabase.channel(topic);
    channel = current;
    // Bindings are registered before the join, the only legal ordering.
    for (const binding of bindings) {
      bind(current, {
        ...binding,
        onRow: (row, meta) => {
          if (channel === current) binding.onRow(row, meta);
        },
      });
    }
    afterAuth(supabase, () => {
      if (channel !== current) return;
      current.subscribe((status) => {
        if (channel !== current) return;
        onStatus?.(status);
        if (status !== 'SUBSCRIBED') return;
        void onSubscribed?.();
      });
    });
  };
  const close = () => {
    if (!channel) return;
    const current = channel;
    channel = null;
    void supabase.removeChannel(current);
  };

  open();
  const stopPausing = onSubscribed ? pauseWhileHidden(open, close) : undefined;

  return () => {
    if (closed) return;
    closed = true;
    stopPausing?.();
    close();
  };
}

// ── Row broadcasts ──────────────────────────────────────────────────────────────────────
//
// The tables every signed-in tab watches (notifications, the render queue, report jobs,
// strategic runs, generation jobs) are pushed by database triggers instead: each change goes
// to a private topic `<table>:<scope>` that the `realtime.messages` policy admits exactly the
// row's audience to (supabase/migrations/20261028070000_realtime_row_broadcasts.sql). That
// costs the database one insert per change, not a poll several times a second, and it is
// why these do not pause while hidden.
//
// Here the topic IS the rendezvous, so two subscribers to one topic must share one channel:
// a second `channel(topic)` hands back the joined one, and a second `subscribe()` throws.
// One channel per topic fans each message out to every live subscriber.

export type RowBroadcastBinding = {
  event: ChangeEvent;
  /** A Realtime row is untrusted JSON — narrow it in the caller, never cast it. */
  onRow: (row: Record<string, unknown>, meta: PostgresChangeMeta) => void;
};

export type RowBroadcastSubscription = {
  /** `<table>:<scope uuid>`, exactly as the table's trigger sends it. */
  topic: string;
  bindings: readonly RowBroadcastBinding[];
  /** Runs once the channel is live, and again after every rejoin: the place to backfill. */
  onSubscribed?: () => void | Promise<void>;
  onStatus?: (status: string) => void;
};

type SharedTopic = {
  channel: RealtimeChannel;
  subscribers: Set<RowBroadcastSubscription>;
  status: string | null;
};

const sharedTopics = new Map<string, SharedTopic>();

const isOperation = (value: unknown): value is PostgresChangeMeta['eventType'] =>
  value === 'INSERT' || value === 'UPDATE' || value === 'DELETE';

/** `{ operation, record, old_record }` from the trigger; anything else is dropped. */
const deliver = (shared: SharedTopic, message: unknown): void => {
  const payload = asRecord(asRecord(message).payload);
  const operation = payload.operation;
  const record = payload.record;
  if (!isOperation(operation) || !record || typeof record !== 'object') return;
  const meta: PostgresChangeMeta = { eventType: operation, old: asRecord(payload.old_record) };
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
    const supabase = createSupabaseBrowserClient();
    const entry: SharedTopic = {
      channel: supabase.channel(topic, { config: { private: true } }),
      subscribers: new Set([subscriber]),
      status: null,
    };
    shared = entry;
    sharedTopics.set(topic, entry);
    entry.channel.on('broadcast', { event: '*' }, (message) => deliver(entry, message));
    afterAuth(supabase, () => {
      if (sharedTopics.get(topic) !== entry) return;
      entry.channel.subscribe((status) => {
        if (sharedTopics.get(topic) !== entry) return;
        entry.status = status;
        for (const each of entry.subscribers) {
          each.onStatus?.(status);
          if (status === 'SUBSCRIBED') void each.onSubscribed?.();
        }
      });
    });
  }

  const entry = shared;
  return () => {
    if (!entry.subscribers.delete(subscriber) || entry.subscribers.size > 0) return;
    if (sharedTopics.get(topic) === entry) sharedTopics.delete(topic);
    void createSupabaseBrowserClient().removeChannel(entry.channel);
  };
}
