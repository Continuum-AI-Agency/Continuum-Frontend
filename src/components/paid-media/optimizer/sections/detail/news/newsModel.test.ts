import { describe, expect, it } from 'bun:test';
import type { CycleItemRow, PortfolioBrief } from '@continuum/contracts';
import type { HeroView } from '../heroModel';
import type { NewsCardModel } from './justification';
import { pickJustification } from './justification';
import { buildPortfolioNews, capFor, headlineFor, intervalFor } from './newsModel';

type BriefCandidate = PortfolioBrief['candidates'][number];

const candidate = (over: Partial<BriefCandidate> = {}): BriefCandidate => ({
  id: 'budget:as-1',
  module: 'budget',
  kind: 'budget_move',
  trigger: null,
  adset_id: 'as-1',
  adset_name: 'Cold',
  impact_per_day: 14,
  impact_unit: 'currency',
  results_per_day: null,
  impact_basis: '2 budget moves this cycle',
  reason: null,
  cta: { kind: 'queue_row', target_id: 'budget:as-1' },
  ...over,
});

const item = (over: Partial<CycleItemRow> = {}): CycleItemRow => ({
  adset_id: 'as-1',
  adset_name: 'Cold',
  current_budget: 120,
  final_budget: 186,
  change_abs: 66,
  change_pct: 0.55,
  ...over,
});

const brief = (over: Partial<PortfolioBrief> = {}): PortfolioBrief => ({
  version: 1,
  growth: {
    spend: 3640,
    results: 47,
    cost_per_result: 77.45,
    target: 70,
    deltas: { spend: 0.21, results: 0.34, cost_per_result: -0.1 },
    pacing: { status: 'on_track', ratio: 1.01, note: null },
    scale: null,
    window: 'd7',
    as_of: '2026-09-19T06:10:00Z',
    currency: 'USD',
    result_label: 'leads',
  },
  hero: {
    module: 'budget',
    candidate_id: 'budget:as-1',
    headline: 'Move $66/day onto Cold, which buys leads cheaper.',
    why: 'Cold is 33% cheaper per lead than the portfolio average.',
    impact_per_day: 14,
    impact_unit: 'currency',
    impact_basis: '2 budget moves this cycle',
    justification: null,
    confidence_note: null,
    cta: { kind: 'queue_row', target_id: 'budget:as-1' },
  },
  growth_sentence: 'Leads +34% · cost per result -10%',
  candidates: [candidate()],
  secondary: [],
  prompt_version: 'v1',
  model: 'gemini-2.5-flash',
  generated_at: '2026-09-19T06:15:00Z',
  ...over,
});

const view = (over: Partial<HeroView> = {}): HeroView => ({
  state: 'ready',
  source: 'brief',
  chart: null,
  chartReading: null,
  tiles: [],
  pacingLine: null,
  pacingTone: 'muted',
  brief: brief(),
  cta: { kind: 'queue_row', rowKey: 'budget:as-1', label: 'Review the budget moves' },
  observe: false,
  asOf: '2026-09-19T06:10:00Z',
  ...over,
});

describe('headlineFor', () => {
  it('leads a budget move with the money that moved, and carries the pair', () => {
    expect(headlineFor(candidate(), item())).toEqual({
      kind: 'money',
      value: 66,
      unit: 'currency_per_day',
      label: 'a day moved onto it',
      from: 120,
      to: 186,
    });
  });

  it('says which direction the money went', () => {
    const down = headlineFor(candidate(), item({ change_abs: -40, final_budget: 80 }));
    expect(down?.label).toBe('a day moved off it');
    expect(down?.value).toBe(40);
  });

  it('declares nothing when the cycle row has no pair to show', () => {
    expect(headlineFor(candidate(), item({ current_budget: null }))).toBeNull();
    expect(headlineFor(candidate(), item({ change_abs: 0 }))).toBeNull();
    expect(headlineFor(candidate(), null)).toBeNull();
  });

  it('leads a pause that bought nothing with the spend it avoids', () => {
    const pause = candidate({
      id: 'rec:1',
      module: 'pause',
      kind: 'pause',
      impact_per_day: 120,
      results_per_day: 0,
    });
    expect(headlineFor(pause, null)).toEqual({
      kind: 'avoided',
      value: 120,
      unit: 'currency_per_day',
      label: 'a day buying nothing',
      from: null,
      to: null,
    });
  });

  it('will not call spend "avoided" on a pause that DID buy something', () => {
    const producing = candidate({
      module: 'pause',
      kind: 'pause',
      impact_per_day: 120,
      results_per_day: 0.4,
    });
    expect(headlineFor(producing, null)).toBeNull();
  });

  it('invents no figure for a creative or audience candidate', () => {
    expect(
      headlineFor(candidate({ module: 'creative', kind: 'variate_creative' }), null),
    ).toBeNull();
    expect(
      headlineFor(candidate({ module: 'audience', kind: 'audience_expand' }), null),
    ).toBeNull();
  });
});

describe('intervalFor', () => {
  it('passes the engine interval through, point estimate and all', () => {
    expect(
      intervalFor(item({ diagnostics: { ci: { lo: 96, hi: 190, cpa: 140, events: 12 } } }), 70),
    ).toEqual({ low: 96, high: 190, estimate: 140, referenceLabel: 'target', reference: 70 });
  });

  it('keeps the estimate null when the window bought nothing', () => {
    const open = intervalFor(
      item({ diagnostics: { ci: { lo: 96, hi: 192, cpa: 0, events: 0 } } }),
      70,
    );
    expect(open?.estimate).toBeNull();
  });

  it('refuses a range that is not a range', () => {
    expect(intervalFor(item({ diagnostics: { ci: { lo: 96, hi: 96 } } }), 70)).toBeNull();
    expect(intervalFor(item({ diagnostics: { ci: { lo: 96 } } }), 70)).toBeNull();
    expect(intervalFor(item(), 70)).toBeNull();
  });

  it('names no reference when the portfolio has no target', () => {
    const noTarget = intervalFor(
      item({ diagnostics: { ci: { lo: 96, hi: 190, cpa: 140, events: 12 } } }),
      null,
    );
    expect(noTarget?.referenceLabel).toBeNull();
  });
});

describe('capFor', () => {
  it('names the velocity band when the raw budget was clamped', () => {
    expect(capFor(item({ diagnostics: { rawBudget: 260, velocityCapped: 186 } }))).toContain(
      'velocity band',
    );
  });

  it('says nothing when the clamp did not bite', () => {
    expect(capFor(item({ diagnostics: { rawBudget: 186, velocityCapped: 186 } }))).toBeNull();
  });

  it('names a freeze when the ad set was held', () => {
    expect(capFor(item({ diagnostics: { freezeReason: 'no_own_budget' } }))).toBe(
      'Held · no own budget',
    );
  });
});

describe('buildPortfolioNews', () => {
  it('leads with the hero and its arithmetic, and keeps money as day · month support', () => {
    const news = buildPortfolioNews({ view: view(), items: [item()], target: 70 });
    expect(news.lead?.claim).toBe('Move $66/day onto Cold, which buys leads cheaper.');
    expect(news.lead?.headline?.from).toBe(120);
    // A headline leads, so the money drops to day · month underneath it.
    expect(news.lead?.moneyPerDay).toBe(14);
    expect(news.lead?.impactPerDay).toBe(14);
    expect(news.lead?.cta?.label).toBe('Review the budget moves');
  });

  it('drops the money line when it would only repeat the headline', () => {
    const pauseBrief = brief({
      hero: {
        module: 'pause',
        candidate_id: 'rec:1',
        headline: 'Stop $120/day going to Dead.',
        why: 'No leads in 7 days.',
        impact_per_day: 120,
        impact_unit: 'currency',
        impact_basis: 'spend/day on the ad set',
        justification: null,
        confidence_note: null,
        cta: { kind: 'queue_row', target_id: 'rec:1' },
      },
      candidates: [
        candidate({
          id: 'rec:1',
          module: 'pause',
          kind: 'pause',
          adset_id: 'as-9',
          impact_per_day: 120,
          results_per_day: 0,
        }),
      ],
    });
    const news = buildPortfolioNews({ view: view({ brief: pauseBrief }), items: [], target: 70 });
    expect(news.lead?.headline?.kind).toBe('avoided');
    expect(news.lead?.moneyPerDay).toBeNull();
    // The tier still has something to read, which is why impactPerDay is a separate field.
    expect(news.lead?.impactPerDay).toBe(120);
  });

  it('takes at most two insights, and never repeats the hero as one', () => {
    const many = brief({
      candidates: [
        candidate(),
        candidate({
          id: 'rec:2',
          module: 'creative',
          kind: 'variate_creative',
          adset_id: 'as-2',
          adset_name: 'Warm',
        }),
        candidate({
          id: 'rec:3',
          module: 'audience',
          kind: 'audience_expand',
          adset_id: 'as-3',
          adset_name: 'Lookalike',
        }),
        candidate({
          id: 'rec:4',
          module: 'pause',
          kind: 'pause',
          adset_id: 'as-4',
          adset_name: 'Dead',
        }),
      ],
      secondary: ['budget:as-1', 'rec:2', 'rec:3', 'rec:4'],
    });
    const news = buildPortfolioNews({ view: view({ brief: many }), items: [item()], target: 70 });
    expect(news.insights.map((c) => c.id)).toEqual(['rec:2', 'rec:3']);
    expect(news.insights[0]?.claim).toBe('Creative on Warm');
  });

  it('renders every card with no cycle items at all — money leads, month alone beneath', () => {
    // The production state today: no candidate carries a headline, so the money is the figure
    // and the support line must not print the same day figure a second time.
    const news = buildPortfolioNews({ view: view(), items: [], target: 70 });
    expect(news.lead?.headline).toBeNull();
    expect(news.lead?.interval).toBeNull();
    expect(news.lead?.moneyPerDay).toBeNull();
    expect(news.lead?.impactPerDay).toBe(14);
  });
});

describe('the lead draws a chart only when the chart is about the lead', () => {
  // A budget hero leads with the pair the cycle wrote down: 120 → 186 a day.
  const budgetView = (chart: HeroView['chart']) => view({ chart });

  it('withholds the portfolio-wide growth chart from a budget card', () => {
    // `growthRates` is cost per result across the window. True, and about a different
    // quantity than "66 a day moved onto it" — which is the confusion, drawn.
    const news = buildPortfolioNews({
      view: budgetView({
        shape: 'rates',
        unit: 'currency',
        points: [
          { t: '2026-09-18', a: 81.2, b: 70 },
          { t: '2026-09-19', a: 77.45, b: 70 },
        ],
        a_label: 'Cost per lead',
        b_label: 'Target',
        projected_from: null,
        gap_per_day: 14,
      }),
      items: [item()],
      target: 70,
    });
    expect(news.lead?.headline?.from).toBe(120);
    expect(news.leadChart).toBeNull();
  });

  it('keeps a chart that draws the pair the card leads with', () => {
    const news = buildPortfolioNews({
      view: budgetView({
        shape: 'rates',
        unit: 'currency',
        points: [
          { t: '2026-09-18', a: 120, b: null },
          { t: '2026-09-19', a: 186, b: null },
        ],
        a_label: 'Daily budget',
        b_label: 'Daily budget',
        projected_from: null,
        gap_per_day: null,
      }),
      items: [item()],
      target: 70,
    });
    expect(news.leadChart?.shape).toBe('rates');
  });

  it('withholds a chart that does not argue at all, whatever it is about', () => {
    const news = buildPortfolioNews({
      view: budgetView({
        shape: 'transfer',
        unit: 'currency',
        from: { label: 'Warm', cost_per_result: 120, spend_per_day: 400 },
        to: { label: 'Cold', cost_per_result: 186, spend_per_day: 300 },
        movable_per_day: 66,
        saving_per_day: 0,
      }),
      items: [item()],
      target: 70,
    });
    // The pair IS on it — and a transfer is the arithmetic the sentence already made.
    expect(news.leadChart).toBeNull();
  });

  it('is null when there was no chart to begin with', () => {
    const news = buildPortfolioNews({ view: view(), items: [item()], target: 70 });
    expect(news.leadChart).toBeNull();
  });

  it('keeps a pause interval that reaches the avoided money it leads with', () => {
    const pause = candidate({
      id: 'rec:r-1',
      module: 'pause',
      kind: 'pause',
      adset_id: 'as-9',
      impact_per_day: 96,
      results_per_day: 0,
      cta: { kind: 'queue_row', target_id: 'rec:r-1' },
    });
    const news = buildPortfolioNews({
      view: view({
        brief: brief({
          candidates: [pause],
          hero: { ...brief().hero, module: 'pause', candidate_id: 'rec:r-1', impact_per_day: 96 },
        }),
        chart: {
          shape: 'interval',
          unit: 'currency',
          estimate: null,
          low: 96,
          high: 192,
          reference: 70,
          reference_label: 'target',
          at_stake_per_day: 96,
          no_results: true,
        },
      }),
      items: [],
      target: 70,
    });
    expect(news.lead?.headline?.value).toBe(96);
    expect(news.leadChart?.shape).toBe('interval');
  });
});

describe('the bracket beside the figure has to be about the figure', () => {
  // Straight off the screenshot that started this: a pause card leading with "$26 a day
  // buying nothing" and drawing the engine's cost-per-result interval underneath it —
  // $71 on the left, $339,700,000 on the right, on a portfolio whose whole daily budget
  // is $324. Three quantities in one border and the upper bound wrong by nine orders.
  const blownCi = { lo: 71, hi: 339_700_000, cpa: 4_900_000, events: 2 };

  const pauseHero = (ci: Record<string, number>) =>
    buildPortfolioNews({
      view: view({
        brief: brief({
          hero: {
            ...brief().hero,
            module: 'pause',
            candidate_id: 'rec:1',
            headline: 'Stop $26/day going to Dead',
            impact_per_day: 26,
            impact_basis: 'spend/day on an ad set with 0 results in 7 days',
          },
          candidates: [
            candidate({
              id: 'rec:1',
              module: 'pause',
              kind: 'pause',
              adset_id: 'as-1',
              impact_per_day: 26,
              results_per_day: 0,
              impact_basis: 'spend/day on an ad set with 0 results in 7 days',
              cta: { kind: 'queue_row', target_id: 'rec:1' },
            }),
          ],
        }),
      }),
      items: [item({ adset_id: 'as-1', diagnostics: { ci } })],
      target: 35,
    });

  it('withholds a cost-per-result interval from a money-per-day figure', () => {
    const news = pauseHero(blownCi);
    expect(news.lead?.headline?.value).toBe(26);
    expect(news.lead?.headline?.unit).toBe('currency_per_day');
    // The engine measured it and the row still holds it — the CARD is what refuses to draw it.
    expect(intervalFor(item({ diagnostics: { ci: blownCi } }), 35)).not.toBeNull();
    expect(news.lead?.interval).toBeNull();
  });

  it('leaves the card with a reading rather than a hole', () => {
    // No bracket means no bounded layout, so the card says its formula instead.
    const news = pauseHero(blownCi);
    expect(pickJustification(news.lead as NewsCardModel)).toBe('open');
    expect(news.lead?.basis).toContain('0 results');
  });

  it('keeps an interval the leading figure actually sits inside', () => {
    const news = pauseHero({ lo: 18, hi: 44, cpa: 26, events: 9 });
    expect(news.lead?.interval).toEqual({
      low: 18,
      high: 44,
      estimate: 26,
      referenceLabel: 'target',
      reference: 35,
    });
    expect(pickJustification(news.lead as NewsCardModel)).toBe('bounded');
  });

  it('does not let the target stand in for a mark — it is carried, never drawn', () => {
    // `IntervalRule` draws low, high and the estimate's tick. `reference` reaches no ink,
    // so a figure that only matches the target is not a figure the reader sees agreeing.
    const news = pauseHero({ lo: 71, hi: 339_700_000, cpa: 4_900_000, events: 2 });
    expect(news.lead?.interval).toBeNull();
    const onTarget = buildPortfolioNews({
      view: view({
        brief: brief({
          hero: { ...brief().hero, module: 'pause', candidate_id: 'rec:1', impact_per_day: 35 },
          candidates: [
            candidate({
              id: 'rec:1',
              module: 'pause',
              kind: 'pause',
              adset_id: 'as-1',
              impact_per_day: 35,
              results_per_day: 0,
              cta: { kind: 'queue_row', target_id: 'rec:1' },
            }),
          ],
        }),
      }),
      items: [item({ adset_id: 'as-1', diagnostics: { ci: blownCi } })],
      target: 35,
    });
    expect(onTarget.lead?.interval).toBeNull();
  });

  it('checks the money a headline-less card leads with, not just the headline', () => {
    // Without a headline the card still prints `impact_per_day` beside the rule, so a
    // vacuous pass here would let every card written before the vocabulary back in.
    const news = buildPortfolioNews({
      view: view({
        brief: brief({
          hero: { ...brief().hero, module: 'creative', candidate_id: 'rec:9', impact_per_day: 14 },
          candidates: [
            candidate({
              id: 'rec:9',
              module: 'creative',
              kind: 'variate_creative',
              adset_id: 'as-1',
            }),
          ],
        }),
      }),
      items: [item({ adset_id: 'as-1', diagnostics: { ci: blownCi } })],
      target: 35,
    });
    expect(news.lead?.headline).toBeNull();
    expect(news.lead?.interval).toBeNull();
  });
});
