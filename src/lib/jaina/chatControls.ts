'use client';

// Cancelling a run and clearing a conversation's memory.
//
// Neither is transport. They lived inside the deleted NDJSON reader hook only because it happened
// to hold the run id, and holding them there is what made that reader look load-bearing for things
// that are plain HTTP calls against the durable row.
//
// The distinction that matters, and that a caller must not blur: STOPPING a stream and CANCELLING
// a run are different acts. `chat.stop()` detaches this reader — the run keeps going, which is the
// behaviour leaving the page must have, or a turn dies mid-sentence because someone navigated.
// `cancelJainaRun` ends the run itself and records it as cancelled.

import { isTerminalAgentRunStatus } from '@continuum/contracts';
import { selectRunForSession, useAgentRunStore } from '@/lib/agents/runStore';
import { getBrowserAccessToken } from '@/lib/auth/getBrowserAccessToken';

/**
 * End a run and make it durable.
 *
 * The store is marked terminal first, optimistically: until the Backend answers, the app-level
 * run store still reports the run as live, and `AgentRunsProvider` would fire a completion toast
 * for a turn the reader just stopped.
 */
export async function cancelJainaRun(runId: string | undefined): Promise<void> {
  if (!runId) return;

  const record = useAgentRunStore.getState().runs[runId];
  if (record) {
    useAgentRunStore.getState().upsertRun({ ...record.run, status: 'cancelled' });
  }

  try {
    const token = await getBrowserAccessToken();
    if (!token) return;
    await fetch(`/api/agents/jaina/chat/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Best-effort: the row may already be terminal (a 409), which is the same end state.
  }
}

/**
 * What Stop does: end every run that keeps this session reading as in flight.
 *
 * The surface's streaming state is the session's binding in the run store, not the reader it
 * owns. Cancelling only the owned run left a different run bound to the session — one the
 * reader returned to, or one the store rebound to — reading live, so the Stop control and the
 * in-flight state outlived the stream (PP-L1-jaina-stop-leaves-surface-loading). A bound run
 * that already ended is left as it ended.
 */
export async function stopJainaSession(params: {
  sessionId: string;
  ownedRunId: string | undefined;
}): Promise<void> {
  const bound = selectRunForSession(params.sessionId)(useAgentRunStore.getState());
  const boundLiveRunId =
    bound && !isTerminalAgentRunStatus(bound.run.status) ? bound.run.runId : undefined;
  const runIds = new Set(
    [params.ownedRunId, boundLiveRunId].filter((id): id is string => Boolean(id)),
  );
  await Promise.all([...runIds].map((runId) => cancelJainaRun(runId)));
}

export async function clearJainaMemory(adAccountId: string): Promise<void> {
  const token = await getBrowserAccessToken();
  if (!token) throw new Error('No authentication token available');

  const response = await fetch(
    `/api/agents/jaina/chat/memory?ad_account_id=${encodeURIComponent(adAccountId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => 'Failed to clear memory.');
    throw new Error(detail || 'Failed to clear memory.');
  }
}
