import { describe, expect, it } from 'bun:test';
import type { CompetitorSpyStreamFrame } from '@continuum/contracts';
import { INITIAL_SCAN_STATE, reduceScanFrame } from './scanReducer';

function reduceAll(frames: CompetitorSpyStreamFrame[]) {
  return frames.reduce(reduceScanFrame, INITIAL_SCAN_STATE);
}

describe('reduceScanFrame', () => {
  it('tracks stage lifecycle with counts', () => {
    const state = reduceAll([
      {
        type: 'scan_stage',
        data: { stage: 'ensure_competitors', status: 'started' },
      },
      {
        type: 'scan_stage',
        data: { stage: 'ensure_competitors', status: 'completed', counts: { competitors: 4 } },
      },
      { type: 'scan_stage', data: { stage: 'resolve_pages', status: 'skipped' } },
    ]);

    expect(state.stages.ensure_competitors).toEqual({
      status: 'completed',
      counts: { competitors: 4 },
    });
    expect(state.stages.resolve_pages).toEqual({ status: 'skipped' });
    expect(state.stages.sync).toBeUndefined();
  });

  it('upserts competitor rows by id across started, diff, and skipped frames', () => {
    const state = reduceAll([
      {
        type: 'competitor_started',
        data: { competitorId: 'c1', competitorName: 'Acme', index: 0, total: 2 },
      },
      {
        type: 'snapshot_diff',
        data: { competitorId: 'c1', fetched: 12, inserted: 3, updated: 2, lifecycleEvents: 1 },
      },
      {
        type: 'competitor_skipped',
        data: { competitorId: 'c2', competitorName: 'Globex', reason: 'missing_meta_page_id' },
      },
    ]);

    expect(state.competitors).toHaveLength(2);
    expect(state.competitors[0]).toMatchObject({
      competitorId: 'c1',
      competitorName: 'Acme',
      fetched: 12,
      inserted: 3,
      updated: 2,
      skippedReason: null,
    });
    expect(state.competitors[1]).toMatchObject({
      competitorId: 'c2',
      competitorName: 'Globex',
      skippedReason: 'missing_meta_page_id',
    });
  });

  it('keeps only the last 12 analyzed creatives', () => {
    const frames: CompetitorSpyStreamFrame[] = Array.from({ length: 15 }, (_, i) => ({
      type: 'creative_analyzed' as const,
      data: {
        snapshotId: `snap-${i}`,
        sourceAdId: `ad-${i}`,
        sentiment: null,
        hookArchetype: 'problem_solution',
        primaryTheme: null,
        analyzedFromImage: true,
      },
    }));

    const state = reduceAll(frames);
    expect(state.analyzedCreatives).toHaveLength(12);
    expect(state.analyzedCreatives[0]?.snapshotId).toBe('snap-3');
    expect(state.analyzedCreatives[11]?.snapshotId).toBe('snap-14');
  });

  it('captures the gap summary and records run errors without resetting progress', () => {
    const state = reduceAll([
      {
        type: 'scan_stage',
        data: { stage: 'gap', status: 'started' },
      },
      {
        type: 'gap_report_ready',
        data: { status: 'ready', gaps: 9, absent: 4, losing: 2, battlegrounds: 2, edges: 1 },
      },
      { type: 'run_error', data: { message: 'competitor sync failed', competitorId: 'c1' } },
    ]);

    expect(state.gapSummary).toMatchObject({ status: 'ready', gaps: 9, absent: 4 });
    expect(state.error).toBe('competitor sync failed');
    expect(state.stages.gap).toEqual({ status: 'started' });
  });

  it('ignores frames that carry no reducer state', () => {
    const state = reduceAll([
      {
        type: 'media_extracted',
        data: { snapshotId: 's1', status: 'stored' },
      },
      {
        type: 'awareness_block',
        data: { blockType: 'summary', block: {} },
      },
    ]);
    expect(state).toEqual(INITIAL_SCAN_STATE);
  });
});
