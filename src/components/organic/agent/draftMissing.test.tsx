// Bug #417: a post_generation job completed with a real draft, the user deleted the post
// from the calendar, the job's draft_id went NULL — and the chat kept saying "Draft ready"
// with a link to a row that no longer existed. These tests pin the missing-draft state
// through every layer the chat has: the reducer's three ingest paths, both cards, and the
// one Recreate action down to the endpoint it calls and the new draft it adopts.

import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { OrganicJobRetryResponse } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { requestOrganicJobRetry } from '@/lib/organic/agent-retry';
import { ConceptCard } from './ConceptCard';
import { resolvePlanItemStatus } from './conceptStatus';
import { PipelineCard } from './PipelineCard';
import { retryJobInPlace } from './retryJobInPlace';
import type { AgentJobState, PipelineCardState, PlanItem } from './types';
import { initialPanelState, type PanelState, panelReducer } from './useOrganicAgentReducer';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

const DEAD = '7f95aaaa-0000-4000-8000-000000000000';
const FRESH = '1c2dbbbb-0000-4000-8000-000000000000';

const completedJob = (overrides: Record<string, unknown> = {}) =>
  ({
    jobId: 'job-1',
    brandId: 'brand-1',
    status: 'completed',
    toolCallId: 'call-1',
    planId: 'plan-1',
    planItemId: 'item-1',
    draftId: DEAD,
    ...overrides,
  }) as AgentJobState;

const hydrated = (job = completedJob()): PanelState =>
  panelReducer(initialPanelState(), { type: 'HYDRATE_JOBS', jobs: [job] });

afterEach(() => cleanup());

describe('reducer — a missing draft is its own state', () => {
  it('hydration carries draftMissing and drops the dead id from the card', () => {
    const state = hydrated(completedJob({ draftMissing: true, draftId: null }));
    expect(state.pipeline['job-1'].draftMissing).toBe(true);
    expect(state.pipeline['job-1'].draftId).toBeNull();
    expect(state.jobs['job-1'].draftMissing).toBe(true);
  });

  it('a generation summary turns a "Draft ready" card into a missing one', () => {
    const before = hydrated();
    expect(before.pipeline['job-1'].draftId).toBe(DEAD);
    const state = panelReducer(before, {
      type: 'SYNC_GENERATION_SUMMARIES',
      summaries: [{ jobId: 'job-1', brandId: 'brand-1', status: 'completed', draftMissing: true }],
    });
    expect(state.pipeline['job-1']).toMatchObject({ draftMissing: true, draftId: null });
    expect(state.jobs['job-1'].draftId).toBeUndefined();
    expect(state.jobs['job-1'].draftMissing).toBe(true);
  });

  it('a live job.completed frame with draftMissing clears the id the earlier frame set', () => {
    const state = panelReducer(hydrated(), {
      type: 'JOB_UPDATE',
      job: { jobId: 'job-1', status: 'completed', draftMissing: true },
    });
    expect(state.jobs['job-1'].draftId).toBeUndefined();
    expect(state.pipeline['job-1'].draftMissing).toBe(true);
  });

  it('a plan-item job with no tool call still gets a card, so the plan row can learn it', () => {
    const state = hydrated(completedJob({ toolCallId: undefined, draftMissing: true }));
    expect(state.pipeline['job-1']?.planItemId).toBe('item-1');
    expect(state.pipeline['job-1']?.draftMissing).toBe(true);
  });

  it('the plan row resolves to draft_missing, outranking "completed"', () => {
    const state = hydrated(completedJob({ draftMissing: true, draftId: null }));
    const status = resolvePlanItemStatus({
      itemStatus: 'completed',
      pipeline: state.pipeline['job-1'],
    });
    expect(status.kind).toBe('draft_missing');
    expect(status.label).toBe('This post wasn’t saved');
    expect(status.tone).toBe('failed');
  });

  it('JOB_RETRY resets the settled card to a fresh run and adopts the new draft', () => {
    const missing = hydrated(completedJob({ draftMissing: true, draftId: null }));
    const optimistic = panelReducer(missing, { type: 'JOB_RETRY', jobId: 'job-1' });
    expect(optimistic.pipeline['job-1']).toMatchObject({
      status: 'running',
      draftMissing: false,
      draftId: null,
    });
    expect(optimistic.jobs['job-1'].status).toBe('queued');
    expect(optimistic.planItemStatus['item-1']).toBe('executing');

    const adopted = panelReducer(optimistic, { type: 'JOB_RETRY', jobId: 'job-1', draftId: FRESH });
    expect(adopted.pipeline['job-1'].draftId).toBe(FRESH);
    expect(adopted.jobs['job-1'].draftId).toBe(FRESH);
  });

  it('a retried FAILED job keeps its draft when the server answers without one', () => {
    const failed = hydrated(completedJob({ status: 'failed', error: { message: 'boom' } }));
    const state = panelReducer(failed, { type: 'JOB_RETRY', jobId: 'job-1' });
    expect(state.pipeline['job-1'].draftId).toBe(DEAD);
    expect(state.pipeline['job-1'].error).toBeUndefined();
  });
});

const missingCard = (): PipelineCardState =>
  hydrated(completedJob({ draftMissing: true, draftId: null })).pipeline['job-1'];

const concept = {
  itemId: 'item-1',
  kind: 'create_post',
  platform: 'instagram',
  scheduledAt: '2026-08-25T14:00:00.000Z',
  format: 'post',
  trendId: null,
  trendTitle: null,
  angle: 'Myth-bust the hot-wash habit',
  objective: 'save',
  audienceSegment: 'Lapsed buyers',
  rationale: 'Because.',
  guidancePrompt: null,
  // The plan snapshot still carries the dead id: the row must NOT fall back to it.
  draftId: DEAD,
  creativeBrief: null,
} as unknown as PlanItem;

function expectGhostState() {
  expect(screen.getAllByText('This post wasn’t saved').length).toBeGreaterThan(0);
  expect(screen.getByText(/Its draft no longer exists/)).toBeTruthy();
  expect(screen.queryByText('Draft ready')).toBeNull();
  expect(screen.queryByText('View post')).toBeNull();
  expect(screen.queryByText('Open in Calendar')).toBeNull();
  expect(screen.queryByText('Open in AI Studio')).toBeNull();
  expect(screen.queryByRole('button', { name: /Enrich|Generate media/ })).toBeNull();
  // The dead id is not shown as if it were the post's draft.
  expect(screen.queryByText(/Draft 7f95/)).toBeNull();
}

describe('cards — a ghost draft offers Recreate, never "Draft ready"', () => {
  it('the plan row', () => {
    const onRetryJob = mock((_jobId: string) => {});
    const onOpenDraft = mock((_draftId: string | null) => {});
    render(
      <ConceptCard
        concept={concept}
        status="completed"
        pipeline={missingCard()}
        onGenerate={() => {}}
        onRetryJob={onRetryJob}
        onOpenDraft={onOpenDraft}
        onEnrichDraft={() => {}}
        onGenerateMedia={() => {}}
      />,
    );
    expectGhostState();
    fireEvent.click(screen.getByRole('button', { name: 'Recreate draft' }));
    expect(onRetryJob).toHaveBeenCalledWith('job-1');
    fireEvent.click(screen.getByRole('button', { name: 'Open Calendar' }));
    expect(onOpenDraft).toHaveBeenCalledWith(null);
  });

  it('the inline pipeline card', () => {
    const onRetryJob = mock((_jobId: string) => {});
    const onOpenDraft = mock((_draftId: string | null) => {});
    render(
      <PipelineCard
        card={missingCard()}
        onRetryJob={onRetryJob}
        onOpenDraft={onOpenDraft}
        onEnrichDraft={() => {}}
        onGenerateMedia={() => {}}
      />,
    );
    expectGhostState();
    fireEvent.click(screen.getByRole('button', { name: 'Recreate draft' }));
    expect(onRetryJob).toHaveBeenCalledWith('job-1');
    fireEvent.click(screen.getByRole('button', { name: 'Open Calendar' }));
    expect(onOpenDraft).toHaveBeenCalledWith(null);
  });

  it('a live draft shows its short id, full id in the title, and Open in Calendar', () => {
    const onOpenDraft = mock((_draftId: string | null) => {});
    render(<PipelineCard card={hydrated().pipeline['job-1']} onOpenDraft={onOpenDraft} />);
    const tag = screen.getByText('Draft 7f95…');
    expect(tag.getAttribute('title')).toBe(DEAD);
    fireEvent.click(screen.getByRole('button', { name: 'Open in Calendar' }));
    expect(onOpenDraft).toHaveBeenCalledWith(DEAD);
  });
});

describe('Recreate draft — the endpoint it calls and the draft it adopts', () => {
  it('POSTs the job retry with the brand, then the card carries the NEW draft id', async () => {
    const calls: Array<{ path: string; method?: string; body?: unknown }> = [];
    const response: OrganicJobRetryResponse = {
      job: { jobId: 'job-1', status: 'queued', draftId: FRESH, error: null },
    };
    const request = mock(async (options: { path: string; method?: string; body?: unknown }) => {
      calls.push(options);
      return response;
    });
    let state = hydrated(completedJob({ draftMissing: true, draftId: null }));
    const ok = await retryJobInPlace({
      jobId: 'job-1',
      brandId: 'brand-1',
      state,
      dispatch: (action) => {
        state = panelReducer(state, action);
      },
      notifyFailure: () => {
        throw new Error('must not fail');
      },
      request: (job) => requestOrganicJobRetry(job, request as never),
    });

    expect(ok).toBe(true);
    expect(calls).toEqual([
      expect.objectContaining({
        path: '/api/organic/agent/jobs/job-1/retry',
        method: 'POST',
        body: { brandId: 'brand-1' },
      }),
    ]);
    expect(state.pipeline['job-1']).toMatchObject({
      status: 'running',
      draftId: FRESH,
      draftMissing: false,
    });
    expect(state.jobs['job-1']).toMatchObject({ status: 'queued', draftId: FRESH });
  });

  it('a refused recreate puts the missing state back and says why', async () => {
    let state = hydrated(completedJob({ draftMissing: true, draftId: null }));
    const notifyFailure = mock((_message: string) => {});
    const ok = await retryJobInPlace({
      jobId: 'job-1',
      brandId: 'brand-1',
      state,
      dispatch: (action) => {
        state = panelReducer(state, action);
      },
      notifyFailure,
      request: async () => {
        throw new Error('Job is still running');
      },
    });
    expect(ok).toBe(false);
    expect(notifyFailure).toHaveBeenCalledWith('Job is still running');
    expect(state.pipeline['job-1']).toMatchObject({ status: 'completed', draftMissing: true });
  });
});
