import { describe, expect, it } from 'bun:test';

import { formatMetric, metricFigure } from './CampaignAdSetWorkspace';

// PP-L3-dashboard-and-home-have-no-data-figure-nodes (Dashboard half) and the Dashboard's
// share of PP-L3-home-paid-prints-dollar-signs-no-currency: the metric cards print money in
// the account's currency — never a `$` by default — and stamp raw, currency, window and unit
// on the node that prints the text, so the L3 bench can grade them against the payload.
describe('Dashboard metric cards', () => {
  it('prints money in the account currency, bare when unknown, never a default $', () => {
    expect(formatMetric('spend', 28780.16, 'MXN')).toBe('$28,780 MXN');
    expect(formatMetric('cpc', 0.7, 'USD')).toBe('$0.70 USD');
    expect(formatMetric('cpa', 41.3, null)).toBe('41.30');
    expect(formatMetric('impressions', 184230, 'MXN')).toBe('184,230');
  });

  it('stamps money and counts with the figure they print, in the window the cards read', () => {
    expect(metricFigure('dashboard.campaigns', 'spend', 28780.16, 'MXN', 7)).toEqual({
      'data-testid': 'figure',
      'data-figure': 'dashboard.campaigns.spend',
      'data-figure-raw': '28780.16',
      'data-figure-currency': 'MXN',
      'data-figure-window': 'd7',
      'data-figure-unit': 'currency',
    });
    expect(metricFigure('dashboard.adsets', 'clicks', 3370, 'MXN', 14)).toMatchObject({
      'data-figure': 'dashboard.adsets.clicks',
      'data-figure-raw': '3370',
      'data-figure-currency': 'none',
      'data-figure-window': 'd14',
      'data-figure-unit': 'count',
    });
  });

  it('leaves ROAS and CTR unstamped: they print to decimals the figure contract has no unit for', () => {
    expect(metricFigure('dashboard.campaigns', 'roas', 4.12, 'MXN', 7)).toEqual({});
    expect(metricFigure('dashboard.campaigns', 'ctr', 1.83, 'MXN', 7)).toEqual({});
  });

  it('declares no window for a span the contract does not name', () => {
    expect(metricFigure('dashboard.campaigns', 'spend', 10, 'MXN', 10)).toMatchObject({
      'data-figure-window': 'none',
    });
  });
});
