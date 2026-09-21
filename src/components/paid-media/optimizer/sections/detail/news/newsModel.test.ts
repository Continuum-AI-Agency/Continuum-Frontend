import { describe, expect, it } from 'bun:test';
import type { CycleItemRow, PortfolioBrief } from '@continuum/contracts';
import type { HeroView } from '../heroModel';
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

  it('renders every card with no cycle items at all — the sentence carries it', () => {
    const news = buildPortfolioNews({ view: view(), items: [], target: 70 });
    expect(news.lead?.headline).toBeNull();
    expect(news.lead?.interval).toBeNull();
    expect(news.lead?.moneyPerDay).toBe(14);
  });
});
