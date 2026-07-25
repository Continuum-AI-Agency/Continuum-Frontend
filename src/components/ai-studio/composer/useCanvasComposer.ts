'use client';

import type {
  AgentDelegatedFrameData,
  AgentMentionReference,
  AiStudioComposerFrame,
  CanvasComposerReference,
  ComposerHistoryMessage,
} from '@continuum/contracts';
import {
  CANVAS_COMPOSER_MAX_REFERENCES,
  COMPOSER_HISTORY_MAX_MESSAGES,
  canvasComposerReferenceTypeSchema,
  isTerminalAgentRunStatus,
} from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { selectRunForSession, useAgentRunStore } from '@/lib/agents/runStore';
import { streamCanvasComposer } from '@/lib/ai-studio/composer/streamCanvasComposer';
import { http } from '@/lib/api/http';
import { useStudioStore } from '@/StudioCanvas/stores/useStudioStore';
import type { StudioNode } from '@/StudioCanvas/types';

// The composer's transcript. Narration only — the nodes it builds arrive on the
// canvas through useCanvasRealtime, so this hook never touches the studio store.
//
// Memory semantics: every turn is one-shot on the server. The collapsed bar sends
// no history; the EXPANDED chat sends its visible transcript back with the next
// prompt (`remember: true`), which is the only memory that exists anywhere.
//
// Durability: each turn is a durable run ROW server-side. Aborting the fetch here
// is a DETACH — the model keeps executing and lands its terminal status on the
// row — while Stop posts the cancel route first, which actually aborts the model.

export type ComposerStatus = 'idle' | 'running' | 'done' | 'error';

export interface ComposerGraphSummary {
  nodeCount: number;
  edgeCount: number;
  addedNodeIds: string[];
}

export interface CanvasComposerState {
  status: ComposerStatus;
  /** Human-readable progress lines, in order. */
  steps: string[];
  warnings: string[];
  /** Cross-agent calls this turn made, latest state per callId. */
  delegations: AgentDelegatedFrameData[];
  /** What the agent said it built. Empty until the turn finishes. */
  summary: string;
  /** Set once at least one write has landed — this is what enables Run. */
  graph: ComposerGraphSummary | null;
  error: string | null;
}

export interface ComposerTurn {
  id: string;
  prompt: string;
  references?: AgentMentionReference[];
  state: CanvasComposerState;
}

export const IDLE_COMPOSER_STATE: CanvasComposerState = {
  status: 'idle',
  steps: [],
  warnings: [],
  delegations: [],
  summary: '',
  graph: null,
  error: null,
};

// The agent emits a composer.graph after EVERY write, so a build followed by an
// edit reports twice. The node ids accumulate; the counts are always the latest.
const foldGraph = (
  previous: ComposerGraphSummary | null,
  incoming: ComposerGraphSummary,
): ComposerGraphSummary => ({
  nodeCount: incoming.nodeCount,
  edgeCount: incoming.edgeCount,
  addedNodeIds: [...(previous?.addedNodeIds ?? []), ...incoming.addedNodeIds],
});

const foldDelegation = (
  previous: AgentDelegatedFrameData[],
  incoming: AgentDelegatedFrameData,
): AgentDelegatedFrameData[] => {
  const index = previous.findIndex((entry) => entry.callId === incoming.callId);
  if (index === -1) return [...previous, incoming];
  return previous.map((entry, position) => (position === index ? incoming : entry));
};

/** Pure frame reducer — the whole per-turn state machine, testable without a stream. */
export function applyComposerFrame(
  previous: CanvasComposerState,
  frame: AiStudioComposerFrame,
): CanvasComposerState {
  switch (frame.type) {
    case 'composer.status':
      return { ...previous, steps: [...previous.steps, frame.data.message] };
    case 'composer.warning':
      return { ...previous, warnings: [...previous.warnings, frame.data.message] };
    case 'composer.graph':
      return { ...previous, graph: foldGraph(previous.graph, frame.data) };
    // Folded by callId so a delegation that reports running and then completed
    // is ONE card whose status changes, not two.
    case 'agent.delegated':
      return { ...previous, delegations: foldDelegation(previous.delegations, frame.data) };
    case 'response.done': {
      const summary = typeof frame.data?.summary === 'string' ? frame.data.summary : '';
      return { ...previous, status: 'done', summary };
    }
    case 'response.error':
      return { ...previous, status: 'error', error: frame.data.message };
    default:
      return previous;
  }
}

const HISTORY_CONTENT_CAP = 2000;

const assistantLineFor = (state: CanvasComposerState): string => {
  if (state.summary) return state.summary;
  if (state.error) return `That attempt failed: ${state.error}`;
  return '';
};

/**
 * The transcript as the wire's `history` — pure so the memory payload is
 * testable. Turns still running (or that produced nothing) are skipped; the
 * schema caps clamp length server-side too, but clamping here keeps the request
 * honest instead of bounced.
 */
export function buildHistoryPayload(turns: ComposerTurn[]): ComposerHistoryMessage[] {
  const messages: ComposerHistoryMessage[] = [];
  for (const turn of turns) {
    if (turn.state.status !== 'done' && turn.state.status !== 'error') continue;
    const assistant = assistantLineFor(turn.state);
    if (!assistant) continue;
    messages.push({ role: 'user', content: turn.prompt.slice(0, HISTORY_CONTENT_CAP) });
    messages.push({ role: 'assistant', content: assistant.slice(0, HISTORY_CONTENT_CAP) });
  }
  return messages.slice(-COMPOSER_HISTORY_MAX_MESSAGES);
}

export function toCanvasComposerReferences(
  references: AgentMentionReference[],
): CanvasComposerReference[] {
  const seen = new Set<string>();
  const result: CanvasComposerReference[] = [];
  for (const reference of references) {
    const parsedType = canvasComposerReferenceTypeSchema.safeParse(reference.type);
    if (!parsedType.success) continue;
    const key = `${reference.type}:${reference.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ type: parsedType.data, id: reference.id, label: reference.label });
    if (result.length === CANVAS_COMPOSER_MAX_REFERENCES) break;
  }
  return result;
}

const newTurnId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `turn-${Math.random().toString(36).slice(2, 10)}`;

type ActiveComposerRun = { runId: string; roomId: string };

/** Ask the Backend to abort the model. Best-effort: the run row settles server-side either way. */
const postComposerCancel = async (runId: string): Promise<void> => {
  try {
    await http.request({
      path: `/api/ai-studio/canvas/compose/runs/${encodeURIComponent(runId)}/cancel`,
      method: 'POST',
    });
  } catch {
    // The local abort already detached this client; a lost cancel only means the
    // server finishes the turn on its own.
  }
};

/** Fold this turn's durable run into the app-level store so it survives navigation. */
const upsertComposerStoreRun = (
  active: ActiveComposerRun,
  status: 'running' | 'completed' | 'failed' | 'cancelled',
  errorMessage?: string,
): void => {
  const store = useAgentRunStore.getState();
  const existing = store.runs[active.runId]?.run;
  store.upsertRun({
    ...(existing ?? {
      runId: active.runId,
      agent: 'canvas' as const,
      sessionId: active.roomId,
      createdAt: new Date().toISOString(),
      title: 'Canvas Composer',
      origin: { surface: 'ai-studio' as const, roomId: active.roomId },
    }),
    status,
    errorMessage: errorMessage ?? null,
  });
};

export function useCanvasComposer(brandProfileId: string | undefined, roomId: string | undefined) {
  const [turns, setTurns] = useState<ComposerTurn[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const activeRunRef = useRef<ActiveComposerRun | null>(null);
  const turnsRef = useRef<ComposerTurn[]>([]);
  turnsRef.current = turns;

  // Unmount/navigation is a DETACH, not a cancel: the fetch dies, the server-side run
  // keeps executing, and AgentRunsProvider's tail follows the run row to its end.
  useEffect(() => () => abortRef.current?.abort(), []);

  const updateLastTurn = useCallback(
    (update: (state: CanvasComposerState) => CanvasComposerState) => {
      setTurns((previous) => {
        const last = previous.at(-1);
        if (!last) return previous;
        return [...previous.slice(0, -1), { ...last, state: update(last.state) }];
      });
    },
    [],
  );

  // The user-facing Stop: cancel the run server-side (aborts the model), flip the
  // store run to cancelled optimistically, then abort the local fetch. A re-mounted
  // surface never owned the fetch, so when there is no local active run Stop falls
  // back to the room's live run in the app-level store — the re-attached case.
  //
  // Settling the turn's status here is not cosmetic. Aborting a fetch that has
  // ALREADY ended is a no-op — no throw, no catch, so `submit`'s settle never
  // runs — and the turn stayed 'running' forever with a panel that would not
  // retire. Stop always ends the turn, whoever is left holding the stream.
  const cancel = useCallback(() => {
    const active = activeRunRef.current;
    if (active) {
      void postComposerCancel(active.runId);
      upsertComposerStoreRun(active, 'cancelled');
      activeRunRef.current = null;
    } else if (roomId) {
      const record = selectRunForSession(roomId)(useAgentRunStore.getState());
      if (record && !isTerminalAgentRunStatus(record.run.status)) {
        void postComposerCancel(record.run.runId);
        upsertComposerStoreRun({ runId: record.run.runId, roomId }, 'cancelled');
      }
    }
    abortRef.current?.abort();
    abortRef.current = null;
    updateLastTurn((state) =>
      state.status === 'running'
        ? { ...state, status: 'done', summary: state.summary || '(stopped)' }
        : state,
    );
  }, [roomId, updateLastTurn]);

  const clear = useCallback(() => {
    cancel();
    setTurns([]);
  }, [cancel]);

  // Retire the visible progress panel. The X is a DISMISS, so it always ends with
  // an idle turn and a gone panel — cancelling first when a turn is still running.
  // Returning early after `cancel()` (the old shape) left the panel on screen for
  // the user to close a second time, which read as a dead button.
  const dismiss = useCallback(() => {
    if (turnsRef.current.at(-1)?.state.status === 'running') cancel();
    updateLastTurn(() => ({ ...IDLE_COMPOSER_STATE }));
  }, [cancel, updateLastTurn]);

  const submit = useCallback(
    async (
      prompt: string,
      selectedNodeIds?: string[],
      options?: {
        remember?: boolean;
        references?: AgentMentionReference[];
        thinking?: boolean;
      },
    ) => {
      if (!brandProfileId || !roomId || !prompt.trim()) return;

      // A new prompt replaces the in-flight turn. Now that a plain fetch abort only
      // DETACHES, replacing means cancelling the old run server-side too — otherwise
      // both runs would keep editing the same canvas.
      cancel();
      const controller = new AbortController();
      abortRef.current = controller;

      // History is captured BEFORE this turn joins the transcript, and only when
      // the expanded chat asked to remember.
      const history = options?.remember ? buildHistoryPayload(turnsRef.current) : [];
      const references = toCanvasComposerReferences(options?.references ?? []);
      setTurns((previous) => [
        ...previous,
        {
          id: newTurnId(),
          prompt: prompt.trim(),
          ...(options?.references?.length ? { references: options.references } : {}),
          state: { ...IDLE_COMPOSER_STATE, status: 'running' },
        },
      ]);

      try {
        await streamCanvasComposer({
          request: {
            brandProfileId,
            roomId,
            prompt: prompt.trim(),
            ...(options?.thinking ? { thinking: true } : {}),
            ...(selectedNodeIds?.length ? { selectedNodeIds } : {}),
            ...(references.length ? { references } : {}),
            ...(history.length ? { history } : {}),
          },
          onFrame: (frame) => {
            // composer.started names the durable run this stream is a view of; that is
            // the moment the run becomes registerable (and cancellable) app-wide.
            if (frame.type === 'composer.started' && frame.data.runId) {
              const active = { runId: frame.data.runId, roomId: frame.data.roomId };
              activeRunRef.current = active;
              upsertComposerStoreRun(active, 'running');
            }
            if (frame.type === 'response.done' || frame.type === 'response.error') {
              const active = activeRunRef.current;
              if (active) {
                upsertComposerStoreRun(
                  active,
                  frame.type === 'response.done' ? 'completed' : 'failed',
                  frame.type === 'response.error' ? frame.data.message : undefined,
                );
                activeRunRef.current = null;
              }
            }
            if (frame.type === 'composer.patch') {
              const store = useStudioStore.getState();
              store.setNodes(frame.data.nodes as StudioNode[]);
              store.setEdges(frame.data.edges);
            }
            updateLastTurn((state) => applyComposerFrame(state, frame));
          },
          signal: controller.signal,
        });
        // A stream that ends without response.done or response.error was cut off —
        // the user aborted, or the connection dropped mid-turn. Either way the run
        // is over, and leaving it spinning forever is a lie.
        updateLastTurn((state) =>
          state.status === 'running' ? { ...state, status: 'done' } : state,
        );
      } catch (err) {
        if (controller.signal.aborted) {
          updateLastTurn((state) =>
            state.status === 'running' ? { ...state, status: 'done', summary: '(stopped)' } : state,
          );
          return;
        }
        updateLastTurn((state) => ({
          ...state,
          status: 'error',
          error: err instanceof Error ? err.message : 'The composer failed.',
        }));
      }
    },
    [brandProfileId, roomId, updateLastTurn, cancel],
  );

  const state = turns.at(-1)?.state ?? IDLE_COMPOSER_STATE;

  return { state, turns, submit, cancel, clear, dismiss };
}
