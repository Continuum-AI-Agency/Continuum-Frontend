import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { AgentRunDto } from '@continuum/contracts';
import { isSessionStreaming, useAgentRunStore } from '@/lib/agents/runStore';

// PP-L1-jaina-stop-leaves-surface-loading: Stop must leave the surface it was pressed on with no
// run in flight. The surface reads "streaming" from the session's binding in the run store, so a
// Stop that cancels only the run this reader owns leaves a DIFFERENT run bound to the session —
// one this reader returned to, or one the store rebound to — reading live: the Stop control and
// the in-flight state stay up after the stream has already stopped.
mock.module('@/lib/auth/getBrowserAccessToken', () => ({
  getBrowserAccessToken: async () => null,
}));

const { stopJainaSession } = await import('./chatControls');

const run = (over: Partial<AgentRunDto>): AgentRunDto => ({
  runId: 'run_1',
  agent: 'jaina',
  sessionId: 'sess_1',
  brandId: 'brand_1',
  status: 'running',
  createdAt: '2026-10-12T00:00:00.000Z',
  ...over,
});

describe('stopJainaSession', () => {
  beforeEach(() => useAgentRunStore.getState().reset());

  it('ends the run this reader owns', async () => {
    useAgentRunStore.getState().upsertRun(run({ runId: 'run_owned' }));
    await stopJainaSession({ sessionId: 'sess_1', ownedRunId: 'run_owned' });
    expect(isSessionStreaming('sess_1')(useAgentRunStore.getState())).toBe(false);
  });

  it('also ends the run the session is bound to when it is not the owned one', async () => {
    useAgentRunStore.getState().upsertRun(run({ runId: 'run_owned' }));
    useAgentRunStore.getState().upsertRun(run({ runId: 'run_bound' }));
    await stopJainaSession({ sessionId: 'sess_1', ownedRunId: 'run_owned' });
    const state = useAgentRunStore.getState();
    expect(isSessionStreaming('sess_1')(state)).toBe(false);
    expect(state.runs.run_owned?.run.status).toBe('cancelled');
    expect(state.runs.run_bound?.run.status).toBe('cancelled');
  });

  it('ends a detached run when this reader owns none', async () => {
    useAgentRunStore.getState().upsertRun(run({ runId: 'run_detached' }));
    await stopJainaSession({ sessionId: 'sess_1', ownedRunId: undefined });
    expect(isSessionStreaming('sess_1')(useAgentRunStore.getState())).toBe(false);
  });

  it('leaves a run that already finished as it ended', async () => {
    useAgentRunStore.getState().upsertRun(run({ runId: 'run_done', status: 'completed' }));
    await stopJainaSession({ sessionId: 'sess_1', ownedRunId: undefined });
    expect(useAgentRunStore.getState().runs.run_done?.run.status).toBe('completed');
  });
});
