'use client';

// Tail for a Canvas Composer run. The row supplies terminal status, while the shared
// event tail restores narration missed during navigation or a dropped connection.

import { type AgentRunDto, normalizeAgentRunStatus } from '@continuum/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useRef } from 'react';
import { useAgentRunStream } from '@/hooks/useAgentRunStream';
import { useAgentRunStore } from '@/lib/agents/runStore';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const CANVAS_RUNS_SCHEMA = 'brand_profiles';
const CANVAS_RUNS_TABLE = 'ai_studio_canvas_composer_runs';

const runFromRow = (row: Record<string, unknown>, current: AgentRunDto): AgentRunDto => ({
  ...current,
  status: normalizeAgentRunStatus(row.status),
  errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
  finishedAt: typeof row.finished_at === 'string' ? row.finished_at : (current.finishedAt ?? null),
});

const runChanged = (next: AgentRunDto, current: AgentRunDto): boolean =>
  next.status !== current.status ||
  next.errorMessage !== current.errorMessage ||
  next.finishedAt !== current.finishedAt;

export function CanvasComposerRunTail({ run }: { run: AgentRunDto }) {
  useAgentRunStream(run.runId, 'canvas');
  const upsertRun = useAgentRunStore((state) => state.upsertRun);
  // The latest run rides a ref so the subscription is keyed on runId alone — depending
  // on the run object would resubscribe (and re-fetch) on every store fold of itself.
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`agent-run:canvas:${run.runId}`);
    let cancelled = false;

    const fold = (row: Record<string, unknown>): void => {
      if (cancelled) return;
      const next = runFromRow(row, runRef.current);
      if (runChanged(next, runRef.current)) upsertRun(next);
    };

    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: CANVAS_RUNS_SCHEMA,
          table: CANVAS_RUNS_TABLE,
          filter: `run_id=eq.${run.runId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (row) fold(row);
        },
      )
      .subscribe(async (status) => {
        if (cancelled || status !== 'SUBSCRIBED') return;
        // Close the mount race: the run may have gone terminal between the active-runs
        // hydrate and this subscription going live, and a missed UPDATE never replays.
        // Untyped view on purpose: the generated Database types do not carry this table
        // until the migration is applied and types are regenerated; the row is narrowed
        // field-by-field in runFromRow regardless.
        try {
          const { data } = await (supabase as unknown as SupabaseClient)
            .schema(CANVAS_RUNS_SCHEMA)
            .from(CANVAS_RUNS_TABLE)
            .select('status,error_message,finished_at')
            .eq('run_id', run.runId)
            .maybeSingle();
          if (data) fold(data as Record<string, unknown>);
        } catch {
          // Best-effort — Realtime still delivers every change from here on.
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [run.runId, upsertRun]);

  return null;
}
