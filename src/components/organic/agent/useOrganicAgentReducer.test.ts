import { describe, expect, it } from 'bun:test';
import { applyOrganicFrame } from './applyOrganicFrame';
import type { AgentJobState, ConversationMessage } from './types';
import { initialPanelState, mergeRestoredMessages, panelReducer } from './useOrganicAgentReducer';

describe('useOrganicAgentReducer', () => {
  it('hydrates jobs from a valid array payload', () => {
    const state = initialPanelState();
    const next = panelReducer(state, {
      type: 'HYDRATE_JOBS',
      jobs: [
        {
          jobId: 'job-1',
          brandId: 'brand-1',
          status: 'queued',
        },
      ],
    });

    expect(next.isHydrated).toBe(true);
    expect(Object.keys(next.jobs)).toEqual(['job-1']);
  });

  it('advances a queued job to running when a pipeline.stage arrives for it', () => {
    const queued = panelReducer(initialPanelState(), {
      type: 'HYDRATE_JOBS',
      jobs: [{ jobId: 'job-1', brandId: 'brand-1', status: 'queued' }],
    });

    const next = panelReducer(queued, {
      type: 'PIPELINE_STAGE',
      event: {
        jobId: 'job-1',
        brandId: 'brand-1',
        planId: null,
        planItemId: null,
        stage: 'concept',
        status: 'active',
        agentName: 'creative',
      },
    });

    expect(next.jobs['job-1'].status).toBe('running');
    expect(next.jobs['job-1'].stage).toBe('concept');
  });

  it('does not regress a completed job back to running on a late pipeline.stage', () => {
    const completed = panelReducer(initialPanelState(), {
      type: 'HYDRATE_JOBS',
      jobs: [{ jobId: 'job-1', brandId: 'brand-1', status: 'completed' }],
    });

    const next = panelReducer(completed, {
      type: 'PIPELINE_STAGE',
      event: {
        jobId: 'job-1',
        brandId: 'brand-1',
        planId: null,
        planItemId: null,
        stage: 'merge',
        status: 'active',
      },
    });

    expect(next.jobs['job-1'].status).toBe('completed');
  });

  it('does not create a phantom job for a pipeline.stage with no matching job', () => {
    const next = panelReducer(initialPanelState(), {
      type: 'PIPELINE_STAGE',
      event: {
        jobId: 'ghost',
        brandId: 'brand-1',
        planId: null,
        planItemId: null,
        stage: 'concept',
        status: 'active',
      },
    });

    expect(next.jobs).toEqual({});
    expect(next.pipeline.ghost).toBeDefined();
  });

  it('removes a cancelled job and its active pipeline placeholder', () => {
    let state = panelReducer(initialPanelState(), {
      type: 'HYDRATE_JOBS',
      jobs: [
        {
          jobId: 'job-1',
          brandId: 'brand-1',
          status: 'running',
          toolCallId: 'call-1',
        } as AgentJobState,
      ],
    });

    applyOrganicFrame(
      {
        type: 'job.cancelled',
        data: { jobId: 'job-1', brandId: 'brand-1', status: 'cancelled' },
      },
      (action) => {
        state = panelReducer(state, action);
      },
      'chat',
    );

    expect(state.jobs['job-1']).toBeUndefined();
    expect(state.pipeline['job-1']).toBeUndefined();
  });

  it('restores an optimistically removed queued job after cancellation fails', () => {
    const queuedJob: AgentJobState = {
      jobId: 'job-1',
      brandId: 'brand-1',
      status: 'queued',
    };
    const hydrated = panelReducer(initialPanelState(), {
      type: 'HYDRATE_JOBS',
      jobs: [queuedJob],
    });
    const removed = panelReducer(hydrated, {
      type: 'JOB_CANCEL_START',
      jobId: queuedJob.jobId,
    });
    const restored = panelReducer(removed, { type: 'JOB_CANCEL_FAILURE', jobId: queuedJob.jobId });

    expect(removed.jobs['job-1']).toBeUndefined();
    expect(restored.jobs['job-1']).toEqual(queuedJob);
  });

  it('does not resurrect a stale queued job when progress arrives before X fails', () => {
    const queuedJob: AgentJobState = {
      jobId: 'job-1',
      brandId: 'brand-1',
      status: 'queued',
    };
    const hydrated = panelReducer(initialPanelState(), {
      type: 'HYDRATE_JOBS',
      jobs: [queuedJob],
    });
    const removed = panelReducer(hydrated, { type: 'JOB_CANCEL_START', jobId: 'job-1' });
    const progressed = panelReducer(removed, {
      type: 'JOB_UPDATE',
      job: { jobId: 'job-1', brandId: 'brand-1', status: 'running', stage: 'drafting' },
    });
    const rollback = panelReducer(progressed, {
      type: 'JOB_CANCEL_FAILURE',
      jobId: queuedJob.jobId,
    });

    expect(rollback.jobs['job-1']).toMatchObject({ status: 'running', stage: 'drafting' });
  });

  it('does not overwrite newer pipeline progress when X fails', () => {
    const queuedJob: AgentJobState = {
      jobId: 'job-1',
      brandId: 'brand-1',
      status: 'queued',
      toolCallId: 'tool-1',
    };
    let state = panelReducer(initialPanelState(), {
      type: 'HYDRATE_JOBS',
      jobs: [queuedJob],
    });
    state = panelReducer(state, { type: 'JOB_CANCEL_START', jobId: queuedJob.jobId });
    state = panelReducer(state, {
      type: 'PIPELINE_STAGE',
      event: {
        jobId: queuedJob.jobId,
        brandId: queuedJob.brandId,
        planId: null,
        planItemId: null,
        stage: 'assets',
        status: 'active',
        pct: 70,
      },
    });
    state = panelReducer(state, { type: 'JOB_CANCEL_FAILURE', jobId: queuedJob.jobId });

    expect(state.jobs['job-1']).toBeUndefined();
    expect(state.pipeline['job-1']).toMatchObject({
      status: 'running',
      currentStage: 'assets',
      pct: 70,
    });
  });

  it('does not overwrite a newer pipeline card when X fails', () => {
    const queuedJob: AgentJobState = {
      jobId: 'job-1',
      brandId: 'brand-1',
      status: 'queued',
      toolCallId: 'tool-1',
    };
    let state = panelReducer(initialPanelState(), {
      type: 'HYDRATE_JOBS',
      jobs: [queuedJob],
    });
    state = panelReducer(state, { type: 'JOB_CANCEL_START', jobId: queuedJob.jobId });
    state = panelReducer(state, {
      type: 'PIPELINE_CARD',
      card: {
        jobId: queuedJob.jobId,
        status: 'running',
        currentStage: 'quality',
        pct: 85,
      },
    });
    state = panelReducer(state, { type: 'JOB_CANCEL_FAILURE', jobId: queuedJob.jobId });

    expect(state.jobs['job-1']).toBeUndefined();
    expect(state.pipeline['job-1']).toMatchObject({
      status: 'running',
      currentStage: 'quality',
      pct: 85,
    });
  });

  it('does not resurrect a stale queued job when job.cancelled arrives before X fails', () => {
    const queuedJob: AgentJobState = {
      jobId: 'job-1',
      brandId: 'brand-1',
      status: 'queued',
    };
    let state = panelReducer(initialPanelState(), { type: 'HYDRATE_JOBS', jobs: [queuedJob] });
    state = panelReducer(state, { type: 'JOB_CANCEL_START', jobId: 'job-1' });
    applyOrganicFrame(
      { type: 'job.cancelled', data: { jobId: 'job-1', brandId: 'brand-1' } },
      (action) => {
        state = panelReducer(state, action);
      },
      'chat',
    );
    state = panelReducer(state, { type: 'JOB_CANCEL_FAILURE', jobId: queuedJob.jobId });

    expect(state.jobs['job-1']).toBeUndefined();
  });

  it('does not throw when hydrate payload is not iterable', () => {
    const state = initialPanelState();
    const next = panelReducer(state, {
      type: 'HYDRATE_JOBS',
      jobs: { bad: true } as unknown as AgentJobState[],
    });

    expect(next.isHydrated).toBe(true);
    expect(next.jobs).toEqual({});
  });

  it('ignores malformed jobs without a string jobId', () => {
    const state = initialPanelState();
    const next = panelReducer(state, {
      type: 'HYDRATE_JOBS',
      jobs: [{ brandId: 'brand-1', status: 'queued' }] as unknown as AgentJobState[],
    });

    expect(next.isHydrated).toBe(true);
    expect(next.jobs).toEqual({});
  });

  it('seeds a pipeline card from a hydrated tool-dispatched job (toolCallId)', () => {
    const next = panelReducer(initialPanelState(), {
      type: 'HYDRATE_JOBS',
      jobs: [
        {
          jobId: 'job-1',
          brandId: 'brand-1',
          status: 'completed',
          platform: 'instagram',
          draftId: 'draft-1',
          toolCallId: 'call_abc',
          planId: 'plan-1',
          planItemId: 'item-1',
        } as AgentJobState,
      ],
    });

    const card = next.pipeline['job-1'];
    expect(card).toBeDefined();
    expect(card.toolCallId).toBe('call_abc');
    expect(card.draftId).toBe('draft-1');
    expect(card.planItemId).toBe('item-1');
    expect(card.status).toBe('completed');
    expect(card.stages.every((s) => s.status === 'done')).toBe(true);
    // A completed text job means the draft exists: the Enrich CTA gate.
    expect(card.checkpoint?.textReady).toBe(true);
    expect(card.checkpoint?.blueprintReady).toBeUndefined();
  });

  it('derives the checkpoint from the durable mediaStage on hydrated jobs', () => {
    const next = panelReducer(initialPanelState(), {
      type: 'HYDRATE_JOBS',
      jobs: [
        {
          jobId: 'job-1',
          brandId: 'brand-1',
          status: 'completed',
          draftId: 'draft-1',
          toolCallId: 'call_abc',
          mediaStage: 'storyboard_ready',
        } as AgentJobState,
      ],
    });

    expect(next.pipeline['job-1'].checkpoint).toMatchObject({
      textReady: true,
      blueprintReady: true,
    });
  });

  it('does not seed a pipeline card for hydrated jobs without a toolCallId', () => {
    const next = panelReducer(initialPanelState(), {
      type: 'HYDRATE_JOBS',
      jobs: [
        { jobId: 'job-1', brandId: 'brand-1', status: 'completed', draftId: 'd1' } as AgentJobState,
      ],
    });

    expect(next.pipeline['job-1']).toBeUndefined();
  });

  it('converges a restored running card to the durable job status on hydrate', () => {
    const restored = panelReducer(initialPanelState(), {
      type: 'PIPELINE_CARD',
      card: { jobId: 'job-1', status: 'running', toolCallId: 'call_abc', currentStage: 'draft' },
    });

    const next = panelReducer(restored, {
      type: 'HYDRATE_JOBS',
      jobs: [
        {
          jobId: 'job-1',
          brandId: 'brand-1',
          status: 'completed',
          draftId: 'draft-1',
          toolCallId: 'call_abc',
        } as AgentJobState,
      ],
    });

    const card = next.pipeline['job-1'];
    expect(card.status).toBe('completed');
    expect(card.pct).toBe(100);
    expect(card.draftId).toBe('draft-1');
    expect(card.toolCallId).toBe('call_abc');
  });

  it('reads stage/pct from the durable progress jsonb when seeding', () => {
    const next = panelReducer(initialPanelState(), {
      type: 'HYDRATE_JOBS',
      jobs: [
        {
          jobId: 'job-1',
          brandId: 'brand-1',
          status: 'running',
          toolCallId: 'call_abc',
          progress: { stage: 'blueprint', pct: 62 },
        } as unknown as AgentJobState,
      ],
    });

    const card = next.pipeline['job-1'];
    expect(card.currentStage).toBe('blueprint');
    expect(card.pct).toBe(62);
    expect(card.status).toBe('running');
  });
});

describe('SYNC_GENERATION_SUMMARIES', () => {
  const seeded = () =>
    panelReducer(initialPanelState(), {
      type: 'HYDRATE_JOBS',
      jobs: [
        {
          jobId: 'job-1',
          brandId: 'brand-1',
          status: 'running',
          toolCallId: 'call_abc',
        } as AgentJobState,
      ],
    });

  it('converges the job and its pipeline card to the polled durable summary', () => {
    const next = panelReducer(seeded(), {
      type: 'SYNC_GENERATION_SUMMARIES',
      summaries: [
        {
          jobId: 'job-1',
          brandId: 'brand-1',
          status: 'completed',
          draftId: 'draft-1',
          mediaStage: 'storyboard_ready',
          toolCallId: 'call_abc',
        },
      ],
    });

    expect(next.jobs['job-1'].status).toBe('completed');
    expect(next.jobs['job-1'].draftId).toBe('draft-1');
    const card = next.pipeline['job-1'];
    expect(card.status).toBe('completed');
    expect(card.draftId).toBe('draft-1');
    expect(card.checkpoint).toMatchObject({ textReady: true, blueprintReady: true });
  });

  it('advances the checkpoint as later summaries report media progress', () => {
    let state = panelReducer(seeded(), {
      type: 'SYNC_GENERATION_SUMMARIES',
      summaries: [
        { jobId: 'job-1', brandId: 'brand-1', status: 'completed', mediaStage: 'storyboard_ready' },
      ],
    });
    state = panelReducer(state, {
      type: 'SYNC_GENERATION_SUMMARIES',
      summaries: [
        { jobId: 'job-1', brandId: 'brand-1', status: 'completed', mediaStage: 'realized' },
      ],
    });

    expect(state.pipeline['job-1'].checkpoint?.mediaStatus).toBe('ready');
  });

  it('ignores summaries for jobs this session does not know', () => {
    const state = seeded();
    const next = panelReducer(state, {
      type: 'SYNC_GENERATION_SUMMARIES',
      summaries: [{ jobId: 'other-brand-job', brandId: 'brand-1', status: 'running' }],
    });

    expect(next.jobs['other-brand-job']).toBeUndefined();
    expect(next.pipeline['other-brand-job']).toBeUndefined();
  });

  it('never regresses a locally terminal job/card on a stale non-terminal read', () => {
    let state = seeded();
    state = panelReducer(state, {
      type: 'SYNC_GENERATION_SUMMARIES',
      summaries: [{ jobId: 'job-1', brandId: 'brand-1', status: 'completed' }],
    });
    const next = panelReducer(state, {
      type: 'SYNC_GENERATION_SUMMARIES',
      summaries: [{ jobId: 'job-1', brandId: 'brand-1', status: 'running', stage: 'draft' }],
    });

    expect(next.jobs['job-1'].status).toBe('completed');
    expect(next.pipeline['job-1'].status).toBe('completed');
  });
});

describe('SESSION_SWITCH', () => {
  it('resets transient state and populates new session messages', () => {
    const dirty = panelReducer(
      {
        ...initialPanelState(),
        sessionId: 'old-session',
        streamingMessageId: 'msg-123',
        jobs: { 'job-1': { jobId: 'job-1', brandId: 'b', status: 'running' } as AgentJobState },
      },
      {
        type: 'SESSION_SWITCH',
        sessionId: 'new-session',
        messages: [{ id: 'm1', role: 'user', content: 'Hello' }],
      },
    );
    expect(dirty.sessionId).toBe('new-session');
    expect(dirty.messages).toHaveLength(1);
    expect(dirty.messages[0].content).toBe('Hello');
    expect(dirty.streamingMessageId).toBeNull();
    expect(dirty.jobs).toEqual({});
    expect(dirty.isHydrated).toBe(true);
    expect(dirty.inputValue).toBe('');
  });

  it('works with empty messages array for new session', () => {
    const state = panelReducer(initialPanelState(), {
      type: 'SESSION_SWITCH',
      sessionId: 'fresh-session',
      messages: [],
    });
    expect(state.sessionId).toBe('fresh-session');
    expect(state.messages).toHaveLength(0);
    expect(state.isHydrated).toBe(true);
  });

  // The panel fires history hydration on mount without waiting for the composer, so the
  // page can land AFTER the user has typed. A full reset then deleted their message, the
  // empty assistant bubble, and the streamingMessageId the deltas attach to — the turn
  // answered into nothing.
  it('preserves an in-flight turn when it re-hydrates the session already on screen', () => {
    const submitted = panelReducer(
      { ...initialPanelState(), sessionId: 'same-session', isHydrated: true },
      { type: 'SUBMIT_USER_MESSAGE', content: 'How did last week do?', messageId: 'user-1' },
    );
    const streamingMessageId = submitted.streamingMessageId;
    expect(streamingMessageId).not.toBeNull();

    const hydrated = panelReducer(submitted, {
      type: 'SESSION_SWITCH',
      sessionId: 'same-session',
      messages: [],
    });

    expect(hydrated.streamingMessageId).toBe(streamingMessageId);
    expect(hydrated.messages.map((m) => m.id)).toEqual(['user-1', streamingMessageId as string]);
    expect(hydrated.messages[0].content).toBe('How did last week do?');
    expect(hydrated.messages[1].role).toBe('assistant');
    expect(hydrated.isHydrated).toBe(true);
  });

  it('merges server history under an in-flight turn on the same session', () => {
    const submitted = panelReducer(
      {
        ...initialPanelState(),
        sessionId: 'same-session',
        isHydrated: true,
        messages: [{ id: 'old-1', role: 'user', content: 'first question' }],
      },
      { type: 'SUBMIT_USER_MESSAGE', content: 'second question', messageId: 'user-2' },
    );

    const hydrated = panelReducer(submitted, {
      type: 'SESSION_SWITCH',
      sessionId: 'same-session',
      messages: [
        { id: 'old-1', role: 'user', content: 'first question' },
        { id: 'old-2', role: 'assistant', content: 'first answer' },
      ],
    });

    expect(hydrated.messages.map((m) => m.id)).toEqual([
      'old-1',
      'old-2',
      'user-2',
      submitted.streamingMessageId as string,
    ]);
    expect(hydrated.streamingMessageId).toBe(submitted.streamingMessageId);
  });

  it('still fully resets when the switch is to a different session', () => {
    const submitted = panelReducer(
      { ...initialPanelState(), sessionId: 'session-a', isHydrated: true },
      { type: 'SUBMIT_USER_MESSAGE', content: 'typed into A', messageId: 'user-a' },
    );

    const switched = panelReducer(submitted, {
      type: 'SESSION_SWITCH',
      sessionId: 'session-b',
      messages: [],
    });

    expect(switched.sessionId).toBe('session-b');
    expect(switched.messages).toEqual([]);
    expect(switched.streamingMessageId).toBeNull();
  });
});

describe('mergeRestoredMessages', () => {
  const user = (id: string, content = id): ConversationMessage => ({
    id,
    role: 'user',
    content,
  });

  it('takes the server page when there is nothing local', () => {
    const restored = [user('a'), user('b')];
    expect(mergeRestoredMessages([], restored)).toEqual(restored);
  });

  it('keeps a local-only in-flight message the server page does not have yet', () => {
    const merged = mergeRestoredMessages([user('a'), user('live')], [user('a')]);
    expect(merged.map((m) => m.id)).toEqual(['a', 'live']);
  });

  it('dedupes by id and lets the server version win for shared history', () => {
    const merged = mergeRestoredMessages(
      [user('a', 'local copy')],
      [user('a', 'server copy'), user('b')],
    );
    expect(merged).toHaveLength(2);
    expect(merged[0].content).toBe('server copy');
  });

  it('keeps earlier local-only messages ahead of the server page rather than moving them last', () => {
    const merged = mergeRestoredMessages(
      [user('older'), user('a'), user('live')],
      [user('a'), user('b')],
    );
    expect(merged.map((m) => m.id)).toEqual(['older', 'a', 'b', 'live']);
  });
});

describe('LOAD_MESSAGES_START', () => {
  it('clears messages, jobs, and streaming state', () => {
    const withData = {
      ...initialPanelState(),
      sessionId: 's1',
      messages: [{ id: 'm1', role: 'user' as const, content: 'hi' }],
      jobs: { j1: { jobId: 'j1', brandId: 'b', status: 'completed' as const } as AgentJobState },
      streamingMessageId: 'msg-streaming',
      isHydrated: true,
    };
    const next = panelReducer(withData, { type: 'LOAD_MESSAGES_START' });
    expect(next.messages).toHaveLength(0);
    expect(next.jobs).toEqual({});
    expect(next.pipeline).toEqual({});
    expect(next.planItemStatus).toEqual({});
    expect(next.pendingToolApprovals).toEqual([]);
    expect(next.streamingMessageId).toBeNull();
    expect(next.isHydrated).toBe(false);
    expect(next.sessionId).toBe('s1'); // sessionId is preserved
  });
});

describe('PIPELINE_STAGE', () => {
  it('builds the timeline with prior stages done and the current stage active', () => {
    const next = panelReducer(initialPanelState(), {
      type: 'PIPELINE_STAGE',
      event: {
        jobId: 'job-1',
        brandId: 'brand-1',
        planId: 'plan-1',
        planItemId: 'item-1',
        stage: 'draft',
        agentName: 'creative',
        pct: 45,
        status: 'active',
      },
    });
    const card = next.pipeline['job-1'];
    expect(card.status).toBe('running');
    expect(card.currentStage).toBe('draft');
    expect(card.pct).toBe(45);
    expect(card.planId).toBe('plan-1');
    const byStage = Object.fromEntries(card.stages.map((s) => [s.stage, s.status]));
    expect(byStage.strategist).toBe('done');
    expect(byStage.concept).toBe('done');
    expect(byStage.draft).toBe('active');
    expect(byStage.quality).toBe('pending');
    expect(byStage.merge).toBe('pending');
  });

  it('advances the timeline across successive stage frames', () => {
    let state = panelReducer(initialPanelState(), {
      type: 'PIPELINE_STAGE',
      event: {
        jobId: 'j',
        brandId: 'b',
        planId: null,
        planItemId: null,
        stage: 'strategist',
        status: 'active',
      },
    });
    state = panelReducer(state, {
      type: 'PIPELINE_STAGE',
      event: {
        jobId: 'j',
        brandId: 'b',
        planId: null,
        planItemId: null,
        stage: 'quality',
        status: 'active',
      },
    });
    const byStage = Object.fromEntries(state.pipeline['j'].stages.map((s) => [s.stage, s.status]));
    expect(byStage.strategist).toBe('done');
    expect(byStage.assets).toBe('done');
    expect(byStage.quality).toBe('active');
  });
});

describe('PIPELINE_CARD', () => {
  it('on completed, marks all stages done and merges preview + quality', () => {
    const start = panelReducer(initialPanelState(), {
      type: 'PIPELINE_STAGE',
      event: {
        jobId: 'j',
        brandId: 'b',
        planId: 'p',
        planItemId: 'i',
        stage: 'draft',
        status: 'active',
      },
    });
    const next = panelReducer(start, {
      type: 'PIPELINE_CARD',
      card: {
        jobId: 'j',
        status: 'completed',
        currentStage: 'merge',
        preview: { caption: 'hi', imageUrl: null, format: 'carousel' },
        quality: { passed: true, overallScore: 88 },
        draftId: 'draft-1',
      },
    });
    const card = next.pipeline['j'];
    expect(card.status).toBe('completed');
    expect(card.pct).toBe(100);
    expect(card.stages.every((s) => s.status === 'done')).toBe(true);
    expect(card.preview?.caption).toBe('hi');
    expect(card.quality?.overallScore).toBe(88);
    expect(card.draftId).toBe('draft-1');
  });

  it('on failed, marks the current stage failed', () => {
    const start = panelReducer(initialPanelState(), {
      type: 'PIPELINE_STAGE',
      event: {
        jobId: 'j',
        brandId: 'b',
        planId: null,
        planItemId: null,
        stage: 'assets',
        status: 'active',
      },
    });
    const next = panelReducer(start, {
      type: 'PIPELINE_CARD',
      card: { jobId: 'j', status: 'failed', currentStage: 'assets', error: { message: 'boom' } },
    });
    const card = next.pipeline['j'];
    expect(card.status).toBe('failed');
    expect(card.stages.find((s) => s.stage === 'assets')?.status).toBe('failed');
    expect(card.error?.message).toBe('boom');
  });

  it('keeps interleaved job and draft identity on the matching pipeline cards', () => {
    let state = panelReducer(initialPanelState(), {
      type: 'PIPELINE_STAGE',
      event: {
        jobId: 'job-a',
        brandId: 'brand-1',
        planId: 'plan-1',
        planItemId: 'item-a',
        stage: 'draft',
        status: 'active',
      },
    });
    state = panelReducer(state, {
      type: 'PIPELINE_STAGE',
      event: {
        jobId: 'job-c',
        brandId: 'brand-1',
        planId: 'plan-1',
        planItemId: 'item-c',
        stage: 'draft',
        status: 'active',
      },
    });
    state = panelReducer(state, {
      type: 'PIPELINE_CARD',
      card: {
        jobId: 'job-c',
        planId: 'plan-1',
        planItemId: 'item-c',
        status: 'running',
        draftId: 'draft-c',
        checkpoint: { textReady: true },
      },
    });
    state = panelReducer(state, {
      type: 'PIPELINE_CARD',
      card: {
        jobId: 'job-a',
        planId: 'plan-1',
        planItemId: 'item-a',
        status: 'running',
        draftId: 'draft-a',
        checkpoint: { textReady: true },
      },
    });
    state = panelReducer(state, {
      type: 'DRAFT_BLUEPRINT',
      draftId: 'draft-c',
      previewRevision: 'revision-c',
      previews: ['https://cdn.example/c.png'],
    });

    expect(state.pipeline['job-a'].planItemId).toBe('item-a');
    expect(state.pipeline['job-a'].draftId).toBe('draft-a');
    expect(state.pipeline['job-a'].preview?.images).toBeUndefined();
    expect(state.pipeline['job-c'].planItemId).toBe('item-c');
    expect(state.pipeline['job-c'].draftId).toBe('draft-c');
    expect(state.pipeline['job-c'].preview?.images).toEqual(['https://cdn.example/c.png']);
    expect(state.pipeline['job-c'].checkpoint?.blueprintReady).toBe(true);
  });

  it('preserves checkpoint and turn identity when a later stage frame arrives', () => {
    const withCard = panelReducer(initialPanelState(), {
      type: 'PIPELINE_CARD',
      card: {
        jobId: 'job-a',
        brandId: 'brand-1',
        planId: 'plan-1',
        planItemId: 'item-a',
        toolCallId: 'tool-1',
        status: 'completed',
        draftId: 'draft-a',
        checkpoint: {
          textReady: true,
          blueprintReady: true,
          awaitingMediaChoice: true,
          mediaStatus: 'pending',
        },
      },
    });

    const afterStage = panelReducer(withCard, {
      type: 'PIPELINE_STAGE',
      event: {
        jobId: 'job-a',
        brandId: 'brand-1',
        planId: 'plan-1',
        planItemId: 'item-a',
        stage: 'merge',
        status: 'done',
      },
    });

    expect(afterStage.pipeline['job-a']).toMatchObject({
      draftId: 'draft-a',
      toolCallId: 'tool-1',
      checkpoint: {
        textReady: true,
        blueprintReady: true,
        awaitingMediaChoice: true,
        mediaStatus: 'pending',
      },
    });
  });
});

describe('STREAM_ERROR', () => {
  it('sets the error field on the streaming message without clobbering streamed content', () => {
    const submitted = panelReducer(initialPanelState(), {
      type: 'SUBMIT_USER_MESSAGE',
      content: 'plan my week',
      messageId: 'u1',
    });
    const partial = panelReducer(submitted, { type: 'STREAM_DELTA', delta: 'Here is a plan' });
    const errored = panelReducer(partial, { type: 'STREAM_ERROR', error: 'connection lost' });

    const assistant = errored.messages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toBe('Here is a plan');
    expect(assistant?.error).toBe('connection lost');
    expect(errored.streamingMessageId).toBeNull();
  });
});

describe('RETRY_FROM_ASSISTANT', () => {
  it('drops the failed assistant turn and re-opens a fresh streaming message', () => {
    const submitted = panelReducer(initialPanelState(), {
      type: 'SUBMIT_USER_MESSAGE',
      content: 'plan my week',
      messageId: 'u1',
    });
    const assistantId = submitted.streamingMessageId!;
    const errored = panelReducer(submitted, { type: 'STREAM_ERROR', error: 'boom' });

    const retried = panelReducer(errored, {
      type: 'RETRY_FROM_ASSISTANT',
      assistantMessageId: assistantId,
    });

    // The user message is preserved; the stale assistant turn is replaced.
    expect(retried.messages).toHaveLength(2);
    expect(retried.messages[0]).toMatchObject({ id: 'u1', role: 'user', content: 'plan my week' });
    expect(retried.messages[1].role).toBe('assistant');
    expect(retried.messages[1].id).not.toBe(assistantId);
    expect(retried.messages[1].content).toBe('');
    expect(retried.messages[1].error).toBeUndefined();
    expect(retried.streamingMessageId).toBe(retried.messages[1].id);
  });

  it('is a no-op when the assistant message id is unknown', () => {
    const submitted = panelReducer(initialPanelState(), {
      type: 'SUBMIT_USER_MESSAGE',
      content: 'hi',
      messageId: 'u1',
    });
    const next = panelReducer(submitted, {
      type: 'RETRY_FROM_ASSISTANT',
      assistantMessageId: 'missing',
    });
    expect(next).toBe(submitted);
  });
});

describe('silent auto-retry on transient STREAM_ERROR', () => {
  const submitted = () =>
    panelReducer(initialPanelState(), {
      type: 'SUBMIT_USER_MESSAGE',
      content: 'plan my week',
      messageId: 'u1',
    });

  it('queues one silent retry on the first transient error instead of painting the row', () => {
    const state = submitted();
    const assistantId = state.streamingMessageId!;
    const errored = panelReducer(state, {
      type: 'STREAM_ERROR',
      error: 'upstream reset',
      code: 'upstream_reset',
      transient: true,
    });

    expect(errored.pendingAutoRetry).toBe(assistantId);
    expect(errored.autoRetryConsumed).toBe(true);
    expect(errored.streamingMessageId).toBeNull();
  });

  it('keeps the pending retry through the trailing STREAM_COMPLETE the stream hook emits', () => {
    let state = submitted();
    state = panelReducer(state, { type: 'STREAM_ERROR', error: 'reset', transient: true });
    const after = panelReducer(state, { type: 'STREAM_COMPLETE' });

    expect(after.pendingAutoRetry).toBe(state.pendingAutoRetry);
  });

  it('paints msg.error when the auto-retried turn fails transiently again', () => {
    let state = submitted();
    const firstAssistantId = state.streamingMessageId!;
    state = panelReducer(state, { type: 'STREAM_ERROR', error: 'reset', transient: true });
    state = panelReducer(state, {
      type: 'RETRY_FROM_ASSISTANT',
      assistantMessageId: firstAssistantId,
    });
    expect(state.pendingAutoRetry).toBeNull();

    const retriedAssistantId = state.streamingMessageId!;
    state = panelReducer(state, { type: 'STREAM_ERROR', error: 'reset again', transient: true });

    expect(state.pendingAutoRetry).toBeNull();
    expect(state.messages.find((m) => m.id === retriedAssistantId)?.error).toBe('reset again');
  });

  it('paints msg.error immediately on a non-transient error', () => {
    const state = submitted();
    const assistantId = state.streamingMessageId!;
    const errored = panelReducer(state, { type: 'STREAM_ERROR', error: 'invalid request' });

    expect(errored.pendingAutoRetry).toBeNull();
    expect(errored.messages.find((m) => m.id === assistantId)?.error).toBe('invalid request');
  });

  it('stamps the error on the held turn so an abandoned retry still surfaces it', () => {
    const state = submitted();
    const assistantId = state.streamingMessageId!;
    let next = panelReducer(state, { type: 'STREAM_ERROR', error: 'reset', transient: true });
    next = panelReducer(next, { type: 'AUTO_RETRY_ABANDON' });

    expect(next.pendingAutoRetry).toBeNull();
    expect(next.messages.find((m) => m.id === assistantId)?.error).toBe('reset');
  });

  it('resets the auto-retry budget when the next user turn opens', () => {
    let state = submitted();
    state = panelReducer(state, { type: 'STREAM_ERROR', error: 'reset', transient: true });
    state = panelReducer(state, {
      type: 'SUBMIT_USER_MESSAGE',
      content: 'try something else',
      messageId: 'u2',
    });

    expect(state.autoRetryConsumed).toBe(false);
    expect(state.pendingAutoRetry).toBeNull();
  });
});

describe('STREAM_RETRYING reconnecting status', () => {
  const streaming = () =>
    panelReducer(initialPanelState(), {
      type: 'SUBMIT_USER_MESSAGE',
      content: 'plan my week',
      messageId: 'u1',
    });

  it('sets the reconnecting status while a turn is streaming', () => {
    const next = panelReducer(streaming(), {
      type: 'STREAM_RETRYING',
      attempt: 2,
      reason: 'upstream_reset',
    });

    expect(next.streamRetrying).toEqual({ attempt: 2, reason: 'upstream_reset' });
  });

  it('ignores a retrying frame when no turn is streaming', () => {
    const idle = panelReducer(initialPanelState(), { type: 'STREAM_RETRYING', attempt: 1 });

    expect(idle.streamRetrying).toBeNull();
  });

  it('clears on the next delta (activity resumed)', () => {
    let state = panelReducer(streaming(), { type: 'STREAM_RETRYING', attempt: 1 });
    state = panelReducer(state, { type: 'STREAM_DELTA', delta: 'back' });

    expect(state.streamRetrying).toBeNull();
  });

  it('clears on STREAM_COMPLETE and STREAM_ERROR', () => {
    const retrying = panelReducer(streaming(), { type: 'STREAM_RETRYING', attempt: 1 });

    expect(panelReducer(retrying, { type: 'STREAM_COMPLETE' }).streamRetrying).toBeNull();
    expect(
      panelReducer(retrying, { type: 'STREAM_ERROR', error: 'gone' }).streamRetrying,
    ).toBeNull();
  });
});

describe('PLAN_STATUS + tool approvals', () => {
  it('records plan item status by itemId', () => {
    const next = panelReducer(initialPanelState(), {
      type: 'PLAN_STATUS',
      event: { planId: 'p', itemId: 'item-1', status: 'executing' },
    });
    expect(next.planItemStatus['item-1']).toBe('executing');
  });

  it('adds and resolves tool approvals without duplicates', () => {
    const approval = { approvalId: 'a1', toolCallId: 'tc1', toolName: 'publishDraft', input: {} };
    let state = panelReducer(initialPanelState(), { type: 'TOOL_APPROVAL_ADD', approval });
    state = panelReducer(state, { type: 'TOOL_APPROVAL_ADD', approval });
    expect(state.pendingToolApprovals).toHaveLength(1);
    state = panelReducer(state, { type: 'TOOL_APPROVAL_RESOLVE', approvalId: 'a1' });
    expect(state.pendingToolApprovals).toHaveLength(0);
  });

  it('registers a bulk run by runId (idempotent upsert)', () => {
    const run = { runId: 'run_p1', planId: 'p1', total: 80 };
    let state = panelReducer(initialPanelState(), { type: 'BULK_RUN_START', run });
    expect(state.bulkRuns['run_p1']).toEqual(run);
    state = panelReducer(state, { type: 'BULK_RUN_START', run });
    expect(Object.keys(state.bulkRuns)).toHaveLength(1);
  });
});

// Bug #220 — the media-choice checkpoint must never lose the approval token.
// `previewRevision` is what the realize path validates, so a path that carries
// "awaitingMediaChoice" without it strands the card with nothing to click.
describe('useOrganicAgentReducer media-choice approval token', () => {
  const cardWithText = (draftId: string) =>
    panelReducer(initialPanelState(), {
      type: 'PIPELINE_CARD',
      card: {
        jobId: 'job-b',
        brandId: 'brand-1',
        status: 'running',
        draftId,
        checkpoint: { textReady: true },
      },
    });

  it('keeps the blueprint checkpoint and token when preview signing produced nothing', () => {
    const next = panelReducer(cardWithText('draft-b'), {
      type: 'DRAFT_BLUEPRINT',
      draftId: 'draft-b',
      previewRevision: 'revision-b',
      previews: [],
    });

    expect(next.pipeline['job-b'].checkpoint?.blueprintReady).toBe(true);
    expect(next.pipeline['job-b'].checkpoint?.awaitingMediaChoice).toBe(true);
    expect(next.pipeline['job-b'].checkpoint?.previewRevision).toBe('revision-b');
  });

  it('does not invent an empty preview list when there are no previews', () => {
    const next = panelReducer(cardWithText('draft-b'), {
      type: 'DRAFT_BLUEPRINT',
      draftId: 'draft-b',
      previewRevision: 'revision-b',
      previews: [],
    });

    expect(next.pipeline['job-b'].preview?.images).toBeUndefined();
  });

  it('still stamps previews when the blueprint carried them', () => {
    const next = panelReducer(cardWithText('draft-b'), {
      type: 'DRAFT_BLUEPRINT',
      draftId: 'draft-b',
      previewRevision: 'revision-b',
      previews: ['https://cdn.example/b.png'],
    });

    expect(next.pipeline['job-b'].preview?.images).toEqual(['https://cdn.example/b.png']);
    expect(next.pipeline['job-b'].checkpoint?.previewRevision).toBe('revision-b');
  });

  it('ignores a blueprint with no draft id', () => {
    const base = cardWithText('draft-b');
    const next = panelReducer(base, {
      type: 'DRAFT_BLUEPRINT',
      draftId: '',
      previewRevision: 'revision-b',
      previews: [],
    });

    expect(next).toBe(base);
  });

  // checkpointFromDurableState is exercised through HYDRATE_JOBS, its real caller.
  it('carries previewRevision from a durable job row into the checkpoint', () => {
    const next = panelReducer(initialPanelState(), {
      type: 'HYDRATE_JOBS',
      jobs: [
        {
          jobId: 'job-d',
          brandId: 'brand-1',
          status: 'completed',
          draftId: 'draft-d',
          toolCallId: 'tool-d',
          mediaStage: 'storyboard_ready',
          previewRevision: 'revision-d',
        } as unknown as AgentJobState,
      ],
    });

    expect(next.pipeline['job-d'].checkpoint?.blueprintReady).toBe(true);
    expect(next.pipeline['job-d'].checkpoint?.awaitingMediaChoice).toBe(true);
    expect(next.pipeline['job-d'].checkpoint?.previewRevision).toBe('revision-d');
  });

  it('does not claim awaitingMediaChoice from a job row that carries no token', () => {
    const next = panelReducer(initialPanelState(), {
      type: 'HYDRATE_JOBS',
      jobs: [
        {
          jobId: 'job-e',
          brandId: 'brand-1',
          status: 'completed',
          draftId: 'draft-e',
          toolCallId: 'tool-e',
          mediaStage: 'storyboard_ready',
        } as unknown as AgentJobState,
      ],
    });

    expect(next.pipeline['job-e'].checkpoint?.blueprintReady).toBe(true);
    expect(next.pipeline['job-e'].checkpoint?.previewRevision).toBeUndefined();
    expect(next.pipeline['job-e'].checkpoint?.awaitingMediaChoice).toBeUndefined();
  });

  // The durable row is stage-only, so hydrating after a restore must not erase the
  // token the persisted draft.blueprint_ready frame already delivered.
  it('preserves a token already merged onto the card when a stage-only row hydrates', () => {
    const restored = panelReducer(initialPanelState(), {
      type: 'PIPELINE_CARD',
      card: {
        jobId: 'job-f',
        brandId: 'brand-1',
        status: 'completed',
        draftId: 'draft-f',
        toolCallId: 'tool-f',
        checkpoint: {
          textReady: true,
          blueprintReady: true,
          mediaStatus: 'pending',
          awaitingMediaChoice: true,
          previewRevision: 'revision-f',
        },
      },
    });

    const next = panelReducer(restored, {
      type: 'HYDRATE_JOBS',
      jobs: [
        {
          jobId: 'job-f',
          brandId: 'brand-1',
          status: 'completed',
          draftId: 'draft-f',
          toolCallId: 'tool-f',
          mediaStage: 'storyboard_ready',
        } as unknown as AgentJobState,
      ],
    });

    expect(next.pipeline['job-f'].checkpoint?.previewRevision).toBe('revision-f');
    expect(next.pipeline['job-f'].checkpoint?.awaitingMediaChoice).toBe(true);
  });
});
