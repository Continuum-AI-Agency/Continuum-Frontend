'use client';

// ONE hook that tails EITHER agent's run.
//
// This is the payoff of the shared run contract. Organic keyed its events on
// `(run_id, seq)` and replayed via `?after_seq=`; Jaina keyed on an identity bigint and
// replayed via `?after_id=`; Organic wrapped frames in the contracts envelope and Jaina
// sent bare `{type,data}`. Same idea, two shapes — so a shared tailer was impossible and
// each surface grew its own. Now both emit `{eventId, seq, ts, type, data}` and both
// replay on `after_seq`, and the ONLY thing that varies is which table to listen to.
//
// Subscribe-then-hydrate, never the reverse: Realtime goes live BEFORE the backlog fetch,
// so a frame emitted during the fetch is not lost in the gap. Overlap is expected and
// harmless — the store dedupes by seq.

import {
  type AgentKind,
  type AgentRunEventDto,
  isTerminalAgentRunStatus,
} from '@continuum/contracts';
import { useEffect } from 'react';
import { useAgentRunStore } from '@/lib/agents/runStore';
import { getApiBaseUrl } from '@/lib/api/config';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';
import { readNdjsonStream } from '@/lib/streaming/readNdjsonStream';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';

type RunEventSource = {
  schema: string;
  table: string;
  /** Replay endpoint, given a runId. Returns NDJSON of every event with seq > after_seq. */
  eventsUrl: (runId: string, afterSeq: number) => string;
};

/**
 * Every long-running agent now carries a durable event log. Canvas still follows
 * its run row for terminal status, while this shared tail restores missed narration.
 */
export type RunEventAgentKind = AgentKind;

export const shouldForgetUnavailableRun = (status: number): boolean =>
  status === 403 || status === 404;

const RUN_EVENT_SOURCES: Record<RunEventAgentKind, RunEventSource> = {
  organic: {
    schema: 'organic',
    table: 'organic_agent_run_events',
    eventsUrl: (runId, afterSeq) =>
      `${getApiBaseUrl()}/api/organic/agent/runs/${runId}/events?after_seq=${afterSeq}`,
  },
  jaina: {
    schema: 'jaina',
    table: 'jaina_conversation_run_events',
    eventsUrl: (runId, afterSeq) =>
      `${getApiBaseUrl()}/api/agents/jaina/chat/runs/${runId}/events?after_seq=${afterSeq}`,
  },
  hyperframes: {
    schema: 'brand_profiles',
    table: 'ai_studio_hyperframe_run_events',
    eventsUrl: (runId, afterSeq) =>
      `${getApiBaseUrl()}/api/ai-studio/hyperframes-agent/runs/${runId}/events?after_seq=${afterSeq}`,
  },
  canvas: {
    schema: 'brand_profiles',
    table: 'ai_studio_canvas_composer_run_events',
    eventsUrl: (runId, afterSeq) =>
      `${getApiBaseUrl()}/api/ai-studio/canvas/compose/runs/${runId}/events?after_seq=${afterSeq}`,
  },
};

/** A Realtime row is untrusted JSON; narrow it rather than casting. */
const rowToEvent = (row: Record<string, unknown>): AgentRunEventDto | null => {
  const seq = typeof row.seq === 'number' ? row.seq : null;
  const type =
    typeof row.type === 'string'
      ? row.type
      : typeof row.event_type === 'string'
        ? row.event_type
        : null;
  if (seq === null || !type) return null;

  return {
    seq,
    type,
    eventId: typeof row.event_id === 'string' ? row.event_id : `evt_${seq}`,
    ts:
      typeof row.ts === 'string'
        ? row.ts
        : typeof row.created_at === 'string'
          ? row.created_at
          : new Date().toISOString(),
    data:
      (row.data as Record<string, unknown> | undefined) ??
      (row.payload as Record<string, unknown> | undefined) ??
      {},
  };
};

const parseNdjsonEvent = (line: string): AgentRunEventDto | null => {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const seq = typeof parsed.seq === 'number' ? parsed.seq : null;
    const type = typeof parsed.type === 'string' ? parsed.type : null;
    if (seq === null || !type) return null;
    return {
      seq,
      type,
      eventId: typeof parsed.eventId === 'string' ? parsed.eventId : `evt_${seq}`,
      ts: typeof parsed.ts === 'string' ? parsed.ts : new Date().toISOString(),
      data: (parsed.data as Record<string, unknown>) ?? {},
    };
  } catch {
    return null;
  }
};

/**
 * Tail one durable run into the store until it reaches a terminal status.
 *
 * Nothing here renders. It is a pure producer — the store is the consumer, and the chat
 * panels project from the store. That separation is what lets a run keep streaming while
 * its panel is unmounted.
 */
export function useAgentRunStream(
  runId: string | null,
  agent: RunEventAgentKind,
  enabled = true,
): void {
  const appendEvents = useAgentRunStore((state) => state.appendEvents);
  const forgetRun = useAgentRunStore((state) => state.forgetRun);

  useEffect(() => {
    if (!runId || !enabled) return;

    const source = RUN_EVENT_SOURCES[agent];
    let cancelled = false;

    const ingest = (events: AgentRunEventDto[]): void => {
      if (cancelled || events.length === 0) return;
      appendEvents(runId, events);
    };

    // Subscribe FIRST — `onSubscribed` runs only once the channel is live, so nothing
    // emitted while the backlog fetch is in flight is lost.
    const unsubscribe = subscribeToPostgresChanges({
      label: `agent-run:${agent}:${runId}`,
      bindings: [
        {
          event: 'INSERT',
          schema: source.schema,
          table: source.table,
          filter: `run_id=eq.${runId}`,
          onRow: (row) => {
            const event = rowToEvent(row);
            if (event) ingest([event]);
          },
        },
      ],
      onSubscribed: async () => {
        try {
          const token = await getBrowserAccessToken();
          if (!token || cancelled) return;

          // Always replay from before seq 0. The store dedupes by seq, so a full backlog fetch is
          // idempotent — and it is the only way a client that was never here (a fresh tab,
          // a reload, a navigation back) rebuilds the part of the turn it missed.
          const response = await fetch(source.eventsUrl(runId, -1), {
            headers: { Accept: 'application/x-ndjson', Authorization: `Bearer ${token}` },
          });
          if (shouldForgetUnavailableRun(response.status)) {
            forgetRun(runId);
            return;
          }
          if (!response.ok || !response.body || cancelled) return;

          const batch: AgentRunEventDto[] = [];
          await readNdjsonStream({
            reader: response.body.getReader(),
            onLine: (line) => {
              const event = parseNdjsonEvent(line);
              if (event) batch.push(event);
            },
          });
          ingest(batch);
        } catch {
          // Hydration is best-effort — Realtime still delivers everything from here on.
        }
      },
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [runId, agent, enabled, appendEvents, forgetRun]);
}

export { isTerminalAgentRunStatus };
