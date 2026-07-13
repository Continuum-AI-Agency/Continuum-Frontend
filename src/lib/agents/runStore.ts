'use client';

// The app-level agent-run store: the single owner of every in-flight agent run's frame
// log, for BOTH agents.
//
// WHY IT EXISTS: run ownership used to live inside the chat panel. `useOrganicAgentStream`
// aborted its reader in an unmount cleanup, and the panel is mounted inside the /organic
// route — so navigating anywhere killed the client side of the run. (The Backend killed
// the server side too; that is fixed separately.) There was nowhere for a run to live
// that outlasted the component looking at it.
//
// So the store sits ABOVE the router, in the authenticated layout. A run registered here
// keeps being tailed while you go read a dashboard, start a second agent interaction, or
// close the panel entirely. The panels become projections over this log rather than its
// owner — which is also what lets two sessions stream at once without fighting.
//
// TWO PRODUCERS, ONE LOG. The live NDJSON stream (fast) and the durable Realtime tail +
// after_seq replay (survives anything) both write here. They overlap by design — a
// re-attach re-reads the boundary frame — so every append dedupes by seq via the shared
// `mergeAgentRunEvents`. That is not an optimization; it is what makes running both at
// once correct.

import {
  type AgentKind,
  type AgentRunDto,
  type AgentRunEventDto,
  type AgentRunStatus,
  isTerminalAgentRunStatus,
  mergeAgentRunEvents,
  runStatusFromFrameType,
} from '@continuum/contracts';
import { create } from 'zustand';

/**
 * The status implied by the LAST terminal frame in the log, or null while the run is still
 * going.
 *
 * Last, not first: Organic emits a non-fatal `response.error` when a background-job drain
 * times out and then still finishes the turn, so an earlier `failed` has to be allowed to
 * lose to a later `completed`.
 */
const terminalStatusOf = (events: readonly AgentRunEventDto[]): AgentRunStatus | null => {
  for (let i = events.length - 1; i >= 0; i--) {
    const status = runStatusFromFrameType(events[i]?.type ?? '');
    if (status) return status;
  }
  return null;
};

export type AgentRunRecord = {
  run: AgentRunDto;
  /** Seq-ordered, duplicate-free. The complete replayable history of the run. */
  events: AgentRunEventDto[];
  /** Highest seq seen. The resume cursor — what we pass as `after_seq`. */
  lastSeq: number;
};

type AgentRunStoreState = {
  runs: Record<string, AgentRunRecord>;
  /** sessionId -> the run currently in flight for it. One run per session is fenced Backend-side. */
  activeRunIdBySession: Record<string, string>;
  /**
   * The session the user is actually looking at, or null. Only used to suppress the
   * completion toast for a run they are already watching finish — a toast is for work that
   * completed somewhere you weren't.
   */
  viewingSessionId: string | null;

  upsertRun: (run: AgentRunDto) => void;
  appendEvents: (runId: string, events: AgentRunEventDto[]) => void;
  setViewingSession: (sessionId: string | null) => void;
  /** Drop a run's frame log once nothing is projecting it. The run row is durable; this is just memory. */
  forgetRun: (runId: string) => void;
  reset: () => void;
};

const emptyState = {
  runs: {} as Record<string, AgentRunRecord>,
  activeRunIdBySession: {} as Record<string, string>,
  viewingSessionId: null as string | null,
};

export const useAgentRunStore = create<AgentRunStoreState>()((set) => ({
  ...emptyState,

  upsertRun: (run) =>
    set((state) => {
      const existing = state.runs[run.runId];

      // A session points at its LATEST run, terminal or not. A finished run is not unbound:
      // a panel projecting it still needs to find it to fold the terminal frame, and the
      // next turn simply rebinds the session to its own new runId. Consumers that care ask
      // the status (isSessionStreaming, selectLiveRuns).
      return {
        runs: {
          ...state.runs,
          [run.runId]: {
            run,
            events: existing?.events ?? [],
            lastSeq: existing?.lastSeq ?? -1,
          },
        },
        activeRunIdBySession: { ...state.activeRunIdBySession, [run.sessionId]: run.runId },
      };
    }),

  appendEvents: (runId, incoming) =>
    set((state) => {
      const existing = state.runs[runId];
      // A frame can arrive before the run row does (the seq-0 agent.chat_started frame IS
      // how we learn the run exists). Dropping it would lose the start of the turn.
      const events = mergeAgentRunEvents(existing?.events ?? [], incoming);
      if (existing && events === existing.events) return state;

      const lastSeq = events.length > 0 ? (events[events.length - 1]?.seq ?? -1) : -1;
      const run = existing?.run ?? pendingRun(runId);

      // The LOG is the only thing a detached client is subscribed to, so the run's ENDING
      // has to be readable from it. Without this, a run you navigated away from never
      // finishes as far as the app is concerned: its Realtime channel stays open forever
      // and the completion toast never fires.
      //
      // The session binding is deliberately NOT cleared here. A panel projecting this run
      // still has to fold the terminal frame (it is what stops the message rendering as
      // streaming), and it can only do that while it can still find the run.
      const status = terminalStatusOf(events) ?? run.status;

      return {
        runs: {
          ...state.runs,
          [runId]: { run: status === run.status ? run : { ...run, status }, events, lastSeq },
        },
      };
    }),

  setViewingSession: (sessionId) => set({ viewingSessionId: sessionId }),

  forgetRun: (runId) =>
    set((state) => {
      if (!state.runs[runId]) return state;
      const runs = { ...state.runs };
      delete runs[runId];
      return { runs };
    }),

  reset: () => set(emptyState),
}));

/**
 * Placeholder for a run whose frames arrived before its row did. It is replaced the
 * moment `upsertRun` hears about the real run — from the seq-0 frame, the active-runs
 * hydrate, or the Realtime status channel.
 */
const pendingRun = (runId: string): AgentRunDto => ({
  runId,
  agent: 'organic',
  sessionId: '',
  status: 'running',
  createdAt: new Date().toISOString(),
});

// --- Selectors -------------------------------------------------------------------

export const selectRunForSession = (sessionId: string) => (state: AgentRunStoreState) => {
  const runId = state.activeRunIdBySession[sessionId];
  return runId ? state.runs[runId] : undefined;
};

export const selectEventsForSession = (sessionId: string) => (state: AgentRunStoreState) =>
  selectRunForSession(sessionId)(state)?.events;

/** Runs still in flight, across every session and both agents — what the tailer subscribes to. */
export const selectLiveRuns = (state: AgentRunStoreState): AgentRunDto[] =>
  Object.values(state.runs)
    .map((record) => record.run)
    .filter((run) => !isTerminalAgentRunStatus(run.status) && run.sessionId !== '');

export const isSessionStreaming = (sessionId: string) => (state: AgentRunStoreState) => {
  const record = selectRunForSession(sessionId)(state);
  return record ? !isTerminalAgentRunStatus(record.run.status) : false;
};

export type { AgentKind };
