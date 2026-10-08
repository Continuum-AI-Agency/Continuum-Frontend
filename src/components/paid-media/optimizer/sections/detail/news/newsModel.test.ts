import { describe, expect, it } from 'bun:test';
import type { CycleItemRow, PortfolioBrief } from '@continuum/contracts';
import type { HeroView } from '../heroModel';
import { buildPortfolioNews } from './newsModel';

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
  pacingLine: null,
  pacingTone: 'muted',
  brief: brief(),
  cta: { kind: 'queue_row', rowKey: 'budget:as-1', label: 'Review the budget moves' },
  observe: false,
  asOf: '2026-09-19T06:10:00Z',
  ...over,
});

describe('buildPortfolioNews', () => {
  it('leads with the hero, its own evidence drawn and the money that moved on top', () => {
    const news = buildPortfolioNews({ view: view(), items: [item()], target: 70 });
    expect(news.lead?.claim).toBe('Move $66/day onto Cold, which buys leads cheaper.');
    expect(news.lead?.visual).toEqual({
      kind: 'budget_move',
      from: 120,
      to: 186,
      wanted: null,
      cap: null,
    });
    expect(news.lead?.figure).toEqual({
      value: 66,
      unit: 'currency_per_day',
      label: 'a day moved',
      signed: true,
    });
    expect(news.lead?.eyebrow).toBe('Budget · raise');
    expect(news.lead?.impactPerDay).toBe(14);
    expect(news.lead?.cta?.label).toBe('Review the budget moves');
  });

  it('names the ad set above the claim only when the claim does not already say it', () => {
    const named = buildPortfolioNews({ view: view(), items: [item()], target: 70 });
    expect(named.lead?.subject).toBeNull();
    const unnamed = buildPortfolioNews({
      view: view({
        brief: brief({
          hero: { ...brief().hero, headline: 'Move money onto the cheapest ad set.' },
        }),
      }),
      items: [item()],
      target: 70,
    });
    expect(unnamed.lead?.subject).toBe('Cold');
  });

  it('takes every secondary the brief listed, and never repeats the hero as one', () => {
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
    // The hero (budget:as-1) is first in `secondary` and is skipped; the rest all come through.
    // How many the ROW shows is the row's decision (NEWS_ROW_SIZE), not the model's.
    expect(news.insights.map((c) => c.id)).toEqual(['rec:2', 'rec:3', 'rec:4']);
    expect(news.insights[0]?.claim).toBe('Creative on Warm');
  });

  it('gives every card a visual even with no cycle items and no evidence at all', () => {
    const news = buildPortfolioNews({ view: view(), items: [], target: 70 });
    expect(news.lead?.visual.kind).toBe('strip');
    expect(news.lead?.figure?.value).toBe(14);
    expect(news.lead?.impactPerDay).toBe(14);
  });

  it('calls a hero with no candidate "nothing to change", and still draws the portfolio', () => {
    const calm = brief({
      hero: { ...brief().hero, module: 'none', candidate_id: null, impact_per_day: null },
      candidates: [],
    });
    const news = buildPortfolioNews({
      view: view({
        brief: calm,
        series: [
          { date: '2026-09-18', spend: 400, results: 5 },
          { date: '2026-09-19', spend: 300, results: 5 },
        ],
      }),
      items: [item()],
      target: 70,
    });
    expect(news.lead?.eyebrow).toBe('Today · nothing to change');
    expect(news.lead?.subject).toBe('1 ad set');
    expect(news.lead?.visual).toEqual({
      kind: 'cost_line',
      across: 'days',
      points: [
        { label: '2026-09-18', cost: 80 },
        { label: '2026-09-19', cost: 60 },
      ],
      target: 70,
      overall: 77.45,
    });
  });
});

describe('cards — the row order is the brief’s own ranking', () => {
  const three = (over: Partial<PortfolioBrief> = {}) =>
    brief({
      candidates: [
        candidate({ id: 'rec:aleira', module: 'pause', kind: 'pause', impact_per_day: 28.68 }),
        candidate({ id: 'rec:iteso', module: 'pause', kind: 'pause', impact_per_day: 28.34 }),
        candidate({ id: 'budget:portfolio', module: 'budget', impact_per_day: 6.52 }),
      ],
      ...over,
    });
  const viewOf = (b: PortfolioBrief): HeroView =>
    ({ brief: b, cta: null, observe: false }) as unknown as HeroView;

  it('leads with the hero when the hero is the maximum, then the rest by money per day', () => {
    const b = three({
      hero: { ...brief().hero, candidate_id: 'rec:aleira', impact_per_day: 28.68 },
      secondary: ['rec:iteso', 'budget:portfolio'],
    });
    const news = buildPortfolioNews({ view: viewOf(b), items: [], target: 35 });
    expect(news.cards.map((c) => c.id)).toEqual(['rec:aleira', 'rec:iteso', 'budget:portfolio']);
    expect(news.cards[0]).toBe(news.lead);
  });

  it('puts the maximum first and the chosen lead second when Jaina picked a lower one', () => {
    const b = three({
      hero: {
        ...brief().hero,
        candidate_id: 'rec:iteso',
        impact_per_day: 28.34,
        justification: 'ALEIRA ends tomorrow anyway.',
      },
      secondary: ['rec:aleira', 'budget:portfolio'],
    });
    const news = buildPortfolioNews({ view: viewOf(b), items: [], target: 35 });
    expect(news.cards.map((c) => c.id)).toEqual(['rec:aleira', 'rec:iteso', 'budget:portfolio']);
    expect(news.cards[1]).toBe(news.lead);
    expect(news.cards[1]?.chosenOver).toBe('ALEIRA ends tomorrow anyway.');
  });

  it('keeps every secondary the brief listed — a fourth card is the row’s to place, not the model’s to drop', () => {
    const b = three({
      candidates: [
        candidate({ id: 'rec:aleira', module: 'pause', kind: 'pause', impact_per_day: 28.68 }),
        candidate({ id: 'rec:iteso', module: 'pause', kind: 'pause', impact_per_day: 28.34 }),
        candidate({ id: 'budget:portfolio', module: 'budget', impact_per_day: 6.52 }),
        candidate({
          id: 'rec:warm',
          module: 'creative',
          kind: 'creative_refresh',
          impact_per_day: 4,
        }),
      ],
      hero: {
        ...brief().hero,
        candidate_id: 'rec:iteso',
        impact_per_day: 28.34,
        justification: 'j',
      },
      secondary: ['rec:aleira', 'budget:portfolio', 'rec:warm'],
    });
    const news = buildPortfolioNews({ view: viewOf(b), items: [], target: 35 });
    expect(news.cards.map((c) => c.id)).toEqual([
      'rec:aleira',
      'rec:iteso',
      'budget:portfolio',
      'rec:warm',
    ]);
  });

  it('a lead with no candidate behind it is the only card, and leads', () => {
    const b = brief({
      hero: { ...brief().hero, module: 'none', candidate_id: null, impact_per_day: null },
      candidates: [],
      secondary: [],
    });
    const news = buildPortfolioNews({ view: viewOf(b), items: [], target: 35 });
    expect(news.cards.map((c) => c.id)).toEqual(['hero']);
  });
});
