'use client';

// Projects a Jaina run this surface is NOT streaming — the turn that was already in flight
// when the user came back to the conversation. Clone of the organic panel's
// `useProjectedRun` state machine, adapted to Jaina's fold: instead of dispatching frames
// into a panel reducer, it folds the app-level store's frame log through
// `toParsedJainaStreamEvent` + `reduceJainaStreamEvent` — the SAME fold the live NDJSON
// reader uses — into a `JainaStreamState` the surface can render.
//
// The gap this closes: an assistant message is only persisted when its run FINISHES. So mid
// run the database holds the user turn and nothing else, and a surface that remounts and
// hydrates from history shows a question with a spinner — even though the run is alive and
// every frame is landing in the app-level store.
//
// EXACTLY ONE FOLDER PER RUN. The live NDJSON reader owns the run it started (`liveRunId`)
// and reduces it directly; this projection skips that runId. Runs that are terminal at
// first sight are DECLINED: their assistant message is already in the persisted history the
// surface just hydrated, and folding them would render the turn twice. A run that turns
// terminal mid-projection is also declined — the surface hands rendering back to the
// persisted snapshot (its existing reconciliation), keeping one owner for finished turns.

import { isTerminalAgentRunStatus } from '@continuum/contracts';
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  type AgentRunRecord,
  selectProjectableRunForSession,
  useAgentRunStore,
} from '@/lib/agents/runStore';
import {
  createInitialJainaStreamState,
  type JainaStreamState,
  reduceJainaStreamEvent,
  toParsedJainaStreamEvent,
} from '@/lib/jaina/stream';

export type JainaRunProjection = {
  /** The run being projected, or null when detached/declined. */
  attachedRunId: string | null;
  /** Highest seq already folded, so a growing log only ever appends. */
  projectedSeq: number;
  /** Runs that were terminal when first seen (or turned terminal): persisted history owns them. */
  declinedRunIds: ReadonlySet<string>;
  /** The folded stream state for the attached run. */
  state: JainaStreamState | null;
};

export function createJainaRunProjection(): JainaRunProjection {
  return { attachedRunId: null, projectedSeq: -1, declinedRunIds: new Set(), state: null };
}

/**
 * Pure step of the projection state machine. Returns the SAME reference when nothing
 * changed, so the hook (and tests) can detect no-op advances — this is what makes a
 * re-render with an unchanged log fold nothing twice.
 */
export function advanceJainaRunProjection(
  projection: JainaRunProjection,
  record: AgentRunRecord | undefined,
  liveRunId: string | null,
): JainaRunProjection {
  if (!record) return projection;
  const { run, events } = record;

  if (run.runId === liveRunId) {
    return projection.attachedRunId === null
      ? projection
      : { ...projection, attachedRunId: null, projectedSeq: -1, state: null };
  }
  if (projection.declinedRunIds.has(run.runId)) return projection;

  if (isTerminalAgentRunStatus(run.status)) {
    const declinedRunIds = new Set(projection.declinedRunIds);
    declinedRunIds.add(run.runId);
    return { attachedRunId: null, projectedSeq: -1, declinedRunIds, state: null };
  }

  let next = projection;
  if (projection.attachedRunId !== run.runId) {
    next = {
      attachedRunId: run.runId,
      projectedSeq: -1,
      declinedRunIds: projection.declinedRunIds,
      state: createInitialJainaStreamState(),
    };
  }

  let state = next.state ?? createInitialJainaStreamState();
  let projectedSeq = next.projectedSeq;
  for (const event of events) {
    if (event.seq <= projectedSeq) continue;
    projectedSeq = event.seq;
    const parsed = toParsedJainaStreamEvent(event);
    if (!parsed) continue;
    state = reduceJainaStreamEvent(state, parsed);
  }

  if (next === projection && projectedSeq === projection.projectedSeq) return projection;
  return { ...next, projectedSeq, state };
}

type UseProjectedJainaRunParams = {
  sessionId: string | null;
  /** The run this surface's own live reader is streaming, if any. Never projected. */
  liveRunId: string | null;
};

export type ProjectedJainaRun = {
  projectedState: JainaStreamState | null;
  projectedRunId: string | null;
  /**
   * The session the projection was attached under. Published alongside the runId so the
   * surface can tell a genuine projection for the session on screen from the one-render
   * echo that follows a session switch.
   */
  projectedSessionId: string | null;
  isProjecting: boolean;
};

export function useProjectedJainaRun({
  sessionId,
  liveRunId,
}: UseProjectedJainaRunParams): ProjectedJainaRun {
  // Selecting past the live run (rather than filtering after) keeps the surface from re-rendering
  // on every frame the RunTail persists for a run this reader is already streaming off the wire.
  const record = useAgentRunStore(
    useShallow(selectProjectableRunForSession(sessionId ?? '', liveRunId)),
  );

  const projectionRef = useRef<JainaRunProjection>(createJainaRunProjection());
  const [published, setPublished] = useState<{
    state: JainaStreamState | null;
    runId: string | null;
    sessionId: string | null;
  }>({ state: null, runId: null, sessionId: null });

  // Switching sessions must not carry a half-folded run into the next transcript. Declared
  // BEFORE the advance effect so React runs it first on a session change.
  useEffect(() => {
    projectionRef.current = createJainaRunProjection();
    setPublished({ state: null, runId: null, sessionId: null });
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const next = advanceJainaRunProjection(projectionRef.current, record, liveRunId);
    if (next === projectionRef.current) return;
    projectionRef.current = next;
    setPublished({
      state: next.state,
      runId: next.attachedRunId,
      sessionId: next.attachedRunId ? sessionId : null,
    });
  }, [sessionId, record, liveRunId]);

  return {
    projectedState: published.state,
    projectedRunId: published.runId,
    projectedSessionId: published.sessionId,
    isProjecting: published.runId !== null,
  };
}
