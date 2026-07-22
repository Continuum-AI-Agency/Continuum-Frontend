// Subscribes to durable Jaina run-status changes (jaina.jaina_conversation_runs)
// so the UI can recover a run's outcome when the live NDJSON stream is lost, and
// drive a per-session "generating" indicator — independent of the stream. RLS
// scopes rows to the signed-in user, so no server-side filter is needed; the
// consumer matches the run/session it cares about. The heavy result payload is
// NOT broadcast (excluded from the Realtime publication) — fetch it via REST.

import { useEffect, useMemo, useRef } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export type JainaRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export type JainaRunStatusRow = {
  runId: string;
  sessionId: string;
  status: JainaRunStatus;
  resultType: string | null;
  errorMessage: string | null;
};

const TERMINAL_RUN_STATUSES: ReadonlySet<JainaRunStatus> = new Set(['completed', 'failed']);

export function isTerminalRunStatus(status: JainaRunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

type UseJainaRunStatusRealtimeParams = {
  enabled?: boolean;
  onRunStatus: (row: JainaRunStatusRow) => void;
};

export function useJainaRunStatusRealtime({
  enabled = true,
  onRunStatus,
}: UseJainaRunStatusRealtimeParams): void {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const callbackRef = useRef(onRunStatus);
  callbackRef.current = onRunStatus;

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase.channel('jaina:run-status', {
      config: { broadcast: { self: false } },
    });

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'jaina', table: 'jaina_conversation_runs' },
        (payload) => {
          const row = (payload.new ?? null) as Record<string, unknown> | null;
          if (!row) return;
          const runId = typeof row.run_id === 'string' ? row.run_id : null;
          const status = typeof row.status === 'string' ? (row.status as JainaRunStatus) : null;
          if (!runId || !status) return;
          callbackRef.current({
            runId,
            sessionId: typeof row.session_id === 'string' ? row.session_id : '',
            status,
            resultType: typeof row.result_type === 'string' ? row.result_type : null,
            errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, supabase]);
}
