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
// the rendezvous between peers, so they keep hand-rolling their own shared channel and must
// NOT come through here.
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
 * Subscribe to one or more `postgres_changes` streams on a channel nobody else can reach.
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
  const topic = `${label}:${crypto.randomUUID()}`;
  const channel = channelOptions
    ? supabase.channel(topic, channelOptions)
    : supabase.channel(topic);
  let closed = false;

  for (const binding of bindings) {
    bind(channel, {
      ...binding,
      onRow: (row, meta) => {
        if (!closed) binding.onRow(row, meta);
      },
    });
  }

  channel.subscribe((status) => {
    if (closed) return;
    onStatus?.(status);
    if (status !== 'SUBSCRIBED') return;
    void onSubscribed?.();
  });

  return () => {
    if (closed) return;
    closed = true;
    void supabase.removeChannel(channel);
  };
}
