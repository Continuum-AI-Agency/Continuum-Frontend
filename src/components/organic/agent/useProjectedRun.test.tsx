import { beforeEach, describe, expect, it } from 'bun:test';
import type { AgentRunDto, AgentRunEventDto } from '@continuum/contracts';
import { act, renderHook } from '@testing-library/react';
import { useAgentRunStore } from '@/lib/agents/runStore';
import type { PanelAction } from './useOrganicAgentReducer';
import { useProjectedRun } from './useProjectedRun';

const SESSION = 'sess_1';

const run = (over: Partial<AgentRunDto> = {}): AgentRunDto => ({
  runId: 'run_1',
  agent: 'organic',
  sessionId: SESSION,
  brandId: 'brand_1',
  status: 'running',
  createdAt: '2026-07-12T00:00:00.000Z',
  ...over,
});

const delta = (seq: number, text: string): AgentRunEventDto => ({
  eventId: `evt_${seq}`,
  seq,
  ts: '2026-07-12T00:00:00.000Z',
  type: 'response.output_text.delta',
  data: { delta: text },
});

const done = (seq: number): AgentRunEventDto => ({
  eventId: `evt_${seq}`,
  seq,
  ts: '2026-07-12T00:00:00.000Z',
  type: 'response.done',
  data: {},
});

function project(liveRunId: string | null = null, isHydrated = true) {
  const actions: PanelAction[] = [];
  const view = renderHook(() =>
    useProjectedRun({
      sessionId: SESSION,
      dispatch: (action) => actions.push(action),
      isHydrated,
      liveRunId,
    }),
  );
  return { actions, view };
}

const deltasOf = (actions: PanelAction[]): string[] =>
  actions.filter((a) => a.type === 'STREAM_DELTA').map((a) => (a as { delta: string }).delta);

beforeEach(() => {
  useAgentRunStore.getState().reset();
});

describe('useProjectedRun', () => {
  // The gap this closes: the assistant message is only persisted when the run ENDS, so a
  // panel that remounts mid-run hydrates a question with no answer. The store's frame log is
  // the mid-run transcript.
  it('renders a run that was already in flight when the panel arrived', () => {
    const store = useAgentRunStore.getState();
    store.upsertRun(run());
    store.appendEvents('run_1', [delta(1, 'Hello '), delta(2, 'world')]);

    const { actions } = project();

    expect(actions[0]).toEqual({ type: 'RESUME_STREAMING', messageId: 'run_1' });
    expect(deltasOf(actions)).toEqual(['Hello ', 'world']);
  });

  // EXACTLY ONE FOLDER PER RUN. The live reader dispatches the run it started; if the
  // projection folded it too, every delta would land twice.
  it('never folds the run the panel is streaming itself', () => {
    const store = useAgentRunStore.getState();
    store.upsertRun(run());
    store.appendEvents('run_1', [delta(1, 'Hello ')]);

    const { actions } = project('run_1');

    expect(actions).toEqual([]);
  });

  it('only folds frames it has not folded before, as the log grows', () => {
    const store = useAgentRunStore.getState();
    store.upsertRun(run());
    store.appendEvents('run_1', [delta(1, 'a')]);

    const { actions } = project();
    expect(deltasOf(actions)).toEqual(['a']);

    act(() => {
      useAgentRunStore.getState().appendEvents('run_1', [delta(2, 'b')]);
    });

    expect(deltasOf(actions)).toEqual(['a', 'b']);
  });

  // Its assistant message is already in the history we just hydrated; folding it would render
  // the same turn a second time.
  it('declines a run that was ALREADY finished when the panel arrived', () => {
    const store = useAgentRunStore.getState();
    store.upsertRun(run());
    store.appendEvents('run_1', [delta(1, 'a'), done(2)]);

    const { actions } = project();

    expect(actions).toEqual([]);
  });

  // Attached BEFORE it finished, so we must see it through — the terminal frame is what stops
  // the message rendering as streaming.
  it('folds the terminal frame of a run it attached to while live', () => {
    const store = useAgentRunStore.getState();
    store.upsertRun(run());
    store.appendEvents('run_1', [delta(1, 'a')]);

    const { actions } = project();

    act(() => {
      useAgentRunStore.getState().appendEvents('run_1', [done(2)]);
    });

    expect(actions.some((a) => a.type === 'STREAM_COMPLETE')).toBe(true);
  });

  // Otherwise the projection appends its assistant turn above the user's message.
  it('waits for history before projecting anything', () => {
    const store = useAgentRunStore.getState();
    store.upsertRun(run());
    store.appendEvents('run_1', [delta(1, 'a')]);

    const { actions } = project(null, false);

    expect(actions).toEqual([]);
  });
});
