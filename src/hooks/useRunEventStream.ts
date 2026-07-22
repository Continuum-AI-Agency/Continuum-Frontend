'use client';

import { useEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { readNdjsonStream } from '@/lib/streaming/readNdjsonStream';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export type ParsedRunEvent = {
  seq: number;
  eventId: string;
  type: string;
  data: Record<string, unknown>;
  ts: string;
};

export type RunStreamStatus = 'idle' | 'connecting' | 'live' | 'completed' | 'failed' | 'timed_out';

const TERMINAL_TYPES = new Set(['run_completed', 'run_failed', 'complete', 'error']);
// 5 minutes — if no terminal event arrives, the watchdog fires and unsubscribes
const STREAM_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Decide how to terminate a run when the watchdog fires (no terminal event
 * arrived in time). A run that emitted at least one event produced real work
 * (drafts/placements landed); a missing terminal row is a backend gap, not a
 * user-facing failure — resolve it as `completed` (partial) so the consumer does
 * not surface "Generation run did not complete". A run that emitted nothing at
 * all is a genuine stall and stays `timed_out`.
 */
export function resolveWatchdogStatus(receivedAnyEvent: boolean): RunStreamStatus {
  return receivedAnyEvent ? 'completed' : 'timed_out';
}

/**
 * Subscribes to run events for a given runId using Supabase Realtime (INSERT on
 * organic.organic_agent_run_events) and an initial HTTP hydration pass. Replaces
 * the polling loops in useCalendarRunStream and useBulkRunProgress.
 *
 * Subscribe happens BEFORE hydration so no events are missed in the gap.
 * Seq-number deduplication handles any overlap.
 */
export function useRunEventStream(
  runId: string | null,
  onEvent: (event: ParsedRunEvent) => void,
): { status: RunStreamStatus } {
  const [status, setStatus] = useState<RunStreamStatus>('idle');
  // Keep onEvent ref-stable so the effect doesn't re-run when the callback identity changes
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!runId) {
      setStatus('idle');
      return;
    }

    setStatus('connecting');
    let cancelled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let highestSeq = -1;
    // Tracks whether this run delivered any event. Drives the watchdog's decision
    // to resolve as completed-partial vs hard timeout (see resolveWatchdogStatus).
    let receivedAnyEvent = false;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`run-events:${runId}`);

    const terminateWith = (termStatus: RunStreamStatus) => {
      if (cancelled) return;
      cancelled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      setStatus(termStatus);
      void channel.unsubscribe();
    };

    const dispatchEvent = (event: ParsedRunEvent) => {
      if (cancelled) return;
      if (event.seq <= highestSeq) return;
      highestSeq = event.seq;
      receivedAnyEvent = true;

      onEventRef.current(event);

      if (TERMINAL_TYPES.has(event.type)) {
        terminateWith(
          event.type === 'run_failed' || event.type === 'error' ? 'failed' : 'completed',
        );
      }
    };

    timeoutHandle = setTimeout(
      () => terminateWith(resolveWatchdogStatus(receivedAnyEvent)),
      STREAM_TIMEOUT_MS,
    );

    // Subscribe first, then hydrate — ensures no events are lost in the window
    // between hydration completing and the subscription activating.
    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'organic',
          table: 'organic_agent_run_events',
          filter: `run_id=eq.${runId}`,
        },
        (realtimePayload) => {
          if (cancelled) return;
          const row = realtimePayload.new as Record<string, unknown>;
          dispatchEvent({
            seq: typeof row.seq === 'number' ? row.seq : -1,
            eventId: typeof row.event_id === 'string' ? row.event_id : '',
            type: typeof row.type === 'string' ? row.type : '',
            data: (row.payload as Record<string, unknown>) ?? {},
            ts: typeof row.created_at === 'string' ? row.created_at : '',
          });
        },
      )
      .subscribe(async (channelStatus) => {
        if (cancelled || channelStatus !== 'SUBSCRIBED') return;

        try {
          const token = await getBrowserAccessToken();
          if (!token || cancelled) return;

          const url = `${getApiBaseUrl()}/api/organic/agent/runs/${runId}/events?after_seq=0`;
          const response = await fetch(url, {
            headers: { Accept: 'application/x-ndjson', Authorization: `Bearer ${token}` },
          });

          if (!response.ok || !response.body || cancelled) {
            if (!cancelled) setStatus('live');
            return;
          }

          await readNdjsonStream({
            reader: response.body.getReader(),
            onLine: (line) => {
              if (cancelled) return;
              try {
                const parsed = JSON.parse(line) as Record<string, unknown>;
                dispatchEvent({
                  seq: typeof parsed.seq === 'number' ? parsed.seq : -1,
                  eventId: typeof parsed.eventId === 'string' ? parsed.eventId : '',
                  type: typeof parsed.type === 'string' ? parsed.type : '',
                  data: (parsed.data as Record<string, unknown>) ?? {},
                  ts: typeof parsed.ts === 'string' ? parsed.ts : '',
                });
              } catch {
                // skip malformed lines
              }
            },
          });

          if (!cancelled) setStatus('live');
        } catch {
          // Hydration failure is non-fatal — Realtime will deliver new events
          if (!cancelled) setStatus('live');
        }
      });

    return () => {
      cancelled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      void channel.unsubscribe();
    };
  }, [runId]);

  return { status };
}
