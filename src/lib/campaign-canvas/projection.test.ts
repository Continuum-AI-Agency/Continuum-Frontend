import { describe, expect, it } from 'bun:test';
import type { ChangeProjection, ProjectionFigures } from '@continuum/contracts';
import { liveChangeConfirmBarOf, liveChangeDecisionOf, liveChangeValueText } from './liveChange';
import {
  projectionBarsOf,
  projectionHeadlineOf,
  projectionRowsOf,
  projectionWindowText,
} from './projection';

const figures = (
  spend: number | null,
  results: number | null,
  share: number | null,
): ProjectionFigures => ({
  spend,
  results,
  costPerResult: spend !== null && results ? Math.round((spend / results) * 100) / 100 : null,
  value: null,
  roas: null,
  share,
});

const PROJECTION: ChangeProjection = {
  method: { id: 'observed_efficiency_capped_v1', label: 'Observed efficiency, capped', summary: 's' },
  platform: 'google',
  window: { since: '2026-10-18', until: '2026-10-31', days: 14, label: null },
  currency: 'MXN',
  resultLabel: 'Conversions',
  entities: [
    {
      id: 'g1',
      level: 'campaign',
      name: 'Search',
      platform: 'google',
      action: 'increase',
      changeLabel: '+50% daily spend',
      before: figures(1400, 70, 0.5),
      after: figures(2100, 98, 0.75),
      afterRange: { resultsLow: 91, resultsHigh: 105 },
      note: 'More than +30% spend: the extra beyond that is credited between nothing and the observed efficiency; the figure is the middle.',
    },
    {
      id: 'g2',
      level: 'campaign',
      name: 'PMax',
      platform: 'google',
      action: 'decrease',
      changeLabel: '-50% daily spend',
      before: figures(1400, 14, 0.5),
      after: figures(700, 7, 0.25),
      afterRange: null,
      note: null,
    },
    {
      id: 'g3',
      level: 'campaign',
      name: 'Tiny',
      platform: 'google',
      action: 'increase',
      changeLabel: '+50% daily spend',
      before: figures(140, 3, 0),
      after: figures(210, null, 0),
      afterRange: null,
      note: 'Only 3 results in the window (needs 10); the after is not projected.',
    },
  ],
  totals: {
    before: figures(2940, 87, 1),
    after: figures(3010, null, 1),
    afterRange: null,
  },
  assumptions: ['Window: 2026-10-18 to 2026-10-31 (14 days).'],
  gaps: [{ entity: '777', reason: 'Not in the data read for this window.' }],
  datasetId: 'ds_1',
  sourceDatasetIds: ['ds_0'],
};

describe('projectionRowsOf', () => {
  it('prints money with its currency, the range beside a ranged result, and a dash for unknown', () => {
    const [search, pmax, tiny] = projectionRowsOf(PROJECTION);
    expect(search?.spend).toEqual({ before: '$1,400 MXN', after: '$2,100 MXN' });
    expect(search?.results).toEqual({ before: '70', after: '98', range: '91 to 105' });
    expect(search?.share).toEqual({ before: '50%', after: '75%' });
    expect(pmax?.results.range).toBeNull();
    expect(tiny?.results.after).toBe('Not projected');
    expect(tiny?.cost.after).toBe('—');
    expect(tiny?.note).toContain('needs 10');
  });
});

describe('projectionBarsOf', () => {
  it('scales both sides to the largest value and drops what has no projected after', () => {
    const bars = projectionBarsOf(PROJECTION);
    expect(bars.map((bar) => bar.label)).toEqual(['Search', 'PMax']);
    expect(bars[0]).toMatchObject({ beforePct: 71.4, afterPct: 100 });
  });
});

describe('text', () => {
  it('names the window and states the totals honestly when one result is unknown', () => {
    expect(projectionWindowText(PROJECTION)).toBe('2026-10-18 to 2026-10-31 · 14 days');
    expect(projectionHeadlineOf(PROJECTION)).toContain('not projected');
  });
});

describe('proposal previews in the existing canvas helpers', () => {
  it('reads a proposal approval id as a proposal, not a pending decision', () => {
    expect(liveChangeDecisionOf([], 'proposal:abc')).toBe('proposal');
    expect(liveChangeDecisionOf([], 'appr_1')).toBe('pending');
  });

  it('prints a daily spend change as money and results as plain numbers', () => {
    expect(
      liveChangeValueText({ field: 'daily_spend', before: 10000, after: 15000 }, 'after', 'MXN'),
    ).toBe('$150 MXN');
    expect(liveChangeValueText({ field: 'results', before: 70, after: 98 }, 'after', 'MXN')).toBe(
      '98',
    );
  });
});

describe('liveChangeConfirmBarOf', () => {
  const base = { canDecide: true, canImplement: true };
  it('offers the approval card decision on a pending gated edit', () => {
    expect(liveChangeConfirmBarOf({ ...base, preview: {}, decision: 'pending' })).toEqual({ kind: 'confirm' });
  });
  it('offers nothing to confirm when the chat holds no approval to answer', () => {
    expect(liveChangeConfirmBarOf({ ...base, canDecide: false, preview: {}, decision: 'pending' })).toEqual({ kind: 'none' });
  });
  it('says a Google proposal cannot be implemented from here', () => {
    expect(
      liveChangeConfirmBarOf({ ...base, preview: { origin: 'proposal', platform: 'google' }, decision: 'proposal' }),
    ).toEqual({ kind: 'google_note' });
  });
  it('offers to implement a proposal, and nothing once decided', () => {
    expect(liveChangeConfirmBarOf({ ...base, preview: { origin: 'proposal' }, decision: 'proposal' })).toEqual({ kind: 'implement' });
    expect(liveChangeConfirmBarOf({ ...base, preview: {}, decision: 'approved' })).toEqual({ kind: 'none' });
    expect(liveChangeConfirmBarOf({ ...base, preview: {}, decision: 'denied' })).toEqual({ kind: 'none' });
  });
});
