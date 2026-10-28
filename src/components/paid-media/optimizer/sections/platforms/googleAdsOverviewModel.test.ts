import { describe, expect, it } from 'bun:test';
import {
  ambiguousAccountOverview,
  ambiguousTopCampaigns,
  ambiguousTopCampaignsByResult,
} from './__fixtures__/googleAmbiguousResultBasis';
import {
  buildGoogleOverview,
  campaignTypeOf,
  completeDaysWindow,
  costPerConversion,
  figureWindowOf,
  formatConversions,
  type GoogleAccountOverview,
  GoogleAccountOverviewSchema,
  type GoogleTopCampaigns,
  GoogleTopCampaignsSchema,
  googleCurrencyOf,
  ownResultsLabel,
  percentAgainst,
  resultCountLabel,
  resultsApartLabel,
  resultTypesOf,
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

  it('prints conversions as the whole count their figure node declares', () => {
    expect(formatConversions(38.0651)).toBe('38');
    expect(formatConversions(1869.5)).toBe('1,870');
    expect(formatConversions(0)).toBe('0');
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

describe('an account with no single business result — what the edge sends', () => {
  const parsedAccount = GoogleAccountOverviewSchema.safeParse(ambiguousAccountOverview);
  const ranked = GoogleTopCampaignsSchema.safeParse(ambiguousTopCampaigns);

  it('parses the null CPA and null conversions instead of refusing the read', () => {
    expect(parsedAccount.success).toBe(true);
    expect(ranked.success).toBe(true);
    expect(parsedAccount.data?.metrics.cpa).toBeNull();
    expect(parsedAccount.data?.result_basis).toEqual({
      rule: 'google_conversion_rule_v1',
      bucket: null,
      unambiguous: false,
    });
    expect(ranked.data?.rows.every((row) => row.metrics.conversions === null)).toBe(true);
  });

  it('keeps spend and the split by type, and reports conversions as unknown, never zero', () => {
    if (!parsedAccount.success || !ranked.success) throw new Error('fixture did not parse');
    const overview = buildGoogleOverview(parsedAccount.data, ranked.data);
    expect(overview.resultsDefined).toBe(false);
    expect(overview.spend).toBe(55205.2636);
    expect(overview.conversions).toBeNull();
    expect(overview.costPerConversion).toBeNull();
    expect(overview.byType).toBe(true);
    expect(overview.groups.map((g) => [g.label, g.conversions, g.sharePct])).toEqual([
      ['Search', null, 81],
      ['Display', null, 19],
    ]);
    expect(overview.groups.map(costPerConversion)).toEqual([null, null]);
  });

  it('still refuses a CPA that is neither a number nor null', () => {
    expect(
      GoogleAccountOverviewSchema.safeParse({
        ...ambiguousAccountOverview,
        metrics: { ...ambiguousAccountOverview.metrics, cpa: 'n/a' },
      }).success,
    ).toBe(false);
  });

  it('counts the single result when the basis names one', () => {
    const overview = buildGoogleOverview(
      { ...account(500), result_basis: { rule: 'r', bucket: 'leads', unambiguous: true } },
      campaigns([row('1', 500, 5, 'SEARCH')]),
    );
    expect(overview.resultsDefined).toBe(true);
    expect(overview.conversions).toBe(5);
    expect(overview.costPerConversion).toBe(100);
  });
});

// Ramiro, 2026-10-28: with no portfolio goal, each result type gets its own column and cost.
describe('no single result: each result type counted apart', () => {
  const read = (campaignsRead: unknown) =>
    buildGoogleOverview(
      GoogleAccountOverviewSchema.parse(ambiguousAccountOverview),
      GoogleTopCampaignsSchema.parse(campaignsRead),
    );

  it('sums each result type per campaign type and names the types any campaign counted', () => {
    const overview = read(ambiguousTopCampaignsByResult);
    expect(overview.conversions).toBeNull();
    expect(overview.resultTypes).toEqual(['leads', 'signups']);
    expect(overview.byResult).toEqual({ leads: 122, purchases: 0, signups: 2 });
    expect(
      overview.groups.map((group) => [group.label, group.conversions, group.byResult]),
    ).toEqual([
      ['Search', null, { leads: 34, purchases: 0, signups: 2 }],
      ['Display', null, { leads: 88, purchases: 0, signups: 0 }],
    ]);
  });

  it('a read cached before the edge counted them apart names no type, and says so', () => {
    const overview = read(ambiguousTopCampaigns);
    expect(overview.resultTypes).toEqual([]);
    expect(overview.byResult).toBeNull();
  });

  it('one result counted: nothing is split apart', () => {
    const overview = buildGoogleOverview(
      { ...account(500), result_basis: { rule: 'r', bucket: 'leads', unambiguous: true } },
      campaigns([row('1', 500, 5, 'SEARCH')]),
    );
    expect(overview.resultTypes).toEqual([]);
  });

  it('labels a count by its result, whole', () => {
    expect(resultCountLabel('leads', 236.3268)).toBe('236 leads');
    expect(resultCountLabel('signups', 1)).toBe('1 sign-up');
    expect(resultCountLabel('purchases', 0)).toBe('0 purchases');
    expect(resultsApartLabel({ leads: 34, signups: 2 }, ['leads', 'signups'])).toBe(
      '34 leads · 2 sign-ups',
    );
    expect(resultsApartLabel(null, ['leads'])).toBeNull();
    expect(resultTypesOf([{ byResult: { leads: 1 } }, {}])).toEqual([]);
    expect(ownResultsLabel({ leads: 26, purchases: 0, signups: 2 })).toBe('26 leads · 2 sign-ups');
    expect(ownResultsLabel({ leads: 0, purchases: 0, signups: 0 })).toBe('0');
    expect(ownResultsLabel(null)).toBeNull();
  });
});
