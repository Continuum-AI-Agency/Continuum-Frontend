import { describe, expect, it } from 'bun:test';
import {
  EASY_FIT_ACCOUNT,
  EASY_FIT_REPORT,
  GOOGLE_ACCOUNT,
  SECOND_USD_ACCOUNT,
} from './__fixtures__/creativeReport';
import {
  CREATIVE_MISSING,
  type CreativeRead,
  creativeTileState,
  needsNewCreative,
  STANDING_LABEL,
  standingLine,
  standingOfVerdict,
  verdictCurrency,
} from './creativeModel';

const read = (overrides: Partial<CreativeRead> = {}): CreativeRead => ({
  status: 'ready',
  report: EASY_FIT_REPORT,
  isLoading: false,
  isError: false,
  ...overrides,
});

function readyOf(state: ReturnType<typeof creativeTileState>) {
  if (state.state !== 'ready') throw new Error(`expected ready, got ${state.state}`);
  return state.spotlight;
}

describe('standingOfVerdict — the stored verdict, said honestly', () => {
  it('maps scale to winning, kill to underperforming, iterate to a new angle, watch to too early', () => {
    expect(standingOfVerdict('scale')).toBe('winning');
    expect(standingOfVerdict('kill')).toBe('losing');
    expect(standingOfVerdict('iterate')).toBe('iterate');
    expect(standingOfVerdict('watch')).toBe('early');
  });

  it('never claims "fading" or "new": the report reads neither fatigue nor ad age', () => {
    const labels = Object.values(STANDING_LABEL).map((label) => label.toLowerCase());
    expect(labels).not.toContain('fading');
    expect(labels).not.toContain('new');
  });
});

describe('verdictCurrency — one currency or no cost figure', () => {
  it('is the Meta accounts’ one shared currency', () => {
    expect(verdictCurrency([EASY_FIT_ACCOUNT, GOOGLE_ACCOUNT])).toBe('MXN');
  });

  it('is null when the brand’s Meta accounts hold two currencies (verdicts carry no account)', () => {
    expect(verdictCurrency([EASY_FIT_ACCOUNT, SECOND_USD_ACCOUNT])).toBeNull();
  });

  it('is null when a Meta account has no stored currency', () => {
    expect(
      verdictCurrency([EASY_FIT_ACCOUNT, { ...SECOND_USD_ACCOUNT, currency: null }]),
    ).toBeNull();
  });

  it('ignores Google accounts, which the report never reads', () => {
    expect(verdictCurrency([GOOGLE_ACCOUNT])).toBeNull();
  });
});

describe('creativeTileState', () => {
  it('is loading only while the read is on its way', () => {
    expect(creativeTileState(read({ isLoading: true, report: null }), [EASY_FIT_ACCOUNT])).toEqual({
      state: 'loading',
    });
  });

  it('is an error when the read failed and nothing is stored', () => {
    expect(creativeTileState(read({ isError: true, report: null }), [EASY_FIT_ACCOUNT]).state).toBe(
      'error',
    );
  });

  it('is missing, naming why, when the brand has no Meta ad account', () => {
    expect(creativeTileState(read(), [GOOGLE_ACCOUNT])).toEqual({
      state: 'missing',
      sentence: CREATIVE_MISSING.noMetaAccount,
    });
  });

  it('is missing when no report row exists yet', () => {
    expect(
      creativeTileState(read({ status: 'assembling', report: null }), [EASY_FIT_ACCOUNT]),
    ).toEqual({ state: 'missing', sentence: CREATIVE_MISSING.noReport });
  });

  it('is missing when the read found no labeled ad', () => {
    expect(creativeTileState(read({ status: 'empty', report: null }), [EASY_FIT_ACCOUNT])).toEqual({
      state: 'missing',
      sentence: CREATIVE_MISSING.noLabeledAds,
    });
    expect(
      creativeTileState(read({ report: { ...EASY_FIT_REPORT, verdicts: [] } }), [EASY_FIT_ACCOUNT]),
    ).toEqual({ state: 'missing', sentence: CREATIVE_MISSING.noLabeledAds });
  });

  it('is missing when the last assembly failed before storing a report', () => {
    expect(creativeTileState(read({ status: 'error', report: null }), [EASY_FIT_ACCOUNT])).toEqual({
      state: 'missing',
      sentence: CREATIVE_MISSING.assemblyFailed,
    });
  });

  it('is missing when a stored report does not parse', () => {
    expect(creativeTileState(read({ status: 'ready', report: null }), [EASY_FIT_ACCOUNT])).toEqual({
      state: 'missing',
      sentence: CREATIVE_MISSING.unreadable,
    });
  });

  it('still shows a stored report when its latest refresh failed, and says so', () => {
    const spotlight = readyOf(creativeTileState(read({ status: 'error' }), [EASY_FIT_ACCOUNT]));
    expect(spotlight.refreshFailed).toBe(true);
    expect(spotlight.total).toBe(6);
  });
});

describe('the spotlight', () => {
  const spotlight = readyOf(creativeTileState(read(), [EASY_FIT_ACCOUNT, GOOGLE_ACCOUNT]));

  it('headlines the number of ads the report judged — jsonb_array_length(report->verdicts)', () => {
    expect(spotlight.total).toBe(EASY_FIT_REPORT.verdicts.length);
    expect(spotlight.counts).toEqual({ winning: 2, losing: 1, iterate: 2, early: 1 });
  });

  it('orders winners first, then the ads to cut, rework, and the too-early ones; by spend within', () => {
    expect(spotlight.cards.map((card) => card.adId)).toEqual([
      '120252021696220236',
      '120252021628830236',
      '120252022440000236',
      '120252021900140236',
      '120252021900130236',
      '120252021900150236',
    ]);
  });

  it('prints a cost in the one account currency', () => {
    const winner = spotlight.cards[0];
    expect(winner.cost).toBe('$20.76 MXN');
    expect(winner.vsCohort).toBe('0.80× cohort median');
  });

  it('draws no money figure when the Meta accounts hold two currencies, only the ratio', () => {
    const mixed = readyOf(creativeTileState(read(), [EASY_FIT_ACCOUNT, SECOND_USD_ACCOUNT]));
    expect(mixed.currency).toBeNull();
    for (const card of mixed.cards) expect(card.cost).toBeNull();
    expect(mixed.cards[0].vsCohort).toBe('0.80× cohort median');
  });

  it('keeps only stored http(s) thumbnails and permalinks', () => {
    const byId = new Map(spotlight.cards.map((card) => [card.adId, card]));
    expect(byId.get('120252022440000236')?.thumbnailUrl).toStartWith('https://scontent');
    expect(byId.get('120252021628830236')?.thumbnailUrl).toBeNull();
    expect(byId.get('120252021628830236')?.permalinkUrl).toBeNull();
    expect(byId.get('120252021900140236')?.thumbnailUrl).toBeNull();
  });

  it('shows the stored reason and the stored brief title as written', () => {
    const iterate = spotlight.cards.find((card) => card.adId === '120252021900130236');
    expect(iterate?.reason).toContain('worth a new angle');
    expect(iterate?.briefTitle).toBe('Low-Barrier Enrollment Offer for Gym Sign-ups');
  });

  it('carries the synopsis themes and the reporting account', () => {
    expect(spotlight.themes).toHaveLength(2);
    expect(spotlight.adAccountName).toBe('Easy Fit');
  });

  it('lists the ads that need a new creative — underperforming and iterate — by spend', () => {
    expect(needsNewCreative(spotlight).map((card) => card.adId)).toEqual([
      '120252022440000236',
      '120252021900140236',
      '120252021900130236',
    ]);
  });

  it('writes a standing line with only the standings present', () => {
    expect(standingLine(spotlight.counts)).toBe(
      '2 winning · 1 underperforming · 2 need a new angle · 1 too early',
    );
    expect(standingLine({ winning: 0, losing: 0, iterate: 1, early: 0 })).toBe(
      '1 needs a new angle',
    );
  });
});
