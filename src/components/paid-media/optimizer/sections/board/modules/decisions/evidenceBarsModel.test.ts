import { describe, expect, it } from 'bun:test';
import {
  type AccountCandidate,
  accountCandidateSchema,
  accountChartSchema,
  type PlatformCard,
} from '@continuum/contracts';
import {
  GOOGLE_AD_WINNER,
  GOOGLE_DELIVERY_ACCOUNT_WIDE,
  GOOGLE_LOW_QUALITY_KEYWORD,
  META_COST_CAP,
} from '../../../platformCards/__fixtures__/platformCards';
import { platformCardOf } from '../../../platformCards/platformCardModel';
import {
  EASYFIT_AUCTION,
  EASYFIT_BRANCH_MOVE,
  VIVO_BUDGET_WRITE,
  VIVO_INFLATED_CONVERSION,
  VIVO_NEGATIVES_WRITE,
} from './__fixtures__/decisionCandidates';
import { costTone, type EvidenceBar, evidenceBarsOf, MAX_BARS } from './evidenceBarsModel';

const BARE = accountCandidateSchema.parse({
  id: 'bare:1',
  detector: 'dead_tail',
  impact_per_day: 0,
  impact_class: 'recoverable',
  impact_basis: '',
});

function barsOf(candidate: AccountCandidate): EvidenceBar[] {
  return evidenceBarsOf(candidate, platformCardOf(candidate), 'MXN');
}

function cardBars(card: PlatformCard): EvidenceBar[] {
  return evidenceBarsOf(BARE, card, 'MXN');
}

function chartBars(chart: unknown): EvidenceBar[] {
  const withChart = accountCandidateSchema.parse({
    ...BARE,
    chart: accountChartSchema.parse(chart),
  });
  return evidenceBarsOf(withChart, null, 'MXN');
}

const shape = (bars: EvidenceBar[]) =>
  bars.map((bar) => ({ label: bar.label, value: bar.value, tone: bar.tone }));

describe('evidenceBarsOf: a read finding', () => {
  it('draws a move as the two costs it compares: the dear side above, the cheap side below', () => {
    const bars = barsOf(EASYFIT_BRANCH_MOVE);
    expect(shape(bars)).toEqual([
      { label: 'ITESO', value: '$557 MXN', tone: 'above' },
      { label: 'ALEIRA', value: '$331 MXN', tone: 'below' },
    ]);
    expect(bars[0]?.fill).toBe(1);
    expect(bars[1]?.fill).toBeCloseTo(330.71 / 557.41, 6);
  });

  it('draws a threshold with its line as the tick, the short bars above it', () => {
    const bars = chartBars({
      shape: 'threshold',
      unit: 'count',
      bars: [
        { label: 'ITESO // RTG', value: 18 },
        { label: 'ITESO // LKL', value: 22 },
      ],
      threshold: 50,
      threshold_label: 'learning threshold',
      combined: { label: 'Together', value: 40 },
    });
    expect(bars.map((bar) => bar.tone)).toEqual(['above', 'above', 'above']);
    expect(bars.every((bar) => bar.tick === 1)).toBe(true);
    expect(bars[0]?.fill).toBeCloseTo(18 / 50, 6);
  });

  it('draws a split by share, the slice the card is about marked', () => {
    const bars = chartBars({
      shape: 'share',
      slices: [
        { label: 'Prospecting', share: 0.92, value: 920 },
        { label: 'Retargeting', share: 0.08, value: 80 },
      ],
      focus_label: 'Prospecting',
      band: null,
    });
    expect(shape(bars)).toEqual([
      { label: 'Prospecting', value: '92%', tone: 'above' },
      { label: 'Retargeting', value: '8.0%', tone: 'mid' },
    ]);
    expect(bars.map((bar) => bar.fill)).toEqual([0.92, 0.08]);
  });

  it('draws nothing for a trend, which is not entities side by side', () => {
    expect(barsOf(EASYFIT_AUCTION)).toEqual([]);
  });

  it('draws nothing without a chart', () => {
    expect(barsOf(BARE)).toEqual([]);
  });
});

describe('evidenceBarsOf: a platform card', () => {
  it("draws a P8 finding's own bars on the Overview's geometry, flagged above", () => {
    const bars = barsOf(VIVO_INFLATED_CONVERSION);
    expect(shape(bars)).toEqual([
      { label: 'Visitas y atención', value: '3,285', tone: 'above' },
      { label: 'Leads y ventas', value: '572', tone: 'mid' },
    ]);
    expect(bars[0]?.fill).toBe(1);
    expect(bars[1]?.fill).toBeCloseTo(0.15 / 0.85, 6);
  });

  it('draws a budget-limited campaign as the budget now against the one proposed', () => {
    expect(shape(barsOf(VIVO_BUDGET_WRITE))).toEqual([
      { label: 'Budget now', value: '$1,179 MXN/day', tone: 'mid' },
      { label: 'Proposed', value: '$1,474 MXN/day', tone: 'below' },
    ]);
  });

  it('draws the search terms by spend, dearest first', () => {
    expect(shape(barsOf(VIVO_NEGATIVES_WRITE))).toEqual([
      { label: '"vivo 47 center"', value: '$1,206 MXN', tone: 'above' },
      { label: '"vivo 47 la estancia"', value: '$966 MXN', tone: 'above' },
    ]);
  });

  it('draws the winning ad below the one it beats', () => {
    expect(shape(cardBars(GOOGLE_AD_WINNER))).toEqual([
      { label: 'Gimnasio con alberca', value: '$9.24 MXN', tone: 'below' },
      { label: 'Gimnasio Familiar', value: '$27.93 MXN', tone: 'above' },
    ]);
  });

  it('draws a Quality Score of 3 as a third of the track, on the bad side', () => {
    const [bar] = cardBars(GOOGLE_LOW_QUALITY_KEYWORD);
    expect(bar).toEqual({
      label: 'Quality Score',
      value: '3/10',
      fill: 0.3,
      tone: 'above',
      tick: null,
    });
  });

  it('judges a Meta cost cap against the portfolio CPA goal', () => {
    expect(shape(cardBars(META_COST_CAP))).toEqual([
      { label: 'Cost cap now', value: '$400 MXN', tone: 'above' },
      { label: 'Proposed', value: '$320 MXN', tone: 'above' },
      { label: 'Portfolio CPA goal', value: '$300 MXN', tone: 'mid' },
    ]);
  });

  it('draws nothing for a card without figures to compare', () => {
    expect(cardBars(GOOGLE_DELIVERY_ACCOUNT_WIDE)).toEqual([]);
  });

  it(`keeps at most ${MAX_BARS} rows`, () => {
    const card = platformCardOf(VIVO_NEGATIVES_WRITE);
    if (card?.variant !== 'google_negative_terms') throw new Error('expected the negatives card');
    const many = {
      ...card,
      terms: Array.from({ length: 8 }, (_, index) => ({
        term: `term ${index}`,
        spend: 100 + index,
        clicks: 1,
        conversions: 0,
      })),
    };
    expect(cardBars(many)).toHaveLength(MAX_BARS);
  });
});

describe('costTone', () => {
  it('reads a cost under its goal as good, over it as bad, within 2% as at the goal', () => {
    expect(costTone(330.71, 400)).toBe('below');
    expect(costTone(557.41, 400)).toBe('above');
    expect(costTone(405, 400)).toBe('mid');
    expect(costTone(410, 400)).toBe('above');
    expect(costTone(405, null)).toBe('mid');
  });

  it('swaps the sides for a figure that is better high', () => {
    expect(costTone(4.6, 3, true)).toBe('below');
    expect(costTone(2.1, 3, true)).toBe('above');
  });
});
