import { describe, expect, it } from 'bun:test';

import { parseOrganicStreamEvent } from './streamEventParser';
import { initialPanelState, panelReducer } from './useOrganicAgentReducer';

describe('draft.blueprint_ready parsing', () => {
  it('parses into a draftBlueprint with signed preview URLs, dropping base64', () => {
    const parsed = parseOrganicStreamEvent({
      type: 'draft.blueprint_ready',
      data: {
        jobId: 'expand-B',
        brandId: 'brand-1',
        draftId: 'draft-1',
        previews: [
          { role: 'primary', signedUrl: 'https://signed/a.png', format: 'post' },
          { role: 'slide_2', signedUrl: 'data:image/png;base64,AAAA' },
        ],
      },
    });
    expect(parsed.kind).toBe('draftBlueprint');
    if (parsed.kind === 'draftBlueprint') {
      expect(parsed.draftId).toBe('draft-1');
      expect(parsed.previews).toEqual(['https://signed/a.png']);
    }
  });
});

describe('DRAFT_BLUEPRINT reducer', () => {
  it("attaches the storyboard to the matching draft's pipeline card and job (by draftId)", () => {
    // The post-generation card/job is keyed by jobId "A"; the blueprint frame
    // arrives from a different job but carries the same draftId.
    let state = panelReducer(initialPanelState(), {
      type: 'JOB_UPDATE',
      job: { jobId: 'A', brandId: 'brand-1', status: 'completed', draftId: 'draft-1' },
    });
    state = panelReducer(state, {
      type: 'PIPELINE_CARD',
      card: { jobId: 'A', draftId: 'draft-1', status: 'completed' },
    });

    const next = panelReducer(state, {
      type: 'DRAFT_BLUEPRINT',
      draftId: 'draft-1',
      previews: ['https://signed/a.png', 'https://signed/b.png'],
    });

    expect(next.pipeline['A'].preview?.images).toEqual([
      'https://signed/a.png',
      'https://signed/b.png',
    ]);
    expect(next.pipeline['A'].checkpoint?.blueprintReady).toBe(true);
    expect(next.jobs['A'].previewImages).toEqual(['https://signed/a.png', 'https://signed/b.png']);
  });

  it('is a no-op when no card/job matches the draftId', () => {
    const state = panelReducer(initialPanelState(), {
      type: 'PIPELINE_CARD',
      card: { jobId: 'A', draftId: 'other', status: 'running' },
    });
    const next = panelReducer(state, {
      type: 'DRAFT_BLUEPRINT',
      draftId: 'draft-1',
      previews: ['https://signed/a.png'],
    });
    expect(next).toBe(state);
  });
});
