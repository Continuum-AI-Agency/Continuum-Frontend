import { describe, expect, it } from 'bun:test';
import { ENTITY_PATH_SEPARATOR, type PaidRankedEntity } from '@continuum/contracts';

import { buildPaidLeaderboardRows, formatKpiValue } from './paid-leaderboard-rows';

function campaign(id: string, name: string, roas: number, spend: number): PaidRankedEntity {
  return {
    id,
    name,
    metrics: { spend, roas },
    rank: 1,
    kpi: 'roas',
    kpi_value: roas,
    kpi_unit: 'multiplier',
  };
}

function adset(id: string, name: string, campaignName: string, roas: number): PaidRankedEntity {
  return {
    id,
    name,
    labels: { campaign: campaignName },
    metrics: { roas },
    rank: 1,
    kpi: 'roas',
    kpi_value: roas,
    kpi_unit: 'multiplier',
  };
}

describe('formatKpiValue', () => {
  // PP-L3-home-paid-prints-dollar-signs-no-currency: money carries the account's code — `$`
  // only for USD, the ISO code after the figure otherwise, a bare figure when unknown. Never
  // a `$` the account did not earn.
  it('formats money in the account currency, never a bare dollar sign', () => {
    expect(formatKpiValue(2345.6, 'currency', 'MXN')).toBe('$2,346 MXN');
    expect(formatKpiValue(2345.6, 'currency', 'USD')).toBe('$2,346 USD');
    expect(formatKpiValue(0.7, 'currency', 'MXN')).toBe('$0.70 MXN');
    expect(formatKpiValue(2345.6, 'currency', null)).toBe('2,346');
  });

  it('formats a multiplier KPI', () => {
    expect(formatKpiValue(3.123, 'multiplier')).toBe('3.12x');
  });

  it('formats a percent KPI', () => {
    expect(formatKpiValue(1.671, 'percent')).toBe('1.7%');
  });
});

describe('buildPaidLeaderboardRows', () => {
  it('joins a campaign insight by campaign id and shows spend', () => {
    const rows = buildPaidLeaderboardRows({
      currency: 'MXN',
      scope: 'top_campaigns',
      entities: [campaign('c1', 'Summer Sale', 3.1, 1200)],
      insights: [{ campaignId: 'c1', campaignName: 'Summer Sale', title: 'ROAS climbing 18% WoW' }],
    });
    expect(rows[0]?.insightLine).toBe('ROAS climbing 18% WoW');
    expect(rows[0]?.metricValue).toBe('3.10x');
    expect(rows[0]?.subLabel).toBe('$1,200 MXN spend');
  });

  it('rolls up the parent campaign insight onto an ad set by campaign name', () => {
    const rows = buildPaidLeaderboardRows({
      currency: 'MXN',
      scope: 'top_adsets',
      entities: [adset('a1', 'Lookalike 1%', 'Summer Sale', 4.0)],
      insights: [{ campaignId: 'c1', campaignName: 'Summer Sale', title: 'ROAS climbing 18% WoW' }],
    });
    expect(rows[0]?.insightLine).toBe('ROAS climbing 18% WoW');
    expect(rows[0]?.subLabel).toBe('Summer Sale');
  });

  it('omits the insight line when no persisted insight matches', () => {
    const rows = buildPaidLeaderboardRows({
      currency: 'MXN',
      scope: 'top_campaigns',
      entities: [campaign('c2', 'Retargeting', 2.4, 300)],
      insights: [],
    });
    expect(rows[0]?.insightLine).toBeUndefined();
  });

  it('surfaces the aggregation level and the explicit path label', () => {
    const pathLabel = ['Spring Sale', 'LAL 1%', 'High Hook'].join(ENTITY_PATH_SEPARATOR);
    const rows = buildPaidLeaderboardRows({
      currency: 'MXN',
      scope: 'top_ads',
      entities: [
        {
          id: 'ad1',
          name: 'High Hook',
          level: 'ad',
          path_label: pathLabel,
          metrics: { roas: 5 },
          rank: 1,
          kpi: 'roas',
          kpi_value: 5,
          kpi_unit: 'multiplier',
        },
      ],
      insights: [],
    });
    expect(rows[0]?.level).toBe('ad');
    expect(rows[0]?.pathLabel).toBe(pathLabel);
  });

  it('composes the path label from the hierarchy when path_label is absent', () => {
    const expected = ['Spring Sale', 'LAL 1%', 'High Hook'].join(ENTITY_PATH_SEPARATOR);
    const rows = buildPaidLeaderboardRows({
      currency: 'MXN',
      scope: 'top_ads',
      entities: [
        {
          id: 'ad2',
          name: 'High Hook',
          level: 'ad',
          hierarchy: {
            campaign: { id: 'c1', name: 'Spring Sale' },
            adset: { id: 's1', name: 'LAL 1%' },
            ad: { id: 'ad2', name: 'High Hook' },
          },
          metrics: { roas: 5 },
          rank: 1,
          kpi: 'roas',
          kpi_value: 5,
          kpi_unit: 'multiplier',
        },
      ],
      insights: [],
    });
    expect(rows[0]?.pathLabel).toBe(expected);
  });
});
