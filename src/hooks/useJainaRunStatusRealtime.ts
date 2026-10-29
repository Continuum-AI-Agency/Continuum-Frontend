// Subscribes to durable Jaina run-status changes (jaina.jaina_conversation_runs)
// so the UI can recover a run's outcome when the live NDJSON stream is lost, and
// drive a per-session "generating" indicator — independent of the stream. The
// trigger sends each change to the run owner's own topic, carrying only run_id,
// session_id, status, result_type and error_message, and only when one of them
// changed; the consumer matches the run/session it cares about. The heavy result
// payload is never broadcast — fetch it via REST.

import { useEffect, useRef } from 'react';
import { useSession } from '@/hooks/useSession';
import { subscribeToRowBroadcasts } from '@/lib/supabase/realtime';

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
  const callbackRef = useRef(onRunStatus);
  callbackRef.current = onRunStatus;
  const userId = useSession().user?.id ?? null;

  useEffect(() => {
    if (!enabled || !userId) return;

    const onRow = (row: Record<string, unknown>): void => {
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
    };

    // INSERT and UPDATE only, not `*`: a DELETE would hand over the deleted row and report a
    // finished run as a live status change. The trigger sends no DELETE anyway.
    return subscribeToRowBroadcasts({
      topic: `jaina_conversation_runs:${userId}`,
      bindings: [
        { event: 'INSERT', onRow },
        { event: 'UPDATE', onRow },
      ],
    });
  }, [enabled, userId]);
}
