import { describe, expect, it } from 'bun:test';
import type { AdSetSnapshot, CycleItemRow } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import {
  blendedCost,
  buildReallocationStory,
  defaultStoryLookback,
} from './reallocationStoryModel';

const lead = getOptimizationMetricDefinition('lead');

function item(
  adset_id: string,
  current: number,
  final: number,
  extra: Partial<CycleItemRow> = {},
): CycleItemRow {
  return {
    adset_id,
    current_budget: current,
    final_budget: final,
    change_abs: final - current,
    change_pct: current > 0 ? (final - current) / current : null,
    ...extra,
  };
}

function snapshot(id: string, spend: number, leads: number): AdSetSnapshot {
  const w = { spend, leads, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 };
  return {
    id,
    status: 'active',
    currentBudget: 100,
    windows: { d3: w, d7: w, d14: { ...w, spend: spend * 2, leads: leads * 2 } },
  } as unknown as AdSetSnapshot;
}

describe('blendedCost', () => {
  it('is spend-weighted and ignores unpriced or unfunded rows', () => {
    // 100 at $10 (10 results) + 100 at $50 (2 results) = 200 / 12
    expect(
      blendedCost([
        { budget: 100, cost: 10 },
        { budget: 100, cost: 50 },
      ]),
    ).toBeCloseTo(200 / 12, 6);
    expect(
      blendedCost([
        { budget: 100, cost: null },
        { budget: 0, cost: 10 },
      ]),
    ).toBeNull();
  });
});

describe('buildReallocationStory', () => {
  const items = [
    item('cheap', 100, 140, { reason: 'Earned a larger share.' }),
    item('pricey', 100, 60, { reason: 'Costs more per lead than the pool.' }),
    item('held', 50, 50, { diagnostics: { freezeReason: 'no_conversions' } }),
  ];
  const snapshotById = new Map([
    ['cheap', snapshot('cheap', 100, 10)], // $10 / lead
    ['pricey', snapshot('pricey', 100, 2)], // $50 / lead
    ['held', snapshot('held', 20, 0)],
  ]);
  const nameById = new Map([['cheap', 'Cheap leads']]);

  it('prices each ad set on the chosen window, sorts best first, held last', () => {
    const story = buildReallocationStory({
      items,
      metric: lead,
      snapshotById,
      nameById,
      lookback: 7,
      target: 30,
      currency: 'USD',
    });
    expect(story.rows.map((r) => r.adsetId)).toEqual(['cheap', 'pricey', 'held']);
    expect(story.rows[0].name).toBe('Cheap leads');
    expect(story.rows[0].cost).toBe(10);
    expect(story.rows[0].standing).toBe('below');
    expect(story.rows[1].cost).toBe(50);
    expect(story.rows[1].standing).toBe('above');
    expect(story.rows[2].held).toBe(true);
    expect(story.rows[2].cost).toBeNull();
    expect(story.rows[0].reason).toBe('Earned a larger share.');
  });

  it('the summary names the direction of money and the blended cost it buys', () => {
    const story = buildReallocationStory({
      items,
      metric: lead,
      snapshotById,
      nameById,
      lookback: 7,
      target: 30,
      currency: 'USD',
    });
    expect(story.moved).toBe(40);
    expect(story.gainers).toBe(1);
    expect(story.losers).toBe(1);
    expect(story.losersAboveTarget).toBe(1);
    expect(story.gainersBelowTarget).toBe(1);
    // before: 200 / (100/10 + 100/50) = 200/12 ; after: 200 / (140/10 + 60/50) = 200/15.2
    expect(story.blendedBefore).toBeCloseTo(200 / 12, 6);
    expect(story.blendedAfter).toBeCloseTo(200 / 15.2, 6);
    expect(story.summary).toMatch(
      /^Moving \$40\.00\/day from 1 ad set \(1 above target\) to 1 ad set \(1 below target\)\./,
    );
    expect(story.summary).toMatch(/Blended CPL improves from \$16\.67 to \$13\.16/);
  });

  // The story sentence used to build its own Intl formatter defaulting to USD, so an account
  // with no currency code narrated a peso reallocation in dollars. It goes through the one
  // optimizer formatter now: no code, no symbol.
  it('never narrates an unknown currency in dollars', () => {
    const story = buildReallocationStory({
      items,
      metric: lead,
      snapshotById,
      nameById,
      lookback: 7,
      target: 30,
      currency: null,
    });
    expect(story.summary).toStartWith('Moving 40.00/day from');
    expect(story.summary).toContain('improves from 16.67 to 13.16');
    expect(story.summary).not.toContain('$');
  });

  it('uses the 14-day engine interval only on the 14-day lookback', () => {
    const withCi = [
      item('a', 100, 120, { diagnostics: { ci: { cpa: 12, lo: 8, hi: 20, events: 9 } } }),
    ];
    const seven = buildReallocationStory({
      items: withCi,
      metric: lead,
      lookback: 7,
      target: null,
    });
    expect(seven.rows[0].cost).toBeNull();
    expect(seven.rows[0].ci).toBeNull();
    const fourteen = buildReallocationStory({
      items: withCi,
      metric: lead,
      lookback: 14,
      target: null,
    });
    expect(fourteen.rows[0].cost).toBe(12);
    expect(fourteen.rows[0].ci).toEqual({ lo: 8, hi: 20 });
    expect(fourteen.rows[0].standing).toBe('unknown');
  });

  it('prices awareness as CPM on every window', () => {
    const awareness = getOptimizationMetricDefinition('awareness');
    const snap = {
      id: 'a',
      status: 'active',
      currentBudget: 10,
      windows: {
        d3: { spend: 20, impressions: 4000, purchases: 0, addToCarts: 0, clicks: 0 },
        d7: { spend: 20, impressions: 4000, purchases: 0, addToCarts: 0, clicks: 0 },
        d14: { spend: 20, impressions: 4000, purchases: 0, addToCarts: 0, clicks: 0 },
      },
    } as unknown as AdSetSnapshot;
    const story = buildReallocationStory({
      items: [item('a', 10, 12)],
      metric: awareness,
      snapshotById: new Map([['a', snap]]),
      lookback: 3,
      target: 4,
    });
    expect(story.rows[0].cost).toBe(5);
    expect(story.rows[0].standing).toBe('above');
  });

  it('says plainly when nothing moved', () => {
    const story = buildReallocationStory({
      items: [item('a', 100, 100)],
      metric: lead,
      lookback: 7,
      target: null,
    });
    expect(story.movedCount).toBe(0);
    expect(story.summary).toMatch(/No budget moved/);
  });
});

describe('defaultStoryLookback', () => {
  it('maps the stored window to the nearest engine window', () => {
    expect(defaultStoryLookback('d7')).toBe(7);
    expect(defaultStoryLookback('d14')).toBe(14);
    expect(defaultStoryLookback('d30')).toBe(14);
    expect(defaultStoryLookback(null)).toBe(7);
  });
});

describe('buildReallocationStory on a zero-conversion ad set', () => {
  it('prices it as unknown, never as a $0 cost under target', () => {
    const story = buildReallocationStory({
      items: [
        item('dead', 17, 16, {
          diagnostics: { ci: { cpa: 0, lo: 0, hi: null, events: 0 } },
        }),
      ],
      metric: lead,
      snapshotById: new Map(),
      nameById: new Map(),
      lookback: 14,
      target: 30,
      currency: 'USD',
    });
    expect(story.rows[0].cost).toBeNull();
    expect(story.rows[0].ci).toBeNull();
    expect(story.rows[0].standing).toBe('unknown');
  });
});
