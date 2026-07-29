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

export type PostgresChangesBinding = {
  event: ChangeEvent;
  schema: string;
  table: string;
  /** `column=operator.value`, e.g. `run_id=eq.<uuid>`. */
  filter?: string;
  /** A Realtime row is untrusted JSON — narrow it in the caller, never cast it. */
  onRow: (row: Record<string, unknown>) => void;
};

export type PostgresChangesSubscription = {
  /** Human-readable prefix for the generated topic. Debugging aid only — never an identity. */
  label: string;
  /** Every binding is registered BEFORE subscribe, which is the only legal ordering. */
  bindings: readonly PostgresChangesBinding[];
  /** Runs once the channel is live. Suppressed after teardown. */
  onSubscribed?: () => void | Promise<void>;
};

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
      if (row) binding.onRow(row);
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
}: PostgresChangesSubscription): () => void {
  const supabase = createSupabaseBrowserClient();
  const channel = supabase.channel(`${label}:${crypto.randomUUID()}`);
  let closed = false;

  for (const binding of bindings) {
    bind(channel, {
      ...binding,
      onRow: (row) => {
        if (!closed) binding.onRow(row);
      },
    });
  }

  channel.subscribe((status) => {
    if (closed || status !== 'SUBSCRIBED') return;
    void onSubscribed?.();
  });

  return () => {
    if (closed) return;
    closed = true;
    void supabase.removeChannel(channel);
  };
}
