import { describe, expect, it } from 'bun:test';
import type { ChangeProjection } from '@continuum/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectionPanel } from './ProjectionPanel';

const figures = (spend: number, results: number | null, share: number) => ({
  spend,
  results,
  costPerResult: results ? Math.round((spend / results) * 100) / 100 : null,
  value: null,
  roas: null,
  share,
});

const PROJECTION: ChangeProjection = {
  method: { id: 'observed_efficiency_capped_v1', label: 'Observed efficiency, capped', summary: 'Spend moves, results follow observed efficiency.' },
  platform: 'meta',
  window: { since: '2026-10-18', until: '2026-10-31', days: 14, label: null },
  currency: 'MXN',
  resultLabel: 'Leads',
  entities: [
    {
      id: '100',
      level: 'campaign',
      name: 'Tours',
      platform: 'meta',
      action: 'increase',
      changeLabel: '+50% daily spend',
      before: figures(1400, 70, 0.5),
      after: figures(2100, 98, 0.75),
      afterRange: { resultsLow: 91, resultsHigh: 105 },
      note: null,
    },
    {
      id: '200',
      level: 'campaign',
      name: 'Poliwin',
      platform: 'meta',
      action: 'decrease',
      changeLabel: '-50% daily spend',
      before: figures(1400, 14, 0.5),
      after: figures(700, 7, 0.25),
      afterRange: null,
      note: null,
    },
  ],
  totals: { before: figures(2800, 84, 1), after: figures(2800, 105, 1), afterRange: { resultsLow: 98, resultsHigh: 112 } },
  assumptions: ['Window: 2026-10-18 to 2026-10-31 (14 days).'],
  gaps: [{ entity: '777', reason: 'Not in the data read for this window.' }],
  datasetId: 'ds_1',
  sourceDatasetIds: ['ds_0'],
};

describe('ProjectionPanel', () => {
  const html = renderToStaticMarkup(<ProjectionPanel projection={PROJECTION} />);

  it('labels itself a projection and names the window and the totals', () => {
    expect(html).toContain('projection');
    expect(html).toContain('2026-10-18 to 2026-10-31 · 14 days');
    expect(html).toContain('Projected leads: 84 now, 105 (98 to 112) after.');
  });

  it('draws one row per entity with money in its currency and the range beside the result', () => {
    expect(html.match(/data-testid="projection-row"/g)).toHaveLength(2);
    expect(html).toContain('$2,100 MXN');
    expect(html).toContain('range 91 to 105');
    expect(html).toContain('+50% daily spend');
  });

  it('draws before/after bars, the gaps and the assumptions', () => {
    expect(html).toContain('data-testid="projection-bars"');
    expect(html).toContain('Not in the data read for this window.');
    expect(html).toContain('Window: 2026-10-18 to 2026-10-31 (14 days).');
  });

  it('uses no bare text-primary (it renders black)', () => {
    expect(html).not.toMatch(/class="[^"]*\btext-primary\b(?!-)/);
  });
});
