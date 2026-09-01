import { beforeEach, describe, expect, it } from 'bun:test';
import type { ClientRenderJob } from '@continuum/contracts';
import {
  markRenderStartedHere,
  resetRendersStartedHere,
  shouldAutoRunClientRenderJob,
} from './ownedRuns';

const RUN_ID = '2b0d1647-fce9-46db-a1ce-49b18973cd96';

const job = (overrides: Partial<ClientRenderJob> = {}): ClientRenderJob =>
  ({
    id: 'de3e6121-89d0-49ed-ade8-733e68773003',
    brandId: '1d1eac52-2955-42bd-81b5-a47808214ae2',
    kind: 'hyperframes_agent',
    state: 'ready',
    sourceId: 'canvas-1',
    executionSpec: {
      kind: 'hyperframes_agent',
      runId: RUN_ID,
      canvasId: 'e08281d4-a740-497f-b4b2-260f32991379',
      nodeId: '7be36448-f467-471a-a85f-d92c8b0e9df9',
      origin: { label: 'HyperFrames Agent', viewHref: '/ai-studio' },
    },
    ...overrides,
  }) as ClientRenderJob;

describe('shouldAutoRunClientRenderJob', () => {
  beforeEach(() => resetRendersStartedHere());

  it('leaves a job this tab never started for the inbox to consent to', () => {
    expect(shouldAutoRunClientRenderJob(job())).toBe(false);
  });

  it('renders a waiting job this tab started', () => {
    markRenderStartedHere(RUN_ID);
    expect(shouldAutoRunClientRenderJob(job())).toBe(true);
  });

  it('never re-claims a job that is no longer waiting', () => {
    markRenderStartedHere(RUN_ID);
    for (const state of ['claimed', 'rendering', 'saving', 'completed', 'failed'] as const) {
      expect(shouldAutoRunClientRenderJob(job({ state }))).toBe(false);
    }
  });

  it('does not adopt another tab’s run of the same kind', () => {
    markRenderStartedHere('cc2d0386-d45e-4441-9182-165dc415e5d8');
    expect(shouldAutoRunClientRenderJob(job())).toBe(false);
  });
});
