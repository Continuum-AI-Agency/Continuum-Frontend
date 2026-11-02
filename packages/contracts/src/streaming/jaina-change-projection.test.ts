import { describe, expect, it } from 'bun:test';
import {
  CHANGE_PROJECTION_METHOD_ID,
  changeProjectionPartId,
  changeProjectionSchema,
} from './jaina-change-projection';
import { liveChangePreviewPayloadSchema } from './jaina-live-change';

const figures = (spend: number | null, results: number | null) => ({
  spend,
  results,
  costPerResult: spend !== null && results ? spend / results : null,
  value: null,
  roas: null,
  share: null,
});

const projection = {
  method: { id: CHANGE_PROJECTION_METHOD_ID, label: 'Observed efficiency', summary: 'rule' },
  platform: 'meta' as const,
  window: { since: '2026-10-18', until: '2026-10-31', days: 14, label: null },
  currency: 'MXN',
  resultLabel: 'Leads',
  entities: [
    {
      id: '1',
      level: 'campaign' as const,
      name: 'Tours',
      platform: 'meta' as const,
      action: 'increase' as const,
      changeLabel: '+20% daily spend',
      before: figures(1000, 50),
      after: figures(1200, 60),
      afterRange: { resultsLow: 58, resultsHigh: 60 },
      note: null,
    },
  ],
  totals: { before: figures(1000, 50), after: figures(1200, 60), afterRange: null },
  assumptions: ['The same 14 days, run at the new daily spend.'],
  gaps: [],
  datasetId: 'ds_1',
  sourceDatasetIds: ['ds_0'],
};

describe('changeProjectionSchema', () => {
  it('accepts a projection and keeps a field a newer Backend adds', () => {
    const parsed = changeProjectionSchema.parse({ ...projection, futureField: 1 });
    expect(parsed.entities[0]?.afterRange?.resultsLow).toBe(58);
    expect((parsed as Record<string, unknown>).futureField).toBe(1);
  });

  it('refuses a projection with no assumptions or no entities', () => {
    expect(changeProjectionSchema.safeParse({ ...projection, assumptions: [] }).success).toBe(
      false,
    );
    expect(changeProjectionSchema.safeParse({ ...projection, entities: [] }).success).toBe(false);
  });

  it('keeps an unknown result as null instead of coercing it to zero', () => {
    const parsed = changeProjectionSchema.parse({
      ...projection,
      entities: [{ ...projection.entities[0], after: figures(1200, null), afterRange: null }],
    });
    expect(parsed.entities[0]?.after.results).toBeNull();
  });

  it('names one part per proposal', () => {
    expect(changeProjectionPartId('p1')).toBe('change-projection:p1');
  });
});

describe('live change preview carrying a projection', () => {
  const base = {
    approvalId: 'proposal:p1',
    toolCallId: 'call_1',
    toolName: 'project_change_outcome',
    partId: changeProjectionPartId('p1'),
    subject: 'Move budget',
    currency: 'MXN',
    nodes: [],
    truncated: false,
    counts: { changed: 1, added: 0, paused: 0 },
    readAt: '2026-11-01T00:00:00.000Z',
  };

  it('still parses a payload from before the projection fields existed', () => {
    const parsed = liveChangePreviewPayloadSchema.parse(base);
    expect(parsed.projection).toBeUndefined();
    expect(parsed.origin).toBeUndefined();
  });

  it('parses a proposal-origin Google payload with its projection', () => {
    const parsed = liveChangePreviewPayloadSchema.parse({
      ...base,
      origin: 'proposal',
      platform: 'google',
      projection: { ...projection, platform: 'google' },
    });
    expect(parsed.projection?.platform).toBe('google');
    expect(parsed.origin).toBe('proposal');
  });
});
