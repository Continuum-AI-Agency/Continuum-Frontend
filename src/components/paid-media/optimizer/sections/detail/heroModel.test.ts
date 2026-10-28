import { describe, expect, it } from 'bun:test';
import {
  type CycleRunReport,
  getOptimizationMetricDefinition,
  type PortfolioListItem,
  type PortfolioMetrics,
  PortfolioMetricsSchema,
  type RangeSpec,
  resolveRange,
} from '@continuum/contracts';
import formularios from '../../__fixtures__/optimizer-status-formularios.json';
import { parseReport } from '../../reportModel';
import { portfolioMetricsFixture } from '../attribution/__fixtures__/portfolioMetricsFixture';
import { portfolioFigureFromReads } from '../portfolioFigure';
import { buildPortfolioHeadline, segmentText } from './headlineModel';
import {
  buildHeroView,
  crossPlatformRead,
  ctaForCandidate,
  heroMetricsWindow,
  isQueueRowKey,
  queueRowKeyFor,
} from './heroModel';
import { buildPortfolioNews } from './news/newsModel';
import { buildRecap } from './recapModel';
import type { PortfolioMetricsState } from './usePortfolioMetrics';

const metric = {
  kpiField: 'leads',
  resultLabel: 'Leads',
  costLabel: 'Cost per lead',
  targetLabel: 'CPL',
  denominatorMultiplier: 1,
} as never;
const recap = {
  source: 'daily',
  windowUsed: null,
  current: {
    spend: 3640,
    results: 47,
    impressions: 0,
    clicks: 0,
    costPerResult: 77.45,
    daysCovered: 7,
  },
  previous: {
    spend: 3000,
    results: 35,
    impressions: 0,
    clicks: 0,
    costPerResult: 85.7,
    daysCovered: 7,
  },
  series: [
    { date: '2026-09-13', spend: 500, results: 6 },
    { date: '2026-09-14', spend: 520, results: 7 },
  ],
  delta: { spend: 0.21, results: 0.34, costPerResult: -0.1 },
  vsTarget: 0.11,
} as never;
const portfolio = { id: 'p1', apply_mode: 'recommend', daily_total: 500 } as never;
const rec = {
  id: '2f1c1c1e-0000-4000-8000-000000000001',
  adset_id: 'as-3',
  adset_name: 'Dead',
  kind: 'pause',
  trigger: 'P1_zero_upper_funnel',
  severity: 'high',
  reason: 'No leads in 7 days.',
  status: 'pending',
  evidence: {
    metric: 'conversions',
    value: 0,
    comparator: '=',
    threshold: 1,
    window: 'd7',
    estImpactPerDay: 120,
    source: 'engine',
  },
  seed: null,
};

/** The row the engine synthesises for a portfolio with NO declared flight: nothing was
 *  planned, so there is nothing to be on or off track of. */
const pacingWithoutAFlight = {
  dailyTotal: 500,
  idealCumulative: 0,
  pacingRatio: 1,
  status: 'on_track',
  note: 'No pacing state: using the provided total.',
  source: 'observed',
};

/** A real flight far enough in for the plan to have expected spend. */
const pacingFromAFlight = {
  dailyTotal: 500,
  idealCumulative: 3500,
  pacingRatio: 1.04,
  status: 'overpacing',
  note: 'Ahead of plan.',
  source: 'pacing',
  periodBudget: 15000,
  periodDays: 30,
  dayIndex: 7,
  actualSpendToDate: 3640,
};

describe('buildHeroView', () => {
  it('composes the fallback from the report when no brief is stored', () => {
    const view = buildHeroView({
      report: {
        portfolio: null,
        latest_run: { id: 'run1', cycle_ts: '2026-09-19T06:10:00Z' } as never,
        latest_items: [],
        recommendations: [rec as never],
        history: [],
      },
      recap,
      flightPacing: { kind: 'no_flight' },
      metric,
      currency: 'USD',
      portfolio,
      target: 70,
      window: 'd7',
      firstCycle: false,
    });
    expect(view.source).toBe('fallback');
    expect(view.brief.growth).toMatchObject({ spend: 3640, results: 47, cost_per_result: 77.45 });
    expect(view.brief.hero).toMatchObject({ module: 'pause', impact_per_day: 120 });
    expect(view.cta).toEqual({
      kind: 'queue_row',
      rowKey: 'rec:2f1c1c1e-0000-4000-8000-000000000001',
      label: 'Review the pause',
    });
  });
  it('uses the stored brief when it belongs to the latest run, and points observe mode at Manage', () => {
    const stored = {
      version: 1,
      growth: {
        spend: 1,
        results: 1,
        cost_per_result: null,
        target: null,
        deltas: { spend: null, results: null, cost_per_result: null },
        pacing: { status: null, ratio: null, note: null },
        scale: null,
        window: 'd7',
        as_of: 'x',
        currency: 'USD',
        result_label: 'leads',
      },
      hero: {
        module: 'audience',
        candidate_id: 'rec:a',
        headline: 'Open a new audience beside Warm',
        why: 'w',
        impact_per_day: 90,
        impact_unit: 'currency',
        impact_basis: 'b',
        justification: null,
        confidence_note: null,
        cta: { kind: 'audience_card', target_id: 'prop-1' },
      },
      growth_sentence: 'g',
      candidates: [
        {
          id: 'rec:a',
          module: 'audience',
          kind: 'audience_expand',
          trigger: null,
          adset_id: 'as-2',
          adset_name: 'Warm',
          impact_per_day: 90,
          impact_unit: 'currency',
          results_per_day: null,
          impact_basis: 'b',
          reason: null,
          cta: { kind: 'audience_card', target_id: 'prop-1' },
        },
      ],
      secondary: [],
      prompt_version: 'v1',
      model: 'gemini-2.5-flash',
      generated_at: '2026-09-19T06:15:00Z',
    };
    const report = {
      portfolio: null,
      latest_run: { id: 'run1', cycle_ts: '2026-09-19T06:10:00Z' } as never,
      latest_items: [],
      recommendations: [],
      history: [],
      hero_brief: {
        id: '2f1c1c1e-0000-4000-8000-000000000009',
        portfolio_id: '2f1c1c1e-0000-4000-8000-000000000002',
        brand_id: '2f1c1c1e-0000-4000-8000-000000000003',
        cycle_run_id: 'run1',
        utc_day: '2026-09-19',
        status: 'ready',
        brief: stored,
        created_at: 'x',
        updated_at: 'x',
      } as never,
    };
    const view = buildHeroView({
      report,
      recap,
      flightPacing: { kind: 'no_flight' },
      metric,
      currency: 'USD',
      portfolio,
      target: 70,
      window: 'd7',
      firstCycle: false,
      now: '2030-01-01T00:00:00Z',
    });
    expect(view.source).toBe('brief');
    expect(view.cta).toEqual({
      kind: 'audience_card',
      rowKey: 'rec:a',
      label: 'Open the audience proposal',
    });
    const observe = buildHeroView({
      report,
      recap,
      flightPacing: { kind: 'no_flight' },
      metric,
      currency: 'USD',
      portfolio: { ...(portfolio as object), apply_mode: 'observe' } as never,
      target: 70,
      window: 'd7',
      firstCycle: false,
    });
    expect(observe.cta?.kind).toBe('manage');
  });
  it('reports no pacing verdict when the engine had no flight to measure against', () => {
    const view = buildHeroView({
      report: {
        portfolio: null,
        latest_run: {
          id: 'run1',
          cycle_ts: '2026-09-19T06:10:00Z',
          pacing: pacingWithoutAFlight,
        } as never,
        latest_items: [],
        recommendations: [rec as never],
        history: [],
      },
      recap,
      flightPacing: { kind: 'no_flight' },
      metric,
      currency: 'USD',
      portfolio,
      target: 70,
      window: 'd7',
      firstCycle: false,
    });
    expect(view.source).toBe('fallback');
    expect(view.brief.growth.pacing.status).toBeNull();
    expect(view.brief.growth.pacing.ratio).toBeNull();
    // The reason for the absence survives; only the invented verdict is dropped.
    expect(view.brief.growth.pacing.note).toBe('No pacing state: using the provided total.');
    expect(view.brief.growth_sentence).not.toContain('on track');
    expect(view.brief.growth_sentence).toContain('over target');
  });

  it('keeps the verdict when the engine measured it against a real flight', () => {
    const view = buildHeroView({
      report: {
        portfolio: null,
        latest_run: {
          id: 'run1',
          cycle_ts: '2026-09-19T06:10:00Z',
          pacing: pacingFromAFlight,
        } as never,
        latest_items: [],
        recommendations: [rec as never],
        history: [],
      },
      recap,
      flightPacing: { kind: 'no_flight' },
      metric,
      currency: 'USD',
      portfolio,
      target: 70,
      window: 'd7',
      firstCycle: false,
    });
    expect(view.brief.growth.pacing).toEqual({
      status: 'overpacing',
      ratio: 1.04,
      note: 'Ahead of plan.',
    });
    expect(view.brief.growth_sentence).toContain('overpacing');
  });
});

describe('a stored brief is read against the run it came from', () => {
  /** Easy Fit, FORMULARIOS // TODOS, 2026-09-22 — the stored brief verbatim on the parts
   *  that matter: a Backend from before `pacingVerdict` wrote the fallback row through as a
   *  verdict, and the model wrote the words it was given. */
  const storedWithInventedVerdict = {
    version: 1,
    growth: {
      spend: 3594.41,
      results: 78,
      cost_per_result: 46.08,
      target: 35,
      deltas: { spend: null, results: null, cost_per_result: null },
      pacing: { status: 'on_track', ratio: 1, note: 'No pacing state: using the provided total.' },
      scale: null,
      window: 'd14',
      as_of: '2026-09-22T19:01:37Z',
      currency: 'MXN',
      result_label: 'leads',
    },
    hero: {
      module: 'pause',
      candidate_id: 'rec:aleira',
      headline: 'Stop 28.68/day going to ALEIRA // AGOSTO - LKL with no leads',
      why: 'w',
      impact_per_day: 28.68,
      impact_unit: 'currency',
      impact_basis: 'b',
      justification: null,
      confidence_note: null,
      cta: { kind: 'queue_row', target_id: 'rec:aleira' },
    },
    growth_sentence:
      'Over the last 14 days, the portfolio spent 3594.41 to acquire 78 leads at a cost of 46.08 per lead, which is above the 35 target, and is on track.',
    candidates: [
      {
        id: 'rec:aleira',
        module: 'pause',
        kind: 'pause',
        trigger: null,
        adset_id: 'as-1',
        adset_name: 'ALEIRA // AGOSTO - LKL',
        impact_per_day: 28.68,
        impact_unit: 'currency',
        results_per_day: null,
        impact_basis: 'b',
        reason: null,
        cta: { kind: 'queue_row', target_id: 'rec:aleira' },
      },
    ],
    secondary: [],
    prompt_version: 'v1',
    model: 'gemini-2.5-flash',
    generated_at: '2026-09-22T19:05:00Z',
  };
  const reportWith = (pacing: unknown) => ({
    portfolio: null,
    latest_run: { id: 'run1', cycle_ts: '2026-09-22T19:01:37Z', pacing } as never,
    latest_items: [],
    recommendations: [],
    history: [],
    hero_brief: {
      id: '2f1c1c1e-0000-4000-8000-000000000009',
      portfolio_id: '2f1c1c1e-0000-4000-8000-000000000002',
      brand_id: '2f1c1c1e-0000-4000-8000-000000000003',
      cycle_run_id: 'run1',
      utc_day: '2026-09-22',
      status: 'ready',
      brief: storedWithInventedVerdict,
      created_at: 'x',
      updated_at: 'x',
    } as never,
  });
  const build = (pacing: unknown) =>
    buildHeroView({
      report: reportWith(pacing),
      recap,
      flightPacing: { kind: 'no_flight' },
      metric,
      currency: 'MXN',
      portfolio,
      target: 35,
      window: 'd14',
      firstCycle: false,
      now: '2030-01-01T00:00:00Z',
    });

  it('drops the verdict and its clause when the run had no flight to measure against', () => {
    const view = build(pacingWithoutAFlight);
    expect(view.source).toBe('brief');
    expect(view.brief.growth.pacing.status).toBeNull();
    expect(view.brief.growth.pacing.note).toBe('No pacing state: using the provided total.');
    expect(view.brief.growth_sentence).toBe(
      'Over the last 14 days, the portfolio spent 3594.41 to acquire 78 leads at a cost of 46.08 per lead, which is above the 35 target.',
    );
  });

  it('keeps the words when the run measured a real flight', () => {
    const view = build(pacingFromAFlight);
    expect(view.brief.growth.pacing.status).toBe('overpacing');
    expect(view.brief.growth_sentence).toContain('and is on track');
  });
});

describe('the real FORMULARIOS // TODOS body — a pause that bought 8 leads', () => {
  // Anonymised production body. The hero pauses "Ad set A" (production: ITESO // AGOSTO -
  // RTG): 8 leads over 14 days at 75.65 each against a 35 target, engine interval 38.39 to
  // 175.24. Its brief candidate says `results_per_day: null`, and the screen drew "no
  // results to divide by" under "43.23 a day buying nothing".
  const build = () => {
    const report = parseReport(formularios as unknown as CycleRunReport);
    const view = buildHeroView({
      report,
      recap: {
        ...(recap as object),
        series: [
          { date: '2026-09-24', spend: 280, results: 6 },
          { date: '2026-09-25', spend: 289, results: 7 },
        ],
      } as never,
      flightPacing: null,
      metric: getOptimizationMetricDefinition('lead'),
      currency: 'MXN',
      portfolio: (formularios as { portfolio: unknown }).portfolio as never,
      target: 35,
      window: 'd14',
      firstCycle: false,
    });
    return { report, view };
  };

  it('hands the cards the cycle’s evidence: the daily series and the recommendations', () => {
    const { view } = build();
    expect(view.brief.hero.headline).toContain('Ad set A');
    expect(view.series?.length).toBe(2);
    expect(view.recommendations?.map((rec) => rec.evidence?.metric).sort()).toEqual([
      'cpp',
      'ctr',
      'spend',
    ]);
  });

  it('the lead card draws its cost against the reference, never "bought nothing"', () => {
    const { report, view } = build();
    const news = buildPortfolioNews({ view, items: report?.latest_items ?? [], target: 35 });
    expect(news.lead?.visual.kind).toBe('cost_vs_reference');
  });

  it('draws the zero-conversion ad set (Ad set B) as spend that bought nothing', () => {
    const { report, view } = build();
    const news = buildPortfolioNews({ view, items: report?.latest_items ?? [], target: 35 });
    const dead = news.insights.find((card) => card.claim.includes('Ad set B'));
    expect(dead?.visual.kind).toBe('spend_blocks');
  });
});

// The one resolver both the hero card and the asked-for rows use for where a CTA lands.
describe('queueRowKeyFor', () => {
  it('accepts only the two keys buildActionQueue mints', () => {
    expect(isQueueRowKey('rec:abc')).toBe(true);
    expect(isQueueRowKey('budget:120210')).toBe(true);
    expect(isQueueRowKey('prop-1')).toBe(false);
    expect(isQueueRowKey('audience:prop-1')).toBe(false);
    expect(isQueueRowKey('rec:')).toBe(false);
    expect(isQueueRowKey(null)).toBe(false);
  });

  it("takes the CTA's own target when it already is a row key", () => {
    expect(queueRowKeyFor({ kind: 'queue_row', target_id: 'budget:120210' })).toBe('budget:120210');
    expect(queueRowKeyFor({ kind: 'audience_card', target_id: 'rec:abc' })).toBe('rec:abc');
  });

  it('resolves a bare proposal id through the candidate, then the handoff — never as itself', () => {
    const cta = { kind: 'audience_card' as const, target_id: 'prop-1' };
    expect(queueRowKeyFor(cta, { candidateId: 'rec:a' })).toBe('rec:a');
    expect(queueRowKeyFor(cta, { candidateId: 'audience:prop-1', recommendationId: 'r1' })).toBe(
      'rec:r1',
    );
    expect(queueRowKeyFor(cta)).toBeNull();
    expect(
      queueRowKeyFor({ kind: 'manage', target_id: null }, { candidateId: 'rec:a' }),
    ).toBeNull();
  });
});

describe('ctaForCandidate', () => {
  it('names Manage when the target cannot land on any row, instead of a button that focuses nothing', () => {
    expect(
      ctaForCandidate(
        {
          id: 'audience:prop-1',
          module: 'audience',
          cta: { kind: 'audience_card', target_id: 'prop-1' },
        },
        false,
      ),
    ).toEqual({ kind: 'manage', rowKey: null, label: 'Open Manage' });
  });

  it('lands an audience card on its recommendation row', () => {
    expect(
      ctaForCandidate(
        { id: 'rec:a', module: 'audience', cta: { kind: 'audience_card', target_id: 'prop-1' } },
        false,
      ),
    ).toEqual({ kind: 'audience_card', rowKey: 'rec:a', label: 'Open the audience proposal' });
  });
});

// G8 deep test, F16. Easy Fit's Google portfolio at the 14-day range: the page's By platform
// read said $4,332 MXN / 176 leads while the hero said "0 leads in 14 days, no spend. Blocked:
// zero delivery". The hero priced its recap — the Meta account snapshots summed over the Meta
// roster, both empty for a portfolio of Google campaigns — because the figure from the metrics
// read (every platform) was computed at the default 7 days only. The window below, Oct 8–21,
// ends before the account's Oct 25 suspension; the totals are the ones G8 read on the page.
describe('F16 — a Google portfolio’s hero reads every platform for the range, or says it cannot', () => {
  const TODAY = '2026-10-22';
  const NOW = Date.parse('2026-10-22T15:00:00Z');
  const lead = getOptimizationMetricDefinition('lead');
  const easyFitGoogle = {
    id: 'f16-easy-fit-google',
    name: 'Easy Fit — Google',
    objective: 'lead',
    target_metric: null,
    cpa_target: 35,
    platforms: ['google_ads'],
    apply_mode: 'recommend',
    daily_total: 320,
    last_actual_cycle_at: '2026-10-22T06:00:00Z',
    period_start: null,
    period_end: null,
  } as unknown as PortfolioListItem;
  const metaOnly = { ...easyFitGoogle, id: 'f16-meta', platforms: ['meta'] } as PortfolioListItem;
  const cycle = {
    portfolio: null,
    latest_run: { id: 'run-f16', cycle_ts: '2026-10-22T06:00:00Z' } as never,
    latest_items: [],
    recommendations: [],
    history: [],
  };

  /** optimizer_get_portfolio_metrics at d14: Google alone, 4,332 MXN for 176 leads. */
  function googleRead14(): PortfolioMetrics {
    const base = portfolioMetricsFixture({ platforms: ['google_ads'] });
    const google = { spend: 4332, results: 176, conversions: 176, cost_per_result: 4332 / 176 };
    return PortfolioMetricsSchema.parse({
      ...base,
      window: { since: '2026-10-08', until: '2026-10-21', label: 'd14', ends_yesterday: false },
      totals: { ...base.totals, ...google },
      by_platform: base.by_platform.map((row) => ({ ...row, ...google })),
      conversions_by_source: base.conversions_by_source.map((row) => ({
        ...row,
        conversions: 176,
      })),
    });
  }

  /** The workspace's hero path for one range and one state of the metrics read. */
  function hero(
    spec: RangeSpec,
    metrics: PortfolioMetricsState,
    portfolio: PortfolioListItem = easyFitGoogle,
  ) {
    const range = resolveRange(spec, portfolio, TODAY);
    const window = heroMetricsWindow(range);
    const crossPlatform = crossPlatformRead({ portfolio, window, metrics });
    const figure =
      crossPlatform && window
        ? portfolioFigureFromReads({
            portfolio,
            snapshots: [],
            readAt: null,
            memberIds: [],
            series: [],
            metrics: metrics.status === 'ready' ? metrics.metrics : null,
            now: NOW,
          })
        : null;
    // The Meta read: no Meta snapshot holds a Google campaign, and the Meta roster is empty.
    const recap = buildRecap({ snapshots: [], enrolledIds: [], range, metric: lead, target: 35 });
    const currency = figure?.currency ?? 'MXN';
    const view = buildHeroView({
      report: cycle,
      recap,
      flightPacing: null,
      metric: lead,
      currency,
      portfolio,
      target: 35,
      window: range.window,
      firstCycle: false,
      figure,
      crossPlatform,
      now: '2026-10-22T15:00:00Z',
    });
    const headline = buildPortfolioHeadline({
      view,
      report: cycle,
      portfolio,
      metric: lead,
      currency,
      mismatch: null,
      now: NOW,
    });
    return { view, headline, status: headline.status.map(segmentText).join('') };
  }

  const d14: RangeSpec = { kind: 'preset', preset: 'd14' };
  const ready = (metrics: PortfolioMetrics): PortfolioMetricsState => ({
    status: 'ready',
    metrics,
  });

  it('14 days: 176 leads at $24.61 MXN from the 14-day metrics read, $4,332 MXN spent, no blocker', () => {
    const { view, headline, status } = hero(d14, ready(googleRead14()));
    expect(view.unread).toBeNull();
    expect(view.brief.growth).toMatchObject({
      spend: 4332,
      results: 176,
      window: 'd14',
      currency: 'MXN',
    });
    expect(status).toBe('176 leads in 14 days at $24.61 MXN, 30% under the target of $35.00 MXN.');
    expect(headline.tiles.find((tile) => tile.key === 'spend')?.value).toBe('$4,332 MXN');
    expect(headline.blocker).toBeNull();
    // A stored read, dated by the day after its window.
    expect(view.figure).toMatchObject({ source: 'snapshot', asOfLabel: 'as of Oct 22' });
  });

  it('the page state G8 saw: the Meta recap alone is what said "no spend" and "zero delivery"', () => {
    const range = resolveRange(d14, easyFitGoogle, TODAY);
    const view = buildHeroView({
      report: cycle,
      recap: buildRecap({ snapshots: [], enrolledIds: [], range, metric: lead, target: 35 }),
      flightPacing: null,
      metric: lead,
      currency: 'MXN',
      portfolio: easyFitGoogle,
      target: 35,
      window: range.window,
      firstCycle: false,
    });
    const headline = buildPortfolioHeadline({
      view,
      report: cycle,
      portfolio: easyFitGoogle,
      metric: lead,
      currency: 'MXN',
      mismatch: null,
      now: NOW,
    });
    expect(headline.status.map(segmentText).join('')).toBe('0 leads in 14 days, no spend.');
    expect(headline.blocker?.code).toBe('zero_delivery');
  });

  it('30 days reads the 14-day window — the widest the hero’s growth carries — never the recap', () => {
    const { view, headline } = hero({ kind: 'preset', preset: 'd30' }, ready(googleRead14()));
    expect(view.brief.growth).toMatchObject({ spend: 4332, results: 176, window: 'd14' });
    expect(headline.days).toBe(14);
    expect(headline.blocker).toBeNull();
  });

  const noClaim = (status: string, headline: ReturnType<typeof hero>['headline']) => {
    expect(status).not.toMatch(/no spend/i);
    expect(headline.blocker).toBeNull();
    // Spend, results and cost would print the placeholder zeros; only the decisions stay.
    expect(headline.tiles.map((tile) => tile.key)).toEqual(['decisions']);
  };

  it('a range no read covers (3 days, a custom range): says so, never "no spend" or "zero delivery"', () => {
    for (const spec of [
      { kind: 'preset', preset: 'd3' },
      { kind: 'custom', from: '2026-10-01', to: '2026-10-20' },
    ] as RangeSpec[]) {
      // The workspace still reads d7 there, so the platforms are known.
      const { view, headline, status } = hero(
        spec,
        ready(portfolioMetricsFixture({ platforms: ['google_ads'] })),
      );
      expect(view.unread?.reason).toBe('unavailable');
      expect(status).toBe(
        "Spend and leads for this range aren't available for a portfolio on Google Ads. Pick 7 or 14 days.",
      );
      noClaim(status, headline);
    }
  });

  it('the 14-day read still loading: the pending sentence, never a zero', () => {
    const { view, headline, status } = hero(d14, { status: 'loading' });
    expect(view.unread?.reason).toBe('pending');
    expect(status).toBe('Reading spend and leads across Google Ads…');
    noClaim(status, headline);
  });

  it('the 14-day read failed, is not deployed, or there is no cycle yet: not available, never a zero', () => {
    const cases: Array<[PortfolioMetricsState, PortfolioListItem]> = [
      [{ status: 'error' }, easyFitGoogle],
      [{ status: 'unavailable' }, easyFitGoogle],
      [
        ready(googleRead14()),
        { ...easyFitGoogle, last_actual_cycle_at: null } as PortfolioListItem,
      ],
    ];
    for (const [metrics, portfolio] of cases) {
      const { view, headline, status } = hero(d14, metrics, portfolio);
      expect(view.unread?.reason).toBe('unavailable');
      expect(status).toBe(
        "Spend and leads for this range aren't available yet for a portfolio on Google Ads.",
      );
      noClaim(status, headline);
    }
  });

  it('a Meta-only portfolio is unchanged: its recap is the whole of it, and a zero is zero delivery', () => {
    const { view, headline, status } = hero(
      d14,
      ready(portfolioMetricsFixture({ platforms: ['meta'] })),
      metaOnly,
    );
    expect(view.unread).toBeNull();
    expect(status).toBe('0 leads in 14 days, no spend.');
    expect(headline.blocker?.code).toBe('zero_delivery');
    expect(segmentText(headline.blocker?.sentence[0] ?? '')).toBe(
      'Blocked: zero delivery, nothing spent in 14 days.',
    );
  });
});

describe('heroMetricsWindow', () => {
  const flight = { period_start: '2026-10-01', period_end: '2026-10-31' };
  const at = (spec: RangeSpec, fields = {}) =>
    heroMetricsWindow(resolveRange(spec, fields, '2026-10-22'));
  it('reads the trailing presets at the hero window; nothing for 3 days, a flight or custom dates', () => {
    expect(at({ kind: 'preset', preset: 'd3' })).toBeNull();
    expect(at({ kind: 'preset', preset: 'd7' })).toBe('d7');
    expect(at({ kind: 'preset', preset: 'd14' })).toBe('d14');
    expect(at({ kind: 'preset', preset: 'd30' })).toBe('d14');
    expect(at({ kind: 'preset', preset: 'flight' }, flight)).toBeNull();
    // No flight set: the range falls back to the default 7 days, and so does the read.
    expect(at({ kind: 'preset', preset: 'flight' })).toBe('d7');
    expect(at({ kind: 'custom', from: '2026-10-08', to: '2026-10-21' })).toBeNull();
  });
});
