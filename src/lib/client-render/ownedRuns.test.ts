import { beforeEach, describe, expect, it } from 'bun:test';
import type { ClientRenderJob } from '@continuum/contracts';
import {
  markRenderStartedHere,
  resetRendersStartedHere,
  shouldAutoRunClientRenderJob,
} from './ownedRuns';

// The orchestrator writes the run id to `sourceId`, so the fixture does too — an
// earlier fixture used a stand-in there and would have passed with the key wrong.
const RUN_ID = '2b0d1647-fce9-46db-a1ce-49b18973cd96';
const DRAFT_ID = '9f6a58aa-1a2b-4c3d-8e4f-5a6b7c8d9e0f';
const VIEWER_ID = '4f8b1f0e-2c5a-4f1e-9a7d-0c6b3e2a1d55';
const SOMEONE_ELSE = 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e';

const hyperframesJob = (overrides: Partial<ClientRenderJob> = {}): ClientRenderJob =>
  ({
    id: 'de3e6121-89d0-49ed-ade8-733e68773003',
    brandId: '1d1eac52-2955-42bd-81b5-a47808214ae2',
    kind: 'hyperframes_agent',
    state: 'ready',
    sourceId: RUN_ID,
    executionSpec: {
      kind: 'hyperframes_agent',
      runId: RUN_ID,
      canvasId: 'e08281d4-a740-497f-b4b2-260f32991379',
      nodeId: '7be36448-f467-471a-a85f-d92c8b0e9df9',
      origin: { label: 'HyperFrames Agent', viewHref: '/ai-studio' },
    },
    ...overrides,
  }) as ClientRenderJob;

const plannerReelJob = (overrides: Partial<ClientRenderJob> = {}): ClientRenderJob =>
  ({
    id: 'f25c7e84-cada-49ae-86b5-eebdfc77a499',
    brandId: '1d1eac52-2955-42bd-81b5-a47808214ae2',
    kind: 'planner_reel',
    state: 'ready',
    sourceId: DRAFT_ID,
    executionSpec: {
      kind: 'planner_reel',
      draftId: DRAFT_ID,
      durationSeconds: 12,
      origin: { label: 'Planner reel', viewHref: '/organic' },
    },
    ...overrides,
  }) as ClientRenderJob;

describe('shouldAutoRunClientRenderJob', () => {
  beforeEach(() => resetRendersStartedHere());

  it('leaves a job this tab never started for the inbox to consent to', () => {
    expect(shouldAutoRunClientRenderJob(hyperframesJob())).toBe(false);
  });

  it('renders a waiting job this tab started', () => {
    markRenderStartedHere(RUN_ID);
    expect(shouldAutoRunClientRenderJob(hyperframesJob())).toBe(true);
  });

  it('renders a planner reel this tab asked for, without a per-kind carve-out', () => {
    markRenderStartedHere(DRAFT_ID);
    expect(shouldAutoRunClientRenderJob(plannerReelJob())).toBe(true);
  });

  it('still leaves a planner reel some agent enqueued to the inbox', () => {
    markRenderStartedHere(RUN_ID);
    expect(shouldAutoRunClientRenderJob(plannerReelJob())).toBe(false);
  });

  it('never re-claims a job that is no longer waiting', () => {
    markRenderStartedHere(RUN_ID);
    for (const state of ['claimed', 'rendering', 'saving', 'completed', 'failed'] as const) {
      expect(shouldAutoRunClientRenderJob(hyperframesJob({ state }))).toBe(false);
    }
  });

  it('does not adopt another tab’s run of the same kind', () => {
    markRenderStartedHere('cc2d0386-d45e-4441-9182-165dc415e5d8');
    expect(shouldAutoRunClientRenderJob(hyperframesJob())).toBe(false);
  });

  // The in-memory set dies with the tab, which is how six jobs this person enqueued
  // became unrunnable after a reload. `createdBy` is the same consent, written down.
  it('renders a waiting job this viewer enqueued, after the tab that asked is gone', () => {
    expect(
      shouldAutoRunClientRenderJob(hyperframesJob({ createdBy: VIEWER_ID }), VIEWER_ID),
    ).toBe(true);
  });

  it('still leaves someone else’s job for the inbox to consent to', () => {
    expect(
      shouldAutoRunClientRenderJob(hyperframesJob({ createdBy: SOMEONE_ELSE }), VIEWER_ID),
    ).toBe(false);
  });

  it('never auto-runs on an unauthenticated read of the queue', () => {
    expect(shouldAutoRunClientRenderJob(hyperframesJob({ createdBy: null }), undefined)).toBe(
      false,
    );
    expect(shouldAutoRunClientRenderJob(hyperframesJob({ createdBy: null }), '')).toBe(false);
  });

  it('does not auto-run an enqueued job that has already left the queue', () => {
    expect(
      shouldAutoRunClientRenderJob(
        hyperframesJob({ createdBy: VIEWER_ID, state: 'claimed' }),
        VIEWER_ID,
      ),
    ).toBe(false);
  });
});
