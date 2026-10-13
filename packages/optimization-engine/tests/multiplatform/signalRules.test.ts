import { describe, expect, test } from 'bun:test';
import {
  type MultiPlatformSnapshot,
  MultiPlatformSnapshotSchema,
  OptimizerActionSchema,
  PlatformCardSchema,
  type PlatformSignals,
  PlatformSignalsSchema,
} from '@continuum/contracts';
import {
  evaluatePlatformSignals,
  type PlatformSignalsContext,
  type PlatformSignalsEvaluation,
  tiktokLearningMultiple,
} from '../../src';
import { googleCampaign, loadFixture } from './fixtures';

const NOW = '2026-10-05T12:00:00Z';
const ACCOUNT = '1112223333';

function campaign(
  id: string,
  over: { spend?: number; leads?: number; rankLost?: number; status?: string } = {},
): MultiPlatformSnapshot {
  const ref = {
    platform: 'google_ads' as const,
    level: 'campaign' as const,
    nativeLevel: 'campaign' as const,
    id,
    accountId: ACCOUNT,
  };
  const w = {
    spend: over.spend ?? 0,
    purchases: 0,
    addToCarts: 0,
    clicks: 0,
    impressions: 0,
    leads: over.leads ?? 0,
    ...(over.rankLost === undefined
      ? {}
      : { delivery: { rankLostImpressionShare: over.rankLost } }),
  };
  return MultiPlatformSnapshotSchema.parse({
    platform: 'google_ads',
    level: 'campaign',
    native_level: 'campaign',
    id,
    accountId: ACCOUNT,
    name: `Campaign ${id}`,
    automation: 'manual',
    budget: { kind: 'daily', minor: 100_000, currency: 'MXN', shared: false, ownerRef: ref },
    ...(over.status ? { primaryStatus: over.status } : {}),
    windows: { d3: w, d7: w, d14: w },
  });
}

function adGroup(id: string, budgetMajor: number, d7Leads = 0, d7Spend = 0): MultiPlatformSnapshot {
  const ref = {
    platform: 'tiktok_ads' as const,
    level: 'group' as const,
    nativeLevel: 'ad_group' as const,
    id,
    accountId: ACCOUNT,
  };
  const w = {
    spend: d7Spend,
    purchases: 0,
    addToCarts: 0,
    clicks: 0,
    impressions: 0,
    leads: d7Leads,
  };
  return MultiPlatformSnapshotSchema.parse({
    platform: 'tiktok_ads',
    level: 'group',
    native_level: 'ad_group',
    id,
    accountId: ACCOUNT,
    name: `Group ${id}`,
    automation: 'manual',
    budget: {
      kind: 'daily',
      minor: budgetMajor * 100,
      currency: 'MXN',
      shared: false,
      ownerRef: ref,
    },
    windows: { d3: w, d7: w, d14: w },
  });
}

const totals = (spend: number, conversions = 0) => ({
  spend,
  impressions: 100,
  clicks: 10,
  conversions,
});

function google(over: Partial<NonNullable<PlatformSignals['google']>>): PlatformSignals {
  return PlatformSignalsSchema.parse({
    account_id: ACCOUNT,
    currency: 'MXN',
    window: { since: '2026-09-21', until: '2026-10-04' },
    google: { search_terms: [], keywords: [], bid_targets: [], asset_groups: [], ...over },
    tiktok: null,
  });
}

function tiktok(over: Partial<NonNullable<PlatformSignals['tiktok']>>): PlatformSignals {
  return PlatformSignalsSchema.parse({
    account_id: ACCOUNT,
    currency: 'MXN',
    window: { since: '2026-09-21', until: '2026-10-04' },
    google: null,
    tiktok: { creatives: [], ad_groups: [], organic_posts: [], ...over },
  });
}

const ctx = (over: Partial<PlatformSignalsContext> = {}): PlatformSignalsContext => ({
  cpaTarget: { amount: 100, currency: 'MXN' },
  now: NOW,
  snapshots: [campaign('c1')],
  kpiField: 'leads',
  crossPlatformComparison: true,
  ...over,
});

function rules(r: PlatformSignalsEvaluation): string[] {
  return r.recommendations.map((x) => x.rule);
}

const DOLLAR_WITHOUT_CODE = /\$\d[\d,]*(?:\.\d+)?(?![\d.,]| [A-Z]{3}\b)/;

/** What every evaluation must hold, whatever it found. */
function assertWellFormed(r: PlatformSignalsEvaluation): void {
  const keys = new Set<string>();
  for (const rec of r.recommendations) {
    expect(PlatformCardSchema.safeParse(rec.platform_card).success).toBe(true);
    if (rec.action) expect(OptimizerActionSchema.safeParse(rec.action).success).toBe(true);
    expect(rec.needsApproval).toBe(true);
    // M1: a "$" is only the symbol before a figure whose ISO code follows it.
    expect(rec.reason).not.toMatch(DOLLAR_WITHOUT_CODE);
    const key = `${rec.rule}|${rec.entity.id}|${rec.subject_key}`;
    expect(keys.has(key)).toBe(false);
    keys.add(key);
  }
}

function evaluate(signals: PlatformSignals, context = ctx()): PlatformSignalsEvaluation {
  const r = evaluatePlatformSignals(signals, context);
  assertWellFormed(r);
  return r;
}

const term = (text: string, spend: number, conversions = 0, status = 'NONE', adGroupId = 'g1') => ({
  term: text,
  campaign_id: 'c1',
  ad_group_id: adGroupId,
  status: status as 'NONE',
  matched_keyword: 'gym',
  totals: totals(spend, conversions),
});

const keyword = (id: string, text: string, over: Record<string, unknown> = {}) => ({
  criterion_id: id,
  ad_group_id: 'g1',
  campaign_id: 'c1',
  text,
  match_type: 'BROAD' as const,
  status: 'ENABLED' as const,
  negative: false,
  quality_score: 7,
  totals: totals(0),
  ...over,
});

describe('G05 negative terms', () => {
  test('a term over target with no conversion fires; at target it does not', () => {
    const r = evaluate(
      google({ search_terms: [term('gym barato', 100.01), term('gym caro', 100)] }),
    );
    expect(rules(r)).toEqual(['G05']);
    const rec = r.recommendations[0]!;
    expect(rec.subject_key).toBe('negatives');
    expect(rec.platform_card.variant).toBe('google_negative_terms');
    expect(rec.action).toMatchObject({
      kind: 'add_negatives',
      scope: 'campaign',
      terms: [{ text: 'gym barato', matchType: 'EXACT' }],
    });
    // 100.01 over a 100 target: the cents show on both sides, never "$100 MXN ... $100 MXN target".
    expect(rec.reason).toContain('"gym barato" ($100.01 MXN)');
    expect(rec.reason).toContain('cost more than the $100.00 MXN target');
    expect(rec.reason).not.toContain('$100 MXN');
  });

  test('a converting term, an ADDED term and an active keyword are never negatives', () => {
    const r = evaluate(
      google({
        search_terms: [term('a', 500, 1), term('b', 500, 0, 'ADDED'), term('gym', 500)],
        keywords: [keyword('k1', 'Gym')],
      }),
    );
    expect(rules(r)).toEqual([]);
    expect(r.abstentions.some((a) => a.rule === 'G05' && a.reason.includes('active keyword'))).toBe(
      true,
    );
  });

  test('at most 20 negatives in one cycle, the most expensive first', () => {
    const many = Array.from({ length: 25 }, (_, i) => term(`term ${i}`, 200 + i));
    const r = evaluate(google({ search_terms: many }));
    const card = r.recommendations[0]!.platform_card;
    expect(card.variant === 'google_negative_terms' && card.terms.length).toBe(20);
    expect(card.variant === 'google_negative_terms' && card.terms[0]!.term).toBe('term 24');
    expect(r.abstentions.filter((a) => a.reason.includes('next cycle'))).toHaveLength(5);
  });

  test('a term over Google keyword limits is declined by name', () => {
    const r = evaluate(
      google({
        search_terms: [term('one two three four five six seven eight nine ten eleven', 500)],
      }),
    );
    expect(rules(r)).toEqual([]);
    expect(r.abstentions[0]!.reason).toContain('10-word');
  });

  test('no target, or one in another currency: G05, promote and G11 abstain by name', () => {
    for (const cpaTarget of [null, { amount: 100, currency: 'USD' }]) {
      const r = evaluate(google({ search_terms: [term('x', 500)] }), ctx({ cpaTarget }));
      expect(rules(r)).toEqual([]);
      expect(r.abstentions.map((a) => a.rule).sort()).toEqual(['G05', 'G05_promote', 'G11']);
    }
  });
});

describe('promote a converting term', () => {
  test('3 conversions at target promotes; 2 conversions or over target do not', () => {
    const r = evaluate(
      google({
        search_terms: [
          term('gym 24 horas', 300, 3),
          term('gym 24h', 200, 2),
          term('gym lujo', 301, 3),
          term('Gym 24 Horas', 10, 3, 'NONE', 'g2'),
        ],
      }),
    );
    const promotes = r.recommendations.filter((x) => x.rule === 'G05_promote');
    expect(promotes.map((p) => [p.entity.id, p.subject_key])).toEqual([
      ['g1', 'gym 24 horas'],
      ['g2', 'gym 24 horas'],
    ]);
    expect(promotes[0]!.action).toMatchObject({
      kind: 'add_keyword',
      keyword: { text: 'gym 24 horas', matchType: 'EXACT' },
    });
  });

  test('a term already a keyword is not promoted', () => {
    const r = evaluate(
      google({ search_terms: [term('gym', 30, 5)], keywords: [keyword('k1', 'gym')] }),
    );
    expect(rules(r)).toEqual([]);
  });
});

describe('G07 Google Ads target CPA (bid setting), serving the portfolio CPA goal', () => {
  const bid = (over: Record<string, unknown> = {}) => ({
    campaign_id: 'c1',
    strategy: 'target_cpa' as const,
    target_cpa: 100,
    target_roas: null,
    system_status: 'ENABLED',
    last_changed_at: null,
    ...over,
  });
  const goal = (amount: number, currency = 'MXN') => ({ cpaTarget: { amount, currency } });
  const run = (
    snap: MultiPlatformSnapshot,
    over: Record<string, unknown> = {},
    context: Partial<PlatformSignalsContext> = goal(200),
  ) => evaluate(google({ bid_targets: [bid(over)] }), ctx({ snapshots: [snap], ...context }));
  const g07Abstentions = (r: PlatformSignalsEvaluation) =>
    r.abstentions.filter((a) => a.rule === 'G07').map((a) => a.reason);

  test('regression: goal 250, Google tCPA 400, paying 300 → never raised to 440; lowered to 360', () => {
    const r = run(
      campaign('c1', { spend: 3000, leads: 10, rankLost: 0.5 }),
      { target_cpa: 400 },
      goal(250),
    );
    expect(rules(r)).toEqual(['G07']);
    const [rec] = r.recommendations;
    expect(rec!.action).toMatchObject({
      kind: 'set_bid_target',
      field: 'target_cpa_micros',
      expected: 400_000_000,
      target: 360_000_000,
    });
    const card = rec!.platform_card;
    expect(card.variant === 'google_bid_target' && card.current_target).toBe(400);
    expect(card.variant === 'google_bid_target' && card.proposed_target).toBe(360);
    expect(card.variant === 'google_bid_target' && card.portfolio_goal).toBe(250);
    expect(rec!.reason).toContain('over the portfolio CPA goal of $250 MXN');
    expect(rec!.reason).toContain('Google Ads target CPA (bid setting) of $400 MXN');
    expect(rec!.reason).toContain('lower the Google Ads bid target 10% to $360 MXN');
    expect(rec!.reason).not.toContain('440');
  });

  test('raise: under 0.8× the goal with rank-lost over 0.3 → +10%; at 0.3 or at 0.8× nothing', () => {
    const raise = run(campaign('c1', { spend: 1500, leads: 10, rankLost: 0.31 }));
    expect(raise.recommendations[0]!.action).toMatchObject({
      kind: 'set_bid_target',
      field: 'target_cpa_micros',
      expected: 100_000_000,
      target: 110_000_000,
    });
    expect(raise.recommendations[0]!.reason).toBe(
      'Campaign c1 pays $150 MXN per conversion over 14 days, 25% under the portfolio CPA goal of $200 MXN, and loses 31.0% of impressions to rank. Its Google Ads target CPA (bid setting) is $100 MXN: raise the Google Ads bid target 10% to $110 MXN, still under the portfolio goal.',
    );
    expect(rules(run(campaign('c1', { spend: 1500, leads: 10, rankLost: 0.3 })))).toEqual([]);
    expect(rules(run(campaign('c1', { spend: 1600, leads: 10, rankLost: 0.5 })))).toEqual([]);
  });

  test('raise never takes the Google Ads target CPA above the portfolio goal', () => {
    const near = run(campaign('c1', { spend: 1000, leads: 10, rankLost: 0.5 }), {
      target_cpa: 190,
    });
    expect(rules(near)).toEqual([]);
    expect(g07Abstentions(near)[0]).toContain(
      'raising its Google Ads target CPA (bid setting) 10% to $209 MXN would put it above the portfolio CPA goal of $200 MXN',
    );
    const above = run(campaign('c1', { spend: 1000, leads: 10, rankLost: 0.5 }), {
      target_cpa: 250,
    });
    expect(rules(above)).toEqual([]);
    expect(g07Abstentions(above)[0]).toContain('above the portfolio CPA goal');
  });

  test('lower: over 1.3× the goal → −10%; at 1.3× nothing while Google’s target sits at or under the goal', () => {
    const lower = run(campaign('c1', { spend: 2700, leads: 10 }));
    const card = lower.recommendations[0]!.platform_card;
    expect(card.variant === 'google_bid_target' && card.proposed_target).toBe(90);
    expect(card.variant === 'google_bid_target' && card.portfolio_goal).toBe(200);
    expect(lower.recommendations[0]!.reason).toContain(
      'over the portfolio CPA goal of $200 MXN (1.35×)',
    );
    expect(rules(run(campaign('c1', { spend: 2600, leads: 10 })))).toEqual([]);
    expect(rules(run(campaign('c1', { spend: 2600, leads: 10 }), { target_cpa: 200 }))).toEqual([]);
  });

  test('a Google Ads target above the goal is lowered once the campaign pays over the goal, not before', () => {
    expect(rules(run(campaign('c1', { spend: 2010, leads: 10 }), { target_cpa: 300 }))).toEqual([
      'G07',
    ]);
    expect(rules(run(campaign('c1', { spend: 2000, leads: 10 }), { target_cpa: 300 }))).toEqual([]);
  });

  test('no portfolio goal, or one in another currency, abstains by name', () => {
    for (const context of [{ cpaTarget: null }, goal(200, 'USD')]) {
      const r = run(campaign('c1', { spend: 3000, leads: 10 }), {}, context);
      expect(rules(r)).toEqual([]);
      expect(g07Abstentions(r)).toEqual([
        'Campaign c1: no portfolio CPA goal in MXN, so its Google Ads target CPA (bid setting) is not moved.',
      ]);
    }
  });

  test('never while learning, never within 14 days of the last change', () => {
    const over = campaign('c1', { spend: 3000, leads: 10 });
    expect(rules(run(over, { system_status: 'LEARNING_NEW' }))).toEqual([]);
    expect(rules(run(over, { last_changed_at: '2026-09-22T12:00:00Z' }))).toEqual([]);
    const after = run(over, { last_changed_at: '2026-09-21T12:00:00Z' });
    expect(rules(after)).toEqual(['G07']);
    const card = after.recommendations[0]!.platform_card;
    expect(card.variant === 'google_bid_target' && card.days_since_last_change).toBe(14);
  });

  test('a paused campaign is skipped silently', () => {
    const r = run(campaign('c1', { spend: 3000, leads: 10, status: 'PAUSED' }));
    expect(rules(r)).toEqual([]);
    expect(g07Abstentions(r)).toEqual([]);
  });

  test('no target CPA on Maximize Conversions abstains by name', () => {
    const r = run(campaign('c1', { spend: 3000, leads: 10 }), {
      strategy: 'maximize_conversions',
      target_cpa: null,
    });
    expect(rules(r)).toEqual([]);
    expect(r.abstentions[0]!.reason).toContain('no Google Ads target CPA');
  });
});

describe('G11 low Quality Score', () => {
  const low = (id: string, over: Record<string, unknown> = {}) =>
    keyword(id, `kw ${id}`, { quality_score: 3, totals: totals(101), ...over });

  test('QS 3, over target, no conversions, with a sibling → pause the keyword', () => {
    const r = evaluate(google({ keywords: [low('k1'), keyword('k2', 'other')] }));
    expect(rules(r)).toEqual(['G11']);
    expect(r.recommendations[0]!.subject_key).toBe('k1');
    expect(r.recommendations[0]!.action).toMatchObject({
      kind: 'set_status',
      target: 'paused',
      expected: 'active',
      ref: { level: 'ad', nativeLevel: 'keyword', id: 'g1~k1' },
    });
  });

  test('the other sides: QS 4, spend at target, a conversion, paused', () => {
    for (const over of [
      { quality_score: 4 },
      { totals: totals(100) },
      { totals: totals(500, 1) },
      { status: 'PAUSED' },
    ]) {
      expect(
        rules(evaluate(google({ keywords: [low('k1', over), keyword('k2', 'other')] }))),
      ).toEqual([]);
    }
  });

  test('never the last active keyword of its ad group', () => {
    const only = evaluate(google({ keywords: [low('k1')] }));
    expect(rules(only)).toEqual([]);
    expect(only.abstentions[0]!.reason).toContain('last active keyword');
    const both = evaluate(google({ keywords: [low('k1'), low('k2', { totals: totals(200) })] }));
    expect(both.recommendations.map((x) => x.subject_key)).toEqual(['k2']);
  });
});

describe('PMax asset coverage', () => {
  const group = (strength: 'POOR' | 'AVERAGE' | 'GOOD', missing: string[], status = 'LIMITED') => ({
    asset_group_id: `ag-${strength}`,
    campaign_id: 'c1',
    name: `Group ${strength}`,
    ad_strength: strength,
    primary_status: status,
    missing,
  });
  test('POOR or AVERAGE with missing items → one card per campaign, no action', () => {
    const r = evaluate(
      google({
        asset_groups: [
          group('POOR', ['1 logo']),
          group('AVERAGE', ['3 headlines']),
          group('GOOD', ['1 video']),
        ],
      }),
    );
    expect(rules(r)).toEqual(['G18_pmax_coverage']);
    expect(r.recommendations[0]!.action).toBeNull();
    const card = r.recommendations[0]!.platform_card;
    expect(card.variant === 'google_pmax_asset_group' && card.asset_groups.length).toBe(2);
  });
  test('nothing missing, a NOT_ELIGIBLE group, or a paused campaign → no card', () => {
    expect(rules(evaluate(google({ asset_groups: [group('POOR', [])] })))).toEqual([]);
    expect(
      rules(evaluate(google({ asset_groups: [group('POOR', ['1 logo'], 'NOT_ELIGIBLE')] }))),
    ).toEqual([]);
    const paused = evaluate(
      google({ asset_groups: [group('POOR', ['1 logo'])] }),
      ctx({ snapshots: [campaign('c1', { status: 'PAUSED' })] }),
    );
    expect(rules(paused)).toEqual([]);
  });
});

type Day = NonNullable<PlatformSignals['tiktok']>['creatives'][number]['days'][number];
const day = (i: number, over: Partial<Day> = {}): Day => ({
  date: `2026-09-${String(21 + i).padStart(2, '0')}`
    .replace('2026-09-31', '2026-10-01')
    .replace('2026-09-32', '2026-10-02')
    .replace('2026-09-33', '2026-10-03')
    .replace('2026-09-34', '2026-10-04'),
  impressions: 1000,
  clicks: 10,
  spend: 100,
  results: 1,
  video_watched_2s: 300,
  video_watched_6s: 100,
  frequency: 1.5,
  ...over,
});
const creative = (id: string, days: Day[], group = 'ag1') => ({
  ad_id: id,
  ad_group_id: group,
  name: `Ad ${id}`,
  identity_type: 'TT_USER',
  tiktok_item_id: null,
  dark_post: true,
  created_at: '2026-09-01T00:00:00-06:00',
  days,
});
const days14 = (f: (i: number) => Partial<Day>) =>
  Array.from({ length: 14 }, (_, i) => day(i, f(i)));

describe('T1 weak hook', () => {
  const hold = (id: string, watched: number, impressions = 1000) =>
    creative(id, [
      day(0, { impressions, video_watched_2s: Math.round(watched * impressions) }),
      day(1, { impressions, video_watched_2s: Math.round(watched * impressions) }),
    ]);
  test('under the lower quartile fires; at it does not; under 2,000 impressions is not judged', () => {
    const r = evaluate(
      tiktok({
        creatives: [
          hold('a', 0.1),
          hold('b', 0.2),
          hold('c', 0.3),
          hold('d', 0.4),
          hold('e', 0.5),
          hold('f', 0.01, 999),
        ],
      }),
    );
    expect(r.recommendations.map((x) => x.subject_key)).toEqual(['a']);
    const card = r.recommendations[0]!.platform_card;
    expect(card.variant === 'tiktok_hook_retention' && card.portfolio_hold_2s).toBeCloseTo(0.2, 6);
  });
  test('fewer than 4 judged creatives: no quartile, said', () => {
    const r = evaluate(tiktok({ creatives: [hold('a', 0.1), hold('b', 0.2), hold('c', 0.3)] }));
    expect(rules(r)).toEqual([]);
    expect(r.abstentions[0]!.rule).toBe('T1');
  });
});

describe('T3 creative fatigue', () => {
  const tired = (over: (i: number) => Partial<Day> = () => ({})) =>
    days14((i) => ({
      spend: i < 11 ? 100 : 50,
      results: 1,
      frequency: i < 7 ? 1.5 : 2.5,
      ...over(i),
    }));
  test('CPA over target, 3 days under the 7-day average, reach under +5% → fires', () => {
    const r = evaluate(
      tiktok({
        creatives: [
          creative('x', tired()),
          creative(
            'y',
            days14(() => ({ clicks: 30 })),
          ),
        ],
      }),
      ctx({ cpaTarget: { amount: 70, currency: 'MXN' } }),
    );
    expect(r.recommendations.map((x) => [x.rule, x.subject_key])).toEqual([['T3', 'x']]);
    const card = r.recommendations[0]!.platform_card;
    expect(card.variant === 'tiktok_creative_fatigue' && card.replacement?.name).toBe('Ad y');
  });
  test('each signal alone is not enough', () => {
    const target = ctx({ cpaTarget: { amount: 70, currency: 'MXN' } });
    // CPA under target.
    expect(
      rules(
        evaluate(
          tiktok({
            creatives: [
              creative(
                'x',
                tired(() => ({ results: 3 })),
              ),
            ],
          }),
          target,
        ),
      ),
    ).toEqual([]);
    // Only 2 falling days.
    expect(
      rules(
        evaluate(
          tiktok({
            creatives: [
              creative(
                'x',
                tired((i) => ({ spend: i < 12 ? 100 : 50 })),
              ),
            ],
          }),
          target,
        ),
      ),
    ).toEqual([]);
    // Reach growing 5% or more: frequency falls instead of rising.
    expect(
      rules(
        evaluate(
          tiktok({
            creatives: [
              creative(
                'x',
                tired((i) => ({ frequency: i < 7 ? 1.5 : 0.9 })),
              ),
            ],
          }),
          target,
        ),
      ),
    ).toEqual([]);
  });
  test('without a target in the account currency it abstains by name', () => {
    const r = evaluate(tiktok({ creatives: [creative('x', tired())] }), ctx({ cpaTarget: null }));
    expect(rules(r)).toEqual([]);
    expect(r.abstentions.find((x) => x.rule === 'T3')!.reason).toContain('no target');
  });
});

describe('T5 Spark candidate', () => {
  const post = (id: string, views: number, postedAt: string, promoted = false) => ({
    post_id: id,
    caption: `Post ${id}`,
    posted_at: postedAt,
    views,
    engagement_rate: 0.05,
    promoted,
  });
  const old = Array.from({ length: 9 }, (_, i) =>
    post(`old${i}`, 100 * (i + 1), '2026-08-01T00:00:00Z'),
  );
  const snaps = [adGroup('ag1', 400, 2, 100), adGroup('ag2', 400, 5, 100)];
  test('fresh, at the 90th percentile and not promoted → card in the best ad group', () => {
    const r = evaluate(
      tiktok({ organic_posts: [...old, post('new', 5000, '2026-10-03T12:00:00Z')] }),
      ctx({ snapshots: snaps }),
    );
    expect(r.recommendations.map((x) => [x.rule, x.entity.id, x.subject_key])).toEqual([
      ['T5', 'ag2', 'new'],
    ]);
  });
  test('older than 72 h, under P90, promoted, or no ad group: no card', () => {
    expect(
      rules(
        evaluate(
          tiktok({ organic_posts: [...old, post('new', 5000, '2026-10-02T11:59:00Z')] }),
          ctx({ snapshots: snaps }),
        ),
      ),
    ).toEqual([]);
    expect(
      rules(
        evaluate(
          tiktok({ organic_posts: [...old, post('new', 850, '2026-10-04T00:00:00Z')] }),
          ctx({ snapshots: snaps }),
        ),
      ),
    ).toEqual([]);
    expect(
      rules(
        evaluate(
          tiktok({ organic_posts: [...old, post('new', 5000, '2026-10-04T00:00:00Z', true)] }),
          ctx({ snapshots: snaps }),
        ),
      ),
    ).toEqual([]);
    const homeless = evaluate(
      tiktok({ organic_posts: [...old, post('new', 5000, '2026-10-04T00:00:00Z')] }),
      ctx({ snapshots: [] }),
    );
    expect(rules(homeless)).toEqual([]);
    expect(homeless.abstentions[0]!.reason).toContain('no active TikTok ad group');
  });
});

describe('T7 budget below learning', () => {
  const group = (goal: string) => ({
    ad_group_id: 'ag1',
    optimization_goal: goal,
    click_attribution_window_days: 7,
    view_attribution_window_days: 1,
    bid_type: 'BID_TYPE_NO_BID',
  });
  test('documented multiples', () => {
    expect([
      tiktokLearningMultiple('INSTALL'),
      tiktokLearningMultiple('LEAD_GENERATION'),
      tiktokLearningMultiple('CLICK'),
      tiktokLearningMultiple('MYSTERY'),
    ]).toEqual([20, 10, 50, null]);
  });
  test('under 10× target fires; at it does not', () => {
    const at = (budget: number) =>
      evaluate(
        tiktok({ ad_groups: [group('LEAD_GENERATION')] }),
        ctx({ cpaTarget: { amount: 35, currency: 'MXN' }, snapshots: [adGroup('ag1', budget)] }),
      );
    expect(rules(at(349))).toEqual(['T7']);
    expect(rules(at(350))).toEqual([]);
  });
  test('without a target, only the 20 USD × 10 MXN floor applies', () => {
    const at = (budget: number) =>
      evaluate(
        tiktok({ ad_groups: [group('LEAD_GENERATION')] }),
        ctx({ cpaTarget: null, snapshots: [adGroup('ag1', budget)] }),
      );
    expect(rules(at(199))).toEqual(['T7']);
    expect(rules(at(200))).toEqual([]);
  });
});

describe('T12 attribution window', () => {
  const group = (click: number, view: number) => ({
    ad_group_id: 'ag1',
    optimization_goal: 'LEAD_GENERATION',
    click_attribution_window_days: click,
    view_attribution_window_days: view,
    bid_type: null,
  });
  test('a window other than 7/1 in a cross-platform comparison → card and G27 exclusion', () => {
    const r = evaluate(tiktok({ ad_groups: [group(1, 0)] }), ctx({ snapshots: [] }));
    expect(rules(r)).toEqual(['T12']);
    expect(r.comparisonExclusions).toEqual([
      { platform: 'tiktok_ads', entityId: 'ag1', reason: 'attribution_mismatch' },
    ]);
  });
  test('7/1, or a portfolio that does not compare platforms → nothing', () => {
    expect(rules(evaluate(tiktok({ ad_groups: [group(7, 1)] }), ctx({ snapshots: [] })))).toEqual(
      [],
    );
    const solo = evaluate(
      tiktok({ ad_groups: [group(1, 0)] }),
      ctx({ snapshots: [], crossPlatformComparison: false }),
    );
    expect(rules(solo)).toEqual([]);
    expect(solo.comparisonExclusions).toEqual([]);
  });
});

test('no google and no tiktok block → nothing at all', () => {
  const r = evaluate(
    PlatformSignalsSchema.parse({
      account_id: ACCOUNT,
      currency: null,
      window: { since: '2026-09-21', until: '2026-10-04' },
      google: null,
      tiktok: null,
    }),
  );
  expect(r).toEqual({ recommendations: [], abstentions: [], comparisonExclusions: [] });
});

describe('G03 budget limited (escenario 07)', () => {
  // EKATAR (Vivo 47, recorded GAQL): 1,179 MXN/day, 28% of impressions lost to budget,
  // 772.98 MXN per lead over 7 days.
  const ekatar = googleCampaign('vivo47', '20775796216').snapshot;
  const vivo = (): PlatformSignals =>
    PlatformSignalsSchema.parse({
      account_id: ekatar.accountId,
      currency: 'MXN',
      window: { since: '2026-09-21', until: '2026-10-04' },
      google: { search_terms: [], keywords: [], bid_targets: [], asset_groups: [] },
      tiktok: null,
    });
  const g03 = (over: Partial<PlatformSignalsContext> = {}) =>
    evaluate(
      vivo(),
      ctx({
        snapshots: [ekatar],
        cpaTarget: { amount: 900, currency: 'MXN' },
        objective: 'lead',
        ...over,
      }),
    ).recommendations.filter((rec) => rec.rule === 'G03');

  test('under target with a proposal → the card and a set_budget on the campaign budget, minor units', () => {
    const [rec, ...rest] = g03();
    expect(rest).toEqual([]);
    expect(rec?.subject_key).toBe('budget');
    expect(rec?.severity).toBe('medium');
    expect(rec?.platform_card).toMatchObject({
      variant: 'google_budget_limited',
      campaign_name: 'VIVO 47-EKATAR',
      budget_per_day: 1179,
      proposed_budget_per_day: 1473.75,
      result_label: 'leads',
      currency: 'MXN',
    });
    expect(rec?.action).toEqual({
      kind: 'set_budget',
      ref: {
        platform: 'google_ads',
        level: 'campaign',
        nativeLevel: 'campaign',
        id: '20775796216',
        accountId: ekatar.accountId,
        name: 'VIVO 47-EKATAR',
      },
      budget: ekatar.budget,
      expectedMinor: 117_900,
      targetMinor: 147_375,
    });
    expect(OptimizerActionSchema.parse(rec?.action)).toEqual(rec?.action as never);
  });

  test('no target in the account currency → the card asks for one, with no action', () => {
    const [rec] = g03({ cpaTarget: null });
    expect(rec?.platform_card).toMatchObject({ proposed_budget_per_day: null });
    expect(rec?.action).toBeNull();
    expect(rec?.severity).toBe('low');
    expect(rec?.reason).toContain('Set a target cost per result in MXN');
  });

  test('a shared budget is never changed in place: no card, abstains by name', () => {
    const shared = { ...ekatar, budget: { ...ekatar.budget, shared: true } };
    const r = evaluate(
      vivo(),
      ctx({ snapshots: [shared], cpaTarget: { amount: 900, currency: 'MXN' }, objective: 'lead' }),
    );
    expect(rules(r)).not.toContain('G03');
    expect(r.abstentions).toContainEqual({
      rule: 'G03',
      entityId: '20775796216',
      reason:
        'VIVO 47-EKATAR shares its budget with other campaigns; it is never changed in place.',
    });
  });

  test('no objective → G03 abstains by name and writes nothing', () => {
    const r = evaluate(vivo(), ctx({ snapshots: [ekatar], objective: undefined }));
    expect(rules(r)).not.toContain('G03');
    expect(r.abstentions.filter((a) => a.rule === 'G03')).toEqual([
      {
        rule: 'G03',
        entityId: null,
        reason: 'no portfolio objective; the budget step is unknown.',
      },
    ]);
  });

  test('a dark campaign is G12’s: no budget card, abstains by name', () => {
    const signals = PlatformSignalsSchema.parse({
      ...vivo(),
      google: {
        ...vivo().google,
        delivery: [
          {
            campaign_id: '20775796216',
            campaign_name: 'VIVO 47-EKATAR',
            primary_status: 'ELIGIBLE',
            primary_status_reasons: [],
            serving_status: 'SUSPENDED',
            budget_per_day: 1179,
            dark_days: 4,
            disapproved_ads: [],
          },
        ],
      },
    });
    const r = evaluate(
      signals,
      ctx({ snapshots: [ekatar], cpaTarget: { amount: 900, currency: 'MXN' }, objective: 'lead' }),
    );
    expect(rules(r)).not.toContain('G03');
    expect(r.abstentions).toContainEqual({
      rule: 'G03',
      entityId: '20775796216',
      reason: 'VIVO 47-EKATAR has shown no ad for 4 days; its delivery comes first.',
    });
  });

  test('a campaign losing nothing to budget, or another account’s, says nothing', () => {
    expect(g03({ snapshots: [campaign('c1')] })).toEqual([]);
    const foreign = { ...ekatar, accountId: '9999999999' };
    expect(g03({ snapshots: [foreign] })).toEqual([]);
  });
});

describe('G12 Google delivery issue', () => {
  type Delivery = NonNullable<NonNullable<PlatformSignals['google']>['delivery']>[number];
  const camp = (id: string, over: Partial<Delivery> = {}): Delivery => ({
    campaign_id: id,
    campaign_name: `Campaign ${id}`,
    primary_status: 'ELIGIBLE',
    primary_status_reasons: [],
    serving_status: 'SUSPENDED',
    budget_per_day: 100,
    dark_days: 30,
    disapproved_ads: [],
    ...over,
  });
  const card = (r: PlatformSignalsEvaluation, i = 0) => r.recommendations[i]?.platform_card;

  test('every campaign that should serve is dark → ONE account card, read-only', () => {
    const r = evaluate(
      google({
        delivery: [
          camp('c1', { budget_per_day: 800 }),
          camp('c2', { budget_per_day: 700, dark_days: 7 }),
          camp('c3', {
            primary_status: 'LIMITED',
            primary_status_reasons: ['MISSING_LEAD_FORM_EXTENSION'],
            budget_per_day: 700,
            dark_days: 14,
          }),
          camp('v1', {
            primary_status: 'ENDED',
            primary_status_reasons: ['CAMPAIGN_ENDED'],
            serving_status: 'ENDED',
            budget_per_day: null,
            dark_days: 0,
          }),
        ],
      }),
    );
    expect(rules(r)).toEqual(['G12']);
    const rec = r.recommendations[0]!;
    expect(rec.action).toBeNull();
    expect(rec.severity).toBe('high');
    expect(rec.subject_key).toBe('delivery_account');
    expect(rec.entity.id).toBe('c1');
    expect(card(r)).toEqual({
      variant: 'google_delivery_issue',
      campaign_name: 'Campaign c1',
      reasons: ['SERVING_STATUS_SUSPENDED', 'MISSING_LEAD_FORM_EXTENSION'],
      dark_days: 7,
      currency: 'MXN',
      budget_per_day: 2200,
      disapproved_ads: 0,
      account_wide: true,
    });
    expect(rec.reason).toContain('3 campaigns');
    expect(rec.reason).toContain('$2,200 MXN/day');
  });

  test('one dark campaign beside one that serves → a card for that campaign only', () => {
    const r = evaluate(
      google({
        delivery: [
          camp('c1', {
            serving_status: 'SERVING',
            primary_status_reasons: ['HAS_ADS_DISAPPROVED'],
            dark_days: 5,
          }),
          camp('c2', { serving_status: 'SERVING', dark_days: 0 }),
        ],
      }),
    );
    expect(rules(r)).toEqual(['G12']);
    expect(r.recommendations[0]!.entity.id).toBe('c1');
    expect(r.recommendations[0]!.subject_key).toBe('delivery');
    const c = card(r);
    expect(c?.variant === 'google_delivery_issue' && c.account_wide).toBe(false);
    expect(c?.variant === 'google_delivery_issue' && c.reasons).toEqual(['HAS_ADS_DISAPPROVED']);
  });

  test('a serving campaign with a DISAPPROVED ad → card quoting the policy topic; APPROVED_LIMITED alone → none', () => {
    const r = evaluate(
      google({
        delivery: [
          camp('c1', {
            serving_status: 'SERVING',
            dark_days: 0,
            disapproved_ads: [
              { ad_id: 'a1', approval_status: 'DISAPPROVED', topics: ['DESTINATION_NOT_WORKING'] },
              { ad_id: 'a2', approval_status: 'APPROVED_LIMITED', topics: ['ALCOHOL'] },
            ],
          }),
          camp('c2', {
            serving_status: 'SERVING',
            dark_days: 0,
            disapproved_ads: [
              { ad_id: 'a3', approval_status: 'APPROVED_LIMITED', topics: ['ALCOHOL'] },
            ],
          }),
        ],
      }),
    );
    expect(rules(r)).toEqual(['G12']);
    expect(r.recommendations[0]!.severity).toBe('medium');
    expect(card(r)).toMatchObject({
      campaign_name: 'Campaign c1',
      reasons: ['DESTINATION_NOT_WORKING'],
      disapproved_ads: 1,
      dark_days: 0,
      account_wide: false,
    });
  });

  test('dark under 3 days, or no budget → nothing', () => {
    const r = evaluate(
      google({
        delivery: [
          camp('c1', { dark_days: 2, serving_status: 'SERVING' }),
          camp('c2', { dark_days: 0, serving_status: 'SERVING' }),
        ],
      }),
    );
    expect(rules(r)).toEqual([]);
  });

  test('dark with no reason Google names → abstains by name, no card', () => {
    const r = evaluate(
      google({
        delivery: [
          camp('c1', { serving_status: 'SERVING', dark_days: 4 }),
          camp('c2', { serving_status: 'SERVING', dark_days: 0 }),
        ],
      }),
    );
    expect(rules(r)).toEqual([]);
    expect(r.abstentions.some((a) => a.rule === 'G12' && a.entityId === 'c1')).toBe(true);
  });

  test('a campaign the cycle’s D2 already carries → no second card', () => {
    const signals = google({
      delivery: [
        camp('c1', {
          serving_status: 'SERVING',
          primary_status_reasons: ['HAS_ADS_DISAPPROVED'],
          dark_days: 5,
        }),
        camp('c2', { serving_status: 'SERVING', dark_days: 0 }),
      ],
    });
    const r = evaluate(signals, ctx({ d2EntityIds: new Set(['c1']) }));
    expect(rules(r)).toEqual([]);
    expect(r.abstentions.find((a) => a.rule === 'G12')?.reason).toContain('D2');
    const all = evaluate(
      google({ delivery: [camp('c1'), camp('c2')] }),
      ctx({ d2EntityIds: new Set(['c1', 'c2']) }),
    );
    expect(rules(all)).toEqual([]);
  });

  test('signals recorded before wave 9 (no delivery) → nothing new', () => {
    expect(evaluate(google({}))).toEqual({
      recommendations: [],
      abstentions: [],
      comparisonExclusions: [],
    });
  });
});

describe('a dark account speaks once: the G12 account card stands alone', () => {
  type Delivery = NonNullable<NonNullable<PlatformSignals['google']>['delivery']>[number];
  const camp = (id: string, over: Partial<Delivery> = {}): Delivery => ({
    campaign_id: id,
    campaign_name: `Campaign ${id}`,
    primary_status: 'ELIGIBLE',
    primary_status_reasons: [],
    serving_status: 'SUSPENDED',
    budget_per_day: 100,
    dark_days: 30,
    disapproved_ads: [],
    ...over,
  });
  const coverage = {
    asset_group_id: 'ag1',
    campaign_id: 'c1',
    name: 'Group 1',
    ad_strength: 'AVERAGE' as const,
    primary_status: 'ELIGIBLE',
    missing: ['3 headlines'],
  };
  const suppressed = (r: PlatformSignalsEvaluation) =>
    r.abstentions.filter((a) => a.suppressedBy === 'G12');

  test('Easy Fit 2026 as read live on 2026-10-06: ONE G12 card, GA1 EASY’s coverage held back by name', () => {
    const recorded = loadFixture<PlatformSignals>('google-easyfit2026-signals-dark.json');
    const signals = PlatformSignalsSchema.parse(recorded.data);
    const pmax = googleCampaign('easyfit2026', '24298408295').snapshot;
    const r = evaluate(
      signals,
      ctx({ cpaTarget: { amount: 200, currency: 'MXN' }, snapshots: [pmax] }),
    );
    expect(rules(r)).toEqual(['G12']);
    const rec = r.recommendations[0]!;
    expect(rec.subject_key).toBe('delivery_account');
    expect(
      rec.platform_card.variant === 'google_delivery_issue' && rec.platform_card.account_wide,
    ).toBe(true);
    const held = suppressed(r);
    expect(held.map((a) => `${a.rule}:${a.entityId}`)).toEqual(['G18_pmax_coverage:24298408295']);
    expect(held[0]!.reason).toContain('GA1 EASY');
    expect(held[0]!.reason).toContain('whole account');
  });

  test('every per-entity finding on an all-dark account is held back, each by name, never silently', () => {
    const r = evaluate(
      google({
        delivery: [camp('c1'), camp('c2', { dark_days: 7 })],
        search_terms: [term('gym barato', 150)],
        keywords: [
          keyword('k1', 'gym'),
          keyword('k2', 'gimnasio caro', { quality_score: 2, totals: totals(200) }),
        ],
        asset_groups: [coverage],
      }),
    );
    expect(rules(r)).toEqual(['G12']);
    expect(
      suppressed(r)
        .map((a) => a.rule)
        .sort(),
    ).toEqual(['G05', 'G11', 'G18_pmax_coverage']);
    for (const a of suppressed(r)) expect(a.entityId).not.toBeNull();
  });

  test('a partially dark account keeps every card: the dark campaign’s G12 beside the rest', () => {
    const r = evaluate(
      google({
        delivery: [camp('c1'), camp('c2', { serving_status: 'SERVING', dark_days: 0 })],
        asset_groups: [coverage],
      }),
    );
    expect(rules(r).sort()).toEqual(['G12', 'G18_pmax_coverage']);
    expect(suppressed(r)).toEqual([]);
  });

  test('an all-dark account whose campaigns D2 already carries → no G12, so nothing is held back', () => {
    const r = evaluate(
      google({ delivery: [camp('c1'), camp('c2')], asset_groups: [coverage] }),
      ctx({ d2EntityIds: new Set(['c1', 'c2']) }),
    );
    expect(rules(r)).toEqual(['G18_pmax_coverage']);
    expect(suppressed(r)).toEqual([]);
  });
});

describe('T11 TikTok delivery issue', () => {
  type Delivery = NonNullable<NonNullable<PlatformSignals['tiktok']>['delivery']>[number];
  const group = (id: string, over: Partial<Delivery> = {}): Delivery => ({
    ad_group_id: id,
    ad_group_name: `Group ${id}`,
    secondary_status: 'ADGROUP_STATUS_BALANCE_EXCEED',
    budget_per_day: 250,
    dark_days: 6,
    rejected_ads: [],
    ...over,
  });

  test('a dark ad group → card with TikTok’s status, read-only', () => {
    const r = evaluate(tiktok({ delivery: [group('ag1')] }), ctx({ snapshots: [] }));
    expect(rules(r)).toEqual(['T11']);
    expect(r.recommendations[0]!.action).toBeNull();
    expect(r.recommendations[0]!.severity).toBe('high');
    expect(r.recommendations[0]!.platform_card).toEqual({
      variant: 'tiktok_delivery_issue',
      ad_group_name: 'Group ag1',
      secondary_status: 'ADGROUP_STATUS_BALANCE_EXCEED',
      dark_days: 6,
      rejected_ads: [],
    });
  });

  test('a refused ad in a delivering ad group → card with the review reason and suggestion', () => {
    const r = evaluate(
      tiktok({
        delivery: [
          group('ag1', {
            secondary_status: 'ADGROUP_STATUS_DELIVERY_OK',
            dark_days: 0,
            rejected_ads: [
              { ad_id: 'a1', reasons: ['Misleading claims'], suggestion: 'Remove the promise.' },
            ],
          }),
        ],
      }),
      ctx({ snapshots: [] }),
    );
    expect(rules(r)).toEqual(['T11']);
    expect(r.recommendations[0]!.severity).toBe('medium');
    expect(r.recommendations[0]!.reason).toContain('Remove the promise.');
  });

  test('paused by the advertiser, delivering, or already carried by D2 → no card', () => {
    const r = evaluate(
      tiktok({
        delivery: [
          group('ag1', { secondary_status: 'ADGROUP_STATUS_DISABLE' }),
          group('ag2', { secondary_status: 'ADGROUP_STATUS_DELIVERY_OK', dark_days: 0 }),
          group('ag3'),
        ],
      }),
      ctx({ snapshots: [], d2EntityIds: new Set(['ag3']) }),
    );
    expect(rules(r)).toEqual([]);
    expect(r.abstentions.some((a) => a.rule === 'T11' && a.entityId === 'ag3')).toBe(true);
  });
});
