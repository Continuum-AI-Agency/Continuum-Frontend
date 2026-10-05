import { describe, expect, it } from 'bun:test';
import {
  buildMetrics,
  EASY_FIT_MP1,
  GOOGLE_TOTALS,
  META_ONLY,
  META_TOTALS,
  TIKTOK_TOTALS,
} from './__fixtures__/accountPlatformMetrics';
import {
  connectedFromMetrics,
  coverageNote,
  headlineKindClauses,
  kindTileLabel,
  kindTileSub,
  platformCountLabel,
  platformKindSub,
  platformSpendFigure,
  platformSpendSub,
  rankedKinds,
  spendByCurrencyLabel,
  spendSplitLabel,
  topSpendLabel,
  windowDaysLabel,
} from './accountPlatformMetricsModel';

describe('the All frame', () => {
  it('says the window the producer read, never an assumed seven days', () => {
    expect(windowDaysLabel(EASY_FIT_MP1)).toBe('7 days');
    expect(platformCountLabel(EASY_FIT_MP1)).toBe('across three platforms');
    expect(platformCountLabel(META_ONLY)).toBe('on Meta');
  });

  it('splits spend by platform share in one currency', () => {
    expect(spendByCurrencyLabel(EASY_FIT_MP1)).toBe('38,411 MXN');
    expect(spendSplitLabel(EASY_FIT_MP1)).toBe('Meta 62% · Google 29% · TikTok 9%');
    expect(topSpendLabel(EASY_FIT_MP1)).toBe('Meta takes 62% of the spend');
  });

  it('never adds two currencies: each platform keeps its own figure and no share', () => {
    const usdGoogle = {
      ...GOOGLE_TOTALS,
      currency: 'USD',
      share_of_spend: null,
      accounts: [{ account_id: '5251780631', currency: 'USD', ingested: true }],
    };
    const frame = buildMetrics([{ ...META_TOTALS, share_of_spend: null }, usdGoogle]);
    expect(spendByCurrencyLabel(frame)).toBe('23,911 MXN and $11,200');
    expect(spendSplitLabel(frame)).toBe('Meta 23,911 MXN · Google $11,200');
    expect(topSpendLabel(frame)).toBeNull();
  });

  it('keeps result kinds apart and names who buys each cheapest', () => {
    const kinds = rankedKinds(EASY_FIT_MP1).map((kind) => kind.kind);
    expect(kinds).toEqual(['conversations', 'leads', 'purchases']);
    const leads = rankedKinds(EASY_FIT_MP1).find((kind) => kind.kind === 'leads');
    if (!leads) throw new Error('leads missing');
    expect(kindTileLabel(EASY_FIT_MP1, leads)).toBe('Leads · 3 platforms');
    expect(kindTileSub(EASY_FIT_MP1, leads)).toBe('36.83 MXN each · Google cheapest at 31.40 MXN');
    const conversations = rankedKinds(EASY_FIT_MP1)[0];
    if (!conversations) throw new Error('conversations missing');
    expect(kindTileLabel(EASY_FIT_MP1, conversations)).toBe('Conversations · Meta');
    expect(kindTileSub(EASY_FIT_MP1, conversations)).toBe('39.95 MXN each');
  });

  it('says a kind with spend and no results instead of a cost of zero', () => {
    const purchases = rankedKinds(EASY_FIT_MP1).find((kind) => kind.kind === 'purchases');
    if (!purchases) throw new Error('purchases missing');
    expect(kindTileSub(EASY_FIT_MP1, purchases)).toBe('75.60 MXN spent, no results');
  });

  it('gives the headline the three largest kinds with their cheapest platform', () => {
    const clauses = headlineKindClauses(EASY_FIT_MP1);
    expect(clauses.map((clause) => clause.kind.kind)).toEqual([
      'conversations',
      'leads',
      'purchases',
    ]);
    expect(clauses[0]?.only).toBe('meta');
    expect(clauses[1]?.cheapest?.platform).toBe('google_ads');
  });

  it('reads connection from the producer, TikTok included', () => {
    expect(connectedFromMetrics(EASY_FIT_MP1)).toEqual({
      meta: true,
      google_ads: true,
      tiktok_ads: true,
    });
    expect(connectedFromMetrics(META_ONLY)).toEqual({
      meta: true,
      google_ads: false,
      tiktok_ads: false,
    });
  });

  it('names the portfolios the frame left out, by reason', () => {
    expect(coverageNote(EASY_FIT_MP1)).toBeNull();
    const frame = buildMetrics([META_TOTALS, GOOGLE_TOTALS, TIKTOK_TOTALS], {
      portfolios: {
        counted: 3,
        excluded: [
          { portfolio_id: '0d9c4a5e-1111-4a5e-9c4a-5e0d9c4a5e11', reason: 'no_cycle' },
          { portfolio_id: '0d9c4a5e-2222-4a5e-9c4a-5e0d9c4a5e22', reason: 'window' },
        ],
      },
    });
    expect(coverageNote(frame)).toBe(
      '2 Meta portfolios not counted: 1 without a cycle yet, 1 on a different window',
    );
  });
});

describe('one platform', () => {
  it('states share and change on the period before', () => {
    expect(platformSpendSub(TIKTOK_TOTALS)).toBe('9% of the account · +10% on the period before');
    expect(platformSpendSub(GOOGLE_TOTALS)).toBe('29% of the account · no prior period to compare');
  });

  it('refuses one spend figure across accounts billing in two currencies', () => {
    const mixed = {
      ...GOOGLE_TOTALS,
      currency: null,
      share_of_spend: null,
      accounts: [
        { account_id: 'a', currency: 'MXN', ingested: true },
        { account_id: 'b', currency: 'USD', ingested: true },
      ],
    };
    expect(platformSpendFigure(mixed)).toBeNull();
    expect(platformSpendSub(mixed)).toBe('accounts bill in MXN and USD — not added up');
  });

  it('prints cost and the prior cost per kind', () => {
    const leads = GOOGLE_TOTALS.results_by_kind[0];
    if (!leads) throw new Error('leads missing');
    expect(platformKindSub(leads, 'MXN')).toBe('31.40 MXN each · prev. 33.10 MXN');
  });
});
