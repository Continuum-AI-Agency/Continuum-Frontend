'use client';

// Renders a run the panel is NOT streaming — the turn that was already in flight when you
// came back to it.
//
// The gap this closes: an assistant message is only persisted when its run FINISHES. So mid
// run the database holds your user turn and nothing else, and a panel that remounts and
// hydrates from history shows a question with no answer and no sign anything is happening —
// even though the run is alive and every frame is landing in the app-level store.
//
// So the store's frame log IS the mid-run transcript. This folds it into the reducer through
// `applyOrganicFrame` — the SAME fold the live stream uses, which is the whole reason that
// switch was extracted. A turn watched live and the same turn re-attached to after a
// navigation therefore render identically, by construction rather than by discipline.
//
// EXACTLY ONE FOLDER PER RUN. The live NDJSON reader owns the run it started and dispatches
// it directly; this projection skips that runId. When the panel unmounts the reader dies,
// and on remount the run is no longer owned — so the projection picks it up. The two can
// never both be folding the same run, which is what would otherwise duplicate every delta.

import { isTerminalAgentRunStatus } from '@continuum/contracts';
import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { selectRunForSession, useAgentRunStore } from '@/lib/agents/runStore';
import { applyOrganicFrame } from './applyOrganicFrame';
import type { PanelAction } from './useOrganicAgentReducer';

type ProjectedRunParams = {
  brandId: string;
  sessionId: string | null;
  dispatch: React.Dispatch<PanelAction>;
  /** History must land first, or the projection appends its assistant turn above the user's. */
  isHydrated: boolean;
  /** The run this panel's own live reader is streaming, if any. Never projected. */
  liveRunId: string | null;
};

export function useProjectedRun({
  brandId,
  sessionId,
  dispatch,
  isHydrated,
  liveRunId,
}: ProjectedRunParams): void {
  const record = useAgentRunStore(useShallow(selectRunForSession(sessionId ?? '')));

  // Highest seq already folded into the reducer, so a growing log only ever appends.
  const projectedSeq = useRef(-1);
  // The run we attached to. Also the guard that stops us re-attaching to a run we declined.
  const attachedRunId = useRef<string | null>(null);
  // Runs we deliberately will NOT project: they were already finished the first time we saw
  // them, which means their assistant message is in the persisted history we just hydrated.
  // Folding them would render the turn a second time.
  const declined = useRef<Set<string>>(new Set());

  // Switching sessions must not carry a half-folded run into the next transcript. Declared
  // BEFORE the projection so React runs it first on a session change.
  useEffect(() => {
    attachedRunId.current = null;
    projectedSeq.current = -1;
    declined.current.clear();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !isHydrated || !record) return;

    const { run, events } = record;
    if (run.brandId !== brandId) return;
    if (run.runId === liveRunId) return;
    if (declined.current.has(run.runId)) return;

    if (attachedRunId.current !== run.runId) {
      if (isTerminalAgentRunStatus(run.status)) {
        declined.current.add(run.runId);
        return;
      }
      attachedRunId.current = run.runId;
      projectedSeq.current = -1;
      dispatch({ type: 'RESUME_STREAMING', messageId: run.runId });
    }

    for (const event of events) {
      if (event.seq <= projectedSeq.current) continue;
      projectedSeq.current = event.seq;
      applyOrganicFrame({ type: event.type, data: event.data }, dispatch, 'chat');
    }
  }, [brandId, sessionId, isHydrated, record, liveRunId, dispatch]);
}
