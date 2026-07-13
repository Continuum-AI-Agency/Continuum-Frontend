'use client';

import type { AiStudioComposerFrame, ComposerHistoryMessage } from '@continuum/contracts';
import { COMPOSER_HISTORY_MAX_MESSAGES } from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { streamCanvasComposer } from '@/lib/ai-studio/composer/streamCanvasComposer';

// The composer's transcript. Narration only — the nodes it builds arrive on the
// canvas through useCanvasRealtime, so this hook never touches the studio store.
//
// Memory semantics: every turn is one-shot on the server. The collapsed bar sends
// no history; the EXPANDED chat sends its visible transcript back with the next
// prompt (`remember: true`), which is the only memory that exists anywhere.

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
  /** What the agent said it built. Empty until the turn finishes. */
  summary: string;
  /** Set once at least one write has landed — this is what enables Run. */
  graph: ComposerGraphSummary | null;
  error: string | null;
}

export interface ComposerTurn {
  id: string;
  prompt: string;
  state: CanvasComposerState;
}

export const IDLE_COMPOSER_STATE: CanvasComposerState = {
  status: 'idle',
  steps: [],
  warnings: [],
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

const newTurnId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `turn-${Math.random().toString(36).slice(2, 10)}`;

export function useCanvasComposer(brandProfileId: string | undefined, roomId: string | undefined) {
  const [turns, setTurns] = useState<ComposerTurn[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const turnsRef = useRef<ComposerTurn[]>([]);
  turnsRef.current = turns;

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

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const clear = useCallback(() => {
    cancel();
    setTurns([]);
  }, [cancel]);

  const submit = useCallback(
    async (prompt: string, selectedNodeIds?: string[], options?: { remember?: boolean }) => {
      if (!brandProfileId || !roomId || !prompt.trim()) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // History is captured BEFORE this turn joins the transcript, and only when
      // the expanded chat asked to remember.
      const history = options?.remember ? buildHistoryPayload(turnsRef.current) : [];
      setTurns((previous) => [
        ...previous,
        {
          id: newTurnId(),
          prompt: prompt.trim(),
          state: { ...IDLE_COMPOSER_STATE, status: 'running' },
        },
      ]);

      try {
        await streamCanvasComposer({
          request: {
            brandProfileId,
            roomId,
            prompt: prompt.trim(),
            ...(selectedNodeIds?.length ? { selectedNodeIds } : {}),
            ...(history.length ? { history } : {}),
          },
          onFrame: (frame) => updateLastTurn((state) => applyComposerFrame(state, frame)),
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
    [brandProfileId, roomId, updateLastTurn],
  );

  const state = turns.at(-1)?.state ?? IDLE_COMPOSER_STATE;

  return { state, turns, submit, cancel, clear };
}
