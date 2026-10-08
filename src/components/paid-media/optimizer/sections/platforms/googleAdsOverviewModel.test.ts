import { describe, expect, it } from 'bun:test';
import {
  buildGoogleOverview,
  campaignTypeOf,
  completeDaysWindow,
  figureWindowOf,
  type GoogleAccountOverview,
  type GoogleTopCampaigns,
  googleCurrencyOf,
  percentAgainst,
  windowRangeLabel,
} from './googleAdsOverviewModel';

const range = { since: '2026-09-24', until: '2026-09-30' };

function account(spend: number, previous?: number): GoogleAccountOverview {
  return {
    metrics: { spend, impressions: 1000, clicks: 50, ctr: 5, cpa: 0 },
    comparison:
      previous == null
        ? undefined
        : { spend: { current: spend, previous, percentageChange: null } },
    range,
  };
}

function row(id: string, spend: number, conversions: number, channelType?: string) {
  return {
    id,
    name: `Campaign ${id}`,
    labels: channelType ? { channel_type: channelType } : undefined,
    metrics: { spend, impressions: 100, clicks: 10, conversions },
  };
}

const campaigns = (rows: ReturnType<typeof row>[]): GoogleTopCampaigns => ({ rows, range });

describe('campaignTypeOf', () => {
  it('groups by the type a Google buyer decides in', () => {
    expect(campaignTypeOf('SEARCH')).toBe('search');
    expect(campaignTypeOf('PERFORMANCE_MAX')).toBe('pmax');
    expect(campaignTypeOf('VIDEO')).toBe('video');
    expect(campaignTypeOf('DEMAND_GEN')).toBe('video');
    expect(campaignTypeOf('DISPLAY')).toBe('display');
    expect(campaignTypeOf('SMART')).toBe('other');
    expect(campaignTypeOf(undefined)).toBeNull();
  });
});

describe('buildGoogleOverview', () => {
  it('groups spending campaigns by type, largest spend first, with their share', () => {
    const overview = buildGoogleOverview(
      account(1000, 800),
      campaigns([
        row('1', 300, 10, 'SEARCH'),
        row('2', 600, 12, 'PERFORMANCE_MAX'),
        row('3', 100, 0, 'SEARCH'),
        row('4', 0, 0, 'VIDEO'),
      ]),
    );
    expect(overview.byType).toBe(true);
    expect(overview.groups.map((g) => [g.label, g.campaigns, g.spend, g.sharePct])).toEqual([
      ['Performance Max', 1, 600, 60],
      ['Search', 2, 400, 40],
    ]);
    expect(overview.conversions).toBe(22);
    expect(overview.costPerConversion).toBeCloseTo(1000 / 22);
    expect(overview.priorSpend).toBe(800);
    expect(overview.days).toBe(7);
  });

  it('falls back to one entity per campaign rather than guess a type from a name', () => {
    const overview = buildGoogleOverview(
      account(500),
      campaigns([row('1', 300, 3, 'SEARCH'), row('2', 200, 1)]),
    );
    expect(overview.byType).toBe(false);
    expect(overview.groups.map((g) => g.label)).toEqual(['Campaign 1', 'Campaign 2']);
  });

  it('has nothing to compare when the prior window came back empty', () => {
    expect(buildGoogleOverview(account(500, 0), campaigns([])).priorSpend).toBeNull();
    expect(buildGoogleOverview(account(500), campaigns([])).priorSpend).toBeNull();
  });

  it('reports no cost per conversion when nothing converted', () => {
    const overview = buildGoogleOverview(account(500), campaigns([row('1', 500, 0, 'SEARCH')]));
    expect(overview.costPerConversion).toBeNull();
  });
});

describe('the small words', () => {
  it('compares against a base, and refuses a zero or missing one', () => {
    expect(percentAgainst(120, 100)).toBe(20);
    expect(percentAgainst(80, 100)).toBe(-20);
    expect(percentAgainst(80, 0)).toBeNull();
    expect(percentAgainst(null, 100)).toBeNull();
  });

  it("names the read's window and its provenance", () => {
    expect(windowRangeLabel('2026-09-01', '2026-09-30')).toBe('Sep 1 – Sep 30');
    expect(figureWindowOf(8)).toBe('d7');
    expect(figureWindowOf(30)).toBe('d30');
    expect(figureWindowOf(3)).toBe('none');
  });
});

describe('completeDaysWindow — the window the producer reads', () => {
  it('is the 7 complete UTC days ending yesterday, never today', () => {
    expect(completeDaysWindow(7, new Date('2026-10-07T21:24:39Z'))).toEqual({
      since: '2026-09-30',
      until: '2026-10-06',
    });
  });

  it('turns over at UTC midnight, not at local midnight', () => {
    expect(completeDaysWindow(7, new Date('2026-10-08T00:30:00Z'))).toEqual({
      since: '2026-10-01',
      until: '2026-10-07',
    });
  });
});

describe('googleCurrencyOf — the code the read carries', () => {
  it("takes the edge's own currency code, upper-cased", () => {
    expect(googleCurrencyOf({ currency: 'mxn' })).toBe('MXN');
    expect(googleCurrencyOf({ currency_code: 'MXN' })).toBe('MXN');
  });

  it('is null when the read carries no code, never a guess', () => {
    expect(googleCurrencyOf({})).toBeNull();
    expect(googleCurrencyOf({ currency: '' })).toBeNull();
    expect(googleCurrencyOf(null)).toBeNull();
  });

  it('lands on the overview the reads fold into', () => {
    const overview = buildGoogleOverview(
      { ...account(100), currency: 'MXN' },
      campaigns([row('1', 100, 1, 'SEARCH')]),
    );
    expect(overview.currency).toBe('MXN');
    expect(buildGoogleOverview(account(100), campaigns([])).currency).toBeNull();
  });
});
