import { beforeEach, describe, expect, it } from 'bun:test';
import type { AgentRunDto, AgentRunEventDto } from '@continuum/contracts';
import {
  isSessionStreaming,
  selectEventsForSession,
  selectLiveRuns,
  selectRunForSession,
  useAgentRunStore,
} from './runStore';

const run = (over: Partial<AgentRunDto> = {}): AgentRunDto => ({
  runId: 'run_1',
  agent: 'organic',
  sessionId: 'sess_1',
  brandId: 'brand_1',
  status: 'running',
  createdAt: '2026-07-12T00:00:00.000Z',
  ...over,
});

const event = (seq: number, type = 'response.output_text.delta'): AgentRunEventDto => ({
  eventId: `evt_${seq}`,
  seq,
  ts: '2026-07-12T00:00:00.000Z',
  type,
  data: {},
});

beforeEach(() => {
  useAgentRunStore.getState().reset();
});

describe('upsertRun', () => {
  it('binds a live run to its session so a panel can find what it is streaming', () => {
    useAgentRunStore.getState().upsertRun(run());
    expect(selectRunForSession('sess_1')(useAgentRunStore.getState())?.run.runId).toBe('run_1');
    expect(isSessionStreaming('sess_1')(useAgentRunStore.getState())).toBe(true);
  });

  // A session stays bound to its latest run even once that run is finished: a panel
  // projecting it still has to fold the terminal frame, which is what stops the message
  // rendering as streaming. "Is anything happening?" is a question about STATUS, not about
  // whether a run is bound.
  it('keeps a finished run bound, but stops reporting the session as streaming', () => {
    const store = useAgentRunStore.getState();
    store.upsertRun(run());
    store.upsertRun(run({ status: 'completed' }));

    expect(selectRunForSession('sess_1')(useAgentRunStore.getState())?.run.runId).toBe('run_1');
    expect(isSessionStreaming('sess_1')(useAgentRunStore.getState())).toBe(false);
  });

  it('keeps the frame log when the run row is updated, so a status change does not wipe the turn', () => {
    const store = useAgentRunStore.getState();
    store.upsertRun(run());
    store.appendEvents('run_1', [event(0), event(1)]);
    store.upsertRun(run({ status: 'completed' }));

    expect(useAgentRunStore.getState().runs.run_1?.events).toHaveLength(2);
  });
});

describe('appendEvents', () => {
  // The live NDJSON stream and the durable replay overlap by design; dedupe is what makes
  // running both producers at once correct rather than double-rendering the turn.
  it('dedupes an overlapping replay against what the live stream already delivered', () => {
    const store = useAgentRunStore.getState();
    store.upsertRun(run());
    store.appendEvents('run_1', [event(0), event(1), event(2)]);
    store.appendEvents('run_1', [event(1), event(2), event(3)]);

    const record = useAgentRunStore.getState().runs.run_1;
    expect(record?.events.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    expect(record?.lastSeq).toBe(3);
  });

  it('orders by seq when a replay lands behind the live stream', () => {
    const store = useAgentRunStore.getState();
    store.upsertRun(run());
    store.appendEvents('run_1', [event(5)]);
    store.appendEvents('run_1', [event(2), event(3)]);

    expect(useAgentRunStore.getState().runs.run_1?.events.map((e) => e.seq)).toEqual([2, 3, 5]);
  });

  // The seq-0 agent.run_started frame IS how we learn a run exists — dropping frames that
  // arrive before the row would lose the start of the turn.
  it('accepts frames that arrive before the run row does', () => {
    useAgentRunStore.getState().appendEvents('run_unknown', [event(0, 'agent.run_started')]);
    expect(useAgentRunStore.getState().runs.run_unknown?.events).toHaveLength(1);
  });
});

describe('selectLiveRuns', () => {
  it('returns only runs still in flight — the ones worth tailing', () => {
    const store = useAgentRunStore.getState();
    store.upsertRun(run({ runId: 'run_live', sessionId: 'sess_1' }));
    store.upsertRun(run({ runId: 'run_done', sessionId: 'sess_2', status: 'completed' }));
    store.upsertRun(run({ runId: 'run_jaina', sessionId: 'sess_3', agent: 'jaina' }));

    const live = selectLiveRuns(useAgentRunStore.getState()).map((r) => r.runId);
    expect(live.sort()).toEqual(['run_jaina', 'run_live']);
  });

  it('holds runs from both agents at once, so two sessions can stream in parallel', () => {
    const store = useAgentRunStore.getState();
    store.upsertRun(run({ runId: 'run_o', sessionId: 'sess_o', agent: 'organic' }));
    store.upsertRun(run({ runId: 'run_j', sessionId: 'sess_j', agent: 'jaina' }));

    store.appendEvents('run_o', [event(0)]);
    store.appendEvents('run_j', [event(0)]);

    expect(selectEventsForSession('sess_o')(useAgentRunStore.getState())).toHaveLength(1);
    expect(selectEventsForSession('sess_j')(useAgentRunStore.getState())).toHaveLength(1);
  });
});

describe('terminal detection from the frame log', () => {
  // The bug this fixes: nothing marked a run terminal, so a run you navigated away from
  // never finished as far as the app was concerned — its Realtime channel stayed open
  // forever and the completion toast never fired.
  it('settles a run when its log carries response.done', () => {
    const store = useAgentRunStore.getState();
    store.upsertRun(run());
    store.appendEvents('run_1', [event(0), event(1, 'response.done')]);

    expect(useAgentRunStore.getState().runs.run_1?.run.status).toBe('completed');
    expect(isSessionStreaming('sess_1')(useAgentRunStore.getState())).toBe(false);
  });

  it('stops tailing a settled run', () => {
    const store = useAgentRunStore.getState();
    store.upsertRun(run());
    expect(selectLiveRuns(useAgentRunStore.getState())).toHaveLength(1);

    store.appendEvents('run_1', [event(1, 'response.done')]);
    expect(selectLiveRuns(useAgentRunStore.getState())).toHaveLength(0);
  });

  it('records a cancelled run as cancelled, not failed', () => {
    const store = useAgentRunStore.getState();
    store.upsertRun(run());
    store.appendEvents('run_1', [event(1, 'response.cancelled')]);

    expect(useAgentRunStore.getState().runs.run_1?.run.status).toBe('cancelled');
  });

  // Organic emits a NON-FATAL response.error when a background-job drain times out and then
  // still finishes the turn. Taking the first terminal frame would report that turn failed.
  it('lets a later completion beat an earlier non-fatal error', () => {
    const store = useAgentRunStore.getState();
    store.upsertRun(run());
    store.appendEvents('run_1', [event(1, 'response.error'), event(2, 'response.done')]);

    expect(useAgentRunStore.getState().runs.run_1?.run.status).toBe('completed');
  });

  // A projecting panel still has to fold the terminal frame — it is what stops the message
  // rendering as streaming — and it can only do that while it can still find the run.
  it('keeps the session bound to a settled run so a projection can finish folding it', () => {
    const store = useAgentRunStore.getState();
    store.upsertRun(run());
    store.appendEvents('run_1', [event(1, 'response.done')]);

    expect(selectRunForSession('sess_1')(useAgentRunStore.getState())?.run.runId).toBe('run_1');
  });

  it('rebinds the session when the next turn starts its own run', () => {
    const store = useAgentRunStore.getState();
    store.upsertRun(run());
    store.appendEvents('run_1', [event(1, 'response.done')]);
    store.upsertRun(run({ runId: 'run_2' }));

    expect(selectRunForSession('sess_1')(useAgentRunStore.getState())?.run.runId).toBe('run_2');
    expect(isSessionStreaming('sess_1')(useAgentRunStore.getState())).toBe(true);
  });
});
