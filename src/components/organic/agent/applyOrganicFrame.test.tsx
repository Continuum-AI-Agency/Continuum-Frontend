// Card terminality: a chat card must NOT remain in-flight once its job's terminal
// frame arrives — on the live stream path and after a reload replay. Regression
// coverage for the production incident where every job completed while the chat
// cards kept spinning: job.* frames wrote only state.jobs, a slice no card renders.
// Frames are hand-authored but validated against the canonical contract union, so
// the tests exercise the same boundary the Backend emits against.

import { afterEach, describe, expect, it } from 'bun:test';
import { organicStreamFrameSchema } from '@continuum/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import type { OrganicSessionMessage } from '@/lib/organic/agent-sessions';
import { applyOrganicFrame } from './applyOrganicFrame';
import { ConceptCard } from './ConceptCard';
import { PipelineCard } from './PipelineCard';
import { restoreSessionFromMessages } from './restoreSession';
import type { PipelineCardState, PlanItem } from './types';
import {
  initialPanelState,
  type PanelAction,
  type PanelState,
  panelReducer,
} from './useOrganicAgentReducer';

const JOB_ID = 'job-terminality-1';
const BRAND_ID = 'brand-terminality-1';
const PLAN_ID = 'plan-terminality-1';
const PLAN_ITEM_ID = 'item-terminality-1';
const TOOL_CALL_ID = 'call-terminality-1';
const DRAFT_ID = 'draft-terminality-1';

function contractFrame(value: Record<string, unknown>): Record<string, unknown> {
  const parsed = organicStreamFrameSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`fixture frame is not contract-valid: ${String(value.type)}`);
  }
  return value;
}

const runningCardFrame = () =>
  contractFrame({
    type: 'ui.pipeline_card',
    data: {
      jobId: JOB_ID,
      brandId: BRAND_ID,
      planId: PLAN_ID,
      planItemId: PLAN_ITEM_ID,
      toolCallId: TOOL_CALL_ID,
      platform: 'instagram',
      status: 'running',
    },
  });

const executingPlanFrame = () =>
  contractFrame({
    type: 'ui.plan_status',
    data: { planId: PLAN_ID, itemId: PLAN_ITEM_ID, status: 'executing', jobId: JOB_ID },
  });

const completedJobFrame = () =>
  contractFrame({
    type: 'job.completed',
    data: { jobId: JOB_ID, brandId: BRAND_ID, draftId: DRAFT_ID, planItemId: PLAN_ITEM_ID },
  });

const failedJobFrame = () =>
  contractFrame({
    type: 'job.failed',
    data: {
      jobId: JOB_ID,
      brandId: BRAND_ID,
      planItemId: PLAN_ITEM_ID,
      error: { message: 'render exploded' },
    },
  });

function reduceFrames(frames: Record<string, unknown>[], initial?: PanelState): PanelState {
  let state = initial ?? initialPanelState();
  const dispatch = (action: PanelAction) => {
    state = panelReducer(state, action);
  };
  for (const frame of frames) applyOrganicFrame(frame, dispatch, 'chat', {});
  return state;
}

const concept: PlanItem = {
  itemId: PLAN_ITEM_ID,
  kind: 'create_post',
  platform: 'instagram',
  scheduledAt: '2026-08-24T10:00:00.000Z',
  format: null,
  trendId: null,
  trendTitle: null,
  angle: 'Terminality test angle',
  objective: 'save',
  audienceSegment: 'everyone',
  rationale: 'regression coverage',
  guidancePrompt: null,
  draftId: null,
};

const cardFor = (state: PanelState): PipelineCardState => {
  const card = state.pipeline[JOB_ID];
  if (!card) throw new Error('expected a pipeline card for the job');
  return card;
};

afterEach(() => cleanup());

describe('card terminality · live path', () => {
  it('job.completed settles the pipeline card, the plan item, and the job', () => {
    const state = reduceFrames([runningCardFrame(), executingPlanFrame(), completedJobFrame()]);
    expect(state.pipeline[JOB_ID]?.status).toBe('completed');
    expect(state.pipeline[JOB_ID]?.draftId).toBe(DRAFT_ID);
    expect(state.planItemStatus[PLAN_ITEM_ID]).toBe('completed');
    expect(state.jobs[JOB_ID]?.status).toBe('completed');
  });

  it('a rendered PipelineCard leaves the in-flight state after job.completed', () => {
    const running = reduceFrames([runningCardFrame(), executingPlanFrame()]);
    const { unmount } = render(
      <PipelineCard card={cardFor(running)} onEnrichDraft={() => {}} onGenerateMedia={() => {}} />,
    );
    expect(screen.getByText(/Enriching/)).toBeTruthy();
    unmount();

    const settled = reduceFrames([completedJobFrame()], running);
    render(
      <PipelineCard card={cardFor(settled)} onEnrichDraft={() => {}} onGenerateMedia={() => {}} />,
    );
    expect(screen.queryByText(/Enriching/)).toBeNull();
    expect(screen.getByText(/Copy ready/)).toBeTruthy();
  });

  it('job.failed is a visible failure, not silent progress', () => {
    const state = reduceFrames([runningCardFrame(), executingPlanFrame(), failedJobFrame()]);
    expect(state.pipeline[JOB_ID]?.status).toBe('failed');
    expect(state.planItemStatus[PLAN_ITEM_ID]).toBe('failed');
    expect(state.pipeline[JOB_ID]?.error?.message).toBeTruthy();

    render(
      <PipelineCard card={cardFor(state)} onEnrichDraft={() => {}} onGenerateMedia={() => {}} />,
    );
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('a rendered ConceptCard flips from in-flight to done on the terminal frame', () => {
    const running = reduceFrames([runningCardFrame(), executingPlanFrame()]);
    const { unmount } = render(
      <ConceptCard
        concept={concept}
        status={running.planItemStatus[PLAN_ITEM_ID] ?? 'executing'}
        pipeline={running.pipeline[JOB_ID]}
        onGenerate={() => {}}
      />,
    );
    expect(screen.getAllByText(/Working \(no stage data\)/).length).toBeGreaterThan(0);
    unmount();

    const settled = reduceFrames([completedJobFrame()], running);
    render(
      <ConceptCard
        concept={concept}
        status={settled.planItemStatus[PLAN_ITEM_ID] ?? 'executing'}
        pipeline={settled.pipeline[JOB_ID]}
        onGenerate={() => {}}
      />,
    );
    expect(screen.queryAllByText(/Working/)).toHaveLength(0);
    expect(screen.getAllByText(/Copy ready/).length).toBeGreaterThan(0);
  });
});

describe('card terminality · reload replay', () => {
  const persistedMessage = (frames: Record<string, unknown>[]): OrganicSessionMessage => ({
    id: 'msg-restored-1',
    sessionId: 'session-restored-1',
    role: 'assistant',
    content: 'Generated your posts.',
    uiCardFrames: frames,
    createdAt: '2026-08-23T08:00:00.000Z',
  });

  it('restoreSessionFromMessages surfaces persisted terminal job frames', () => {
    const restored = restoreSessionFromMessages([
      persistedMessage([runningCardFrame(), completedJobFrame()]),
    ]);
    expect(restored.pipelineCards).toHaveLength(1);
    expect(restored.jobUpdates).toHaveLength(1);
    expect(restored.jobUpdates[0]?.status).toBe('completed');
  });

  it('a replayed session does not leave the card running', () => {
    const restored = restoreSessionFromMessages([
      persistedMessage([runningCardFrame(), completedJobFrame()]),
    ]);
    let state = initialPanelState();
    for (const card of restored.pipelineCards) {
      state = panelReducer(state, { type: 'PIPELINE_CARD', card });
    }
    for (const job of restored.jobUpdates) {
      state = panelReducer(state, { type: 'JOB_UPDATE', job });
    }
    expect(state.pipeline[JOB_ID]?.status).toBe('completed');
    expect(state.planItemStatus[PLAN_ITEM_ID]).toBe('completed');

    render(
      <PipelineCard card={cardFor(state)} onEnrichDraft={() => {}} onGenerateMedia={() => {}} />,
    );
    expect(screen.queryByText(/Enriching/)).toBeNull();
  });
});

describe('failure and identity frames are heard', () => {
  it('tool.error lands on the tool call as a failed result', () => {
    let state = panelReducer(initialPanelState(), {
      type: 'SUBMIT_USER_MESSAGE',
      content: 'make posts',
      messageId: 'msg-user-1',
    });
    state = reduceFrames(
      [
        contractFrame({
          type: 'tool.call',
          data: { toolCallId: TOOL_CALL_ID, toolName: 'generatePosts', args: {} },
        }),
        contractFrame({
          type: 'tool.error',
          data: { toolCallId: TOOL_CALL_ID, toolName: 'generatePosts', error: 'boom' },
        }),
      ],
      state,
    );
    const assistant = state.messages.find((m) => m.id === state.streamingMessageId);
    const toolCall = assistant?.toolCalls?.find((tc) => tc.toolCallId === TOOL_CALL_ID);
    expect(toolCall).toBeTruthy();
    expect(toolCall?.ok).toBe(false);
    expect(toolCall?.reason).toBeTruthy();
  });

  it('tool.output_denied lands on the tool call as a denied result', () => {
    let state = panelReducer(initialPanelState(), {
      type: 'SUBMIT_USER_MESSAGE',
      content: 'make posts',
      messageId: 'msg-user-2',
    });
    state = reduceFrames(
      [
        contractFrame({
          type: 'tool.call',
          data: { toolCallId: TOOL_CALL_ID, toolName: 'generatePosts', args: {} },
        }),
        contractFrame({
          type: 'tool.output_denied',
          data: { toolCallId: TOOL_CALL_ID, toolName: 'generatePosts' },
        }),
      ],
      state,
    );
    const assistant = state.messages.find((m) => m.id === state.streamingMessageId);
    const toolCall = assistant?.toolCalls?.find((tc) => tc.toolCallId === TOOL_CALL_ID);
    expect(toolCall?.ok).toBe(false);
    expect(toolCall?.reason).toBe('Output denied');
  });

  it('ui.post_enqueued seeds the job with its identity', () => {
    const state = reduceFrames([
      contractFrame({
        type: 'ui.post_enqueued',
        data: {
          jobId: JOB_ID,
          platform: 'instagram',
          scheduledAt: '2026-08-24T10:00:00.000Z',
          trendId: null,
          draftId: DRAFT_ID,
          planItemId: PLAN_ITEM_ID,
        },
      }),
    ]);
    expect(state.jobs[JOB_ID]?.status).toBe('queued');
    expect(state.jobs[JOB_ID]?.draftId).toBe(DRAFT_ID);
    expect(state.jobs[JOB_ID]?.planItemId).toBe(PLAN_ITEM_ID);
  });

  it('STREAM_STALLED settles every in-flight card, job, and plan item', () => {
    const running = reduceFrames([runningCardFrame(), executingPlanFrame()]);
    const state = panelReducer(running, { type: 'STREAM_STALLED' });
    expect(state.pipeline[JOB_ID]?.status).toBe('failed');
    expect(state.pipeline[JOB_ID]?.error?.message).toContain('Timed out');
    expect(state.planItemStatus[PLAN_ITEM_ID]).toBe('failed');
    for (const job of Object.values(state.jobs)) {
      expect(['completed', 'failed', 'cancelled']).toContain(job.status);
    }
  });
});
