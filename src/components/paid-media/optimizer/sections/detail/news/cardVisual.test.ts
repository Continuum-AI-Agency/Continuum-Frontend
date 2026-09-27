import { describe, expect, it } from 'bun:test';
import type { BriefCandidate, BriefGrowth, CycleItemRow } from '@continuum/contracts';
import { type CardVisual, figureForCard, toneForVisual, visualForCard } from './cardVisual';
import { buildPortfolioNews, type NewsCardModel } from './newsModel';
import { type RealBodyName, readBody } from './realBodies.fixture';

function news(name: RealBodyName): NewsCardModel[] {
  const { report, view } = readBody(name);
  return buildPortfolioNews({
    view,
    items: report.latest_items,
    target: view.brief.growth.target,
  }).cards;
}

function visualOf<K extends CardVisual['kind']>(
  card: NewsCardModel | undefined,
  kind: K,
): Extract<CardVisual, { kind: K }> {
  if (card?.visual.kind !== kind) throw new Error(`expected ${kind}, got ${card?.visual.kind}`);
  return card.visual as Extract<CardVisual, { kind: K }>;
}

describe('FORMULARIOS — every card draws the evidence behind its own why', () => {
  const cards = news('formularios');

  it('holds the three cards the brief listed, highest money first', () => {
    expect(cards.map((card) => card.visual.kind)).toEqual([
      'cost_vs_reference',
      'spend_blocks',
      'ctr_step',
    ]);
  });

  it('pause · sustained cost: the ad set at 75.65 against the 28.86 reference and the 2.5× line', () => {
    const card = cards[0];
    const visual = visualOf(card, 'cost_vs_reference');
    expect(visual).toEqual({
      kind: 'cost_vs_reference',
      windowDays: 14,
      value: 75.65,
      reference: 28.86,
      line: 72.14,
      multiple: 2.5,
    });
    expect(card?.eyebrow).toBe('Pause · sustained cost');
    expect(card?.figure).toEqual({
      value: 43.23,
      unit: 'currency_per_day',
      label: 'a day',
      signed: false,
    });
    expect(card?.tone).toBe('bad');
  });

  it('pause · zero results: 340 spent as 9.7 leads at the 35 target, 0 leads back', () => {
    const card = cards[1];
    expect(visualOf(card, 'spend_blocks')).toEqual({
      kind: 'spend_blocks',
      windowDays: 14,
      spent: 340.44,
      perResult: 35,
      blocks: 9.7,
    });
    expect(card?.eyebrow).toBe('Pause · zero leads');
    expect(card?.figure?.value).toBe(24.32);
  });

  it('creative · fatigue: CTR 0.68% over 14 days stepping down to 0.48%, cost per lead +120%', () => {
    const card = cards[2];
    expect(visualOf(card, 'ctr_step')).toEqual({
      kind: 'ctr_step',
      base: 0.68,
      baseWindowDays: 14,
      recent: 0.48,
      recentWindowDays: 3,
      changePct: -30,
      costChangePct: 120,
    });
    expect(card?.eyebrow).toBe('Creative · fatigue');
    expect(card?.figure?.value).toBe(23.17);
  });
});

describe('Prueba — the anonymised body as stored', () => {
  it('draws its one creative card as the CTR step, not the portfolio line', () => {
    const cards = news('prueba');
    expect(cards).toHaveLength(1);
    const visual = visualOf(cards[0], 'ctr_step');
    expect(visual.base).toBe(0.68);
    expect(visual.recent).toBe(0.48);
  });
});

describe('Prueba — the 25 Sep cycle: creative, budget and vary-the-winner', () => {
  const cards = news('pruebaCycle');

  it('ranks the three by money per day', () => {
    expect(cards.map((card) => card.visual.kind)).toEqual(['ctr_step', 'budget_move', 'range']);
  });

  it('creative · fatigue: CTR 0.86% → 0.62%, −28%, cost per lead +36%', () => {
    const visual = visualOf(cards[0], 'ctr_step');
    expect(visual.base).toBe(0.86);
    expect(visual.recent).toBe(0.62);
    expect(visual.changePct).toBe(-28);
    expect(visual.costChangePct).toBe(36);
    expect(cards[0]?.figure?.value).toBe(9.52);
  });

  it('budget · raise: 33.75 → 39.15, the solver wanted 52.42, the cap holds it at 42.19', () => {
    const card = cards[1];
    expect(visualOf(card, 'budget_move')).toEqual({
      kind: 'budget_move',
      from: 33.75,
      to: 39.15,
      wanted: 52.42,
      cap: 42.19,
    });
    expect(card?.eyebrow).toBe('Budget · raise');
    expect(card?.figure).toEqual({
      value: 5.4,
      unit: 'currency_per_day',
      label: 'a day moved',
      signed: true,
    });
    expect(card?.tone).toBe('primary');
  });

  it('vary the winner: the ad set’s own range 13.15–30.53 around 19.56, against the 25 target', () => {
    const card = cards[2];
    expect(visualOf(card, 'range')).toEqual({
      kind: 'range',
      low: 13.15,
      high: 30.53,
      estimate: 19.56,
      target: 25,
      results: 24,
    });
    expect(card?.figure).toEqual({
      value: 19.56,
      unit: 'currency',
      label: 'per lead · est.',
      signed: false,
    });
  });
});

describe('MENSAJES — nothing to change still draws cost against the target', () => {
  it('draws the 12 ad sets cheapest to dearest against the 30 target, portfolio 40.53', () => {
    const cards = news('mensajes');
    expect(cards).toHaveLength(1);
    const card = cards[0];
    const visual = visualOf(card, 'cost_line');
    expect(visual.across).toBe('ad_sets');
    expect(visual.points).toHaveLength(12);
    expect(visual.points[0]?.cost).toBe(29.12);
    expect(visual.points[11]?.cost).toBe(62.65);
    expect(visual.target).toBe(30);
    expect(visual.overall).toBe(40.53);
    expect(card?.eyebrow).toBe('Today · nothing to change');
    expect(card?.figure).toEqual({
      value: 40.53,
      unit: 'currency',
      label: 'per conversation',
      signed: false,
    });
    expect(card?.tone).toBe('warn');
  });
});

describe('Tours — nothing priced: the strip names what is missing', () => {
  it('reads "12 of 12 ad sets frozen · kpi_mismatch" over what the cycle does hold', () => {
    const cards = news('tours');
    expect(cards).toHaveLength(1);
    const visual = visualOf(cards[0], 'strip');
    expect(visual.label).toBe('12 of 12 ad sets frozen · kpi_mismatch');
    expect(visual.cells).toEqual([
      { kind: 'money', value: 154.75, label: 'spent' },
      { kind: 'count', value: 0, label: 'conversations' },
      { kind: 'count', value: 12, label: 'ad sets' },
    ]);
    expect(cards[0]?.figure).toBeNull();
    expect(cards[0]?.tone).toBe('neutral');
  });
});

// The no-data rule, one step at a time, on a candidate whose evidence is taken away.
describe('the no-data rule', () => {
  const growth: BriefGrowth = {
    spend: 1000,
    results: 20,
    cost_per_result: 50,
    target: 40,
    deltas: { spend: null, results: null, cost_per_result: null },
    pacing: { status: null, ratio: null, note: null },
    scale: null,
    window: 'd14',
    as_of: '2026-09-25T00:00:00Z',
    currency: null,
    result_label: 'leads',
  };
  const pause = {
    id: 'rec:00000000-0000-4000-8000-000000000099',
    module: 'pause',
    kind: 'pause',
    trigger: 'P2_sustained_poor',
    adset_id: 'as-1',
    adset_name: 'Cold',
    impact_per_day: 20,
    impact_unit: 'currency',
    results_per_day: null,
    impact_basis: 'spend/day the engine sized on this ad set (P2_sustained_poor)',
    reason: null,
    cta: { kind: 'queue_row', target_id: 'rec:1' },
  } as BriefCandidate;
  const item = (over: Partial<CycleItemRow> = {}): CycleItemRow =>
    ({
      adset_id: 'as-1',
      adset_name: 'Cold',
      current_budget: 30,
      final_budget: 30,
      change_abs: 0,
      diagnostics: { ci: { cpa: 60, lo: 45, hi: 90, events: 12 } },
      ...over,
    }) as CycleItemRow;
  const args = {
    candidate: pause,
    recommendations: [],
    growth,
    series: [],
    target: 40,
    resultLabel: 'leads',
  };

  it('2 · with no evidence, draws the same ad set’s CI against the target', () => {
    const visual = visualForCard({ ...args, items: [item()] });
    expect(visual).toEqual({
      kind: 'range',
      low: 45,
      high: 90,
      estimate: 60,
      target: 40,
      results: 12,
    });
    expect(toneForVisual(visual)).toBe('warn');
  });

  it('2 · falls to the same ad set’s budget move when its CI is not bounded', () => {
    const visual = visualForCard({
      ...args,
      items: [
        item({
          final_budget: 24,
          change_abs: -6,
          diagnostics: { ci: { cpa: 0, lo: 0, hi: null, events: 0 } },
        } as Partial<CycleItemRow>),
      ],
    });
    expect(visual).toEqual({ kind: 'budget_move', from: 30, to: 24, wanted: null, cap: null });
  });

  it('3 · with neither, draws the strip — never an empty band', () => {
    const visual = visualForCard({ ...args, items: [] });
    expect(visual).toEqual({
      kind: 'strip',
      label: 'no cost per lead measured',
      cells: [
        { kind: 'money', value: 1000, label: 'spent' },
        { kind: 'count', value: 20, label: 'leads' },
      ],
    });
  });

  it('never draws "zero results" for a pause whose results nobody measured', () => {
    const visual = visualForCard({
      ...args,
      items: [],
      recommendations: [
        {
          id: '00000000-0000-4000-8000-000000000099',
          adset_id: 'as-1',
          kind: 'pause',
          trigger: 'P3_low_significance',
          severity: null,
          reason: null,
          status: 'pending',
          evidence: {
            metric: 'spend',
            value: 340,
            comparator: 'with 0 conversions in 7d and 14d',
            threshold: 35,
            window: 'd14',
            estImpactPerDay: 24,
            source: 'engine',
          },
        },
      ],
    });
    expect(visual.kind).not.toBe('spend_blocks');
  });

  it('a strip carries no figure — the label is the read', () => {
    const strip = visualForCard({ ...args, items: [] });
    expect(
      figureForCard({ candidate: pause, impactPerDay: 0, visual: strip, resultLabel: 'leads' }),
    ).toBeNull();
  });
});
