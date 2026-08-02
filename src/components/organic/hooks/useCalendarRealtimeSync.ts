'use client';

import * as React from 'react';

import { useCalendarStore } from '@/lib/organic/store';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';

const REFETCH_DEBOUNCE_MS = 400;

/**
 * Keeps the planner authoritative with the server: subscribes to Supabase
 * Realtime postgres_changes on organic.organic_calendar_drafts for the active
 * brand and nudges the existing nonce-refetch whenever a draft is written by
 * ANY path — including out-of-band agent writes (conversational tools, the
 * Stage-2 blueprint worker, scheduled jobs) that the run-stream isn't carrying.
 *
 * It does not mutate the store itself; it requests a refetch so the canonical
 * server rows (re-signed media, correct keying) win. Bursts (text -> blueprint
 * -> media on one draft) are coalesced by a short debounce. The fetch-all reload
 * pulls in the draft wherever it landed, so no off-window nudge is needed.
 *
 * The subscription goes through `subscribeToPostgresChanges` rather than
 * `supabase.channel(...)` directly. A hand-composed topic is a GLOBAL name on the
 * browser client, so a second subscriber that builds the same string is handed THIS
 * channel mid-join and its `.on(...)` throws outright — a collision that took the whole
 * authenticated app to the global error boundary once already.
 */
export function useCalendarRealtimeSync(args: { brandProfileId?: string }) {
  const { brandProfileId } = args;
  const requestCalendarRefetch = useCalendarStore((state) => state.requestCalendarRefetch);

  React.useEffect(() => {
    if (!brandProfileId) return;

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToPostgresChanges({
      label: `organic-calendar-drafts-${brandProfileId}`,
      bindings: [
        {
          event: '*',
          schema: 'organic',
          table: 'organic_calendar_drafts',
          filter: `brand_id=eq.${brandProfileId}`,
          onRow: () => {
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => requestCalendarRefetch(), REFETCH_DEBOUNCE_MS);
          },
        },
      ],
    });

    return () => {
      if (debounce) clearTimeout(debounce);
      unsubscribe();
    };
  }, [brandProfileId, requestCalendarRefetch]);
}
