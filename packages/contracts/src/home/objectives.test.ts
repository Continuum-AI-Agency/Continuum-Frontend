import { describe, expect, it } from 'bun:test';

import {
  homeObjectiveListSchema,
  inferHomeObjectives,
  makeHomeObjectivePrimary,
  resolveHomeObjectives,
} from './objectives';

describe('inferHomeObjectives', () => {
  it('leads with revenue when purchases carry a value', () => {
    expect(
      inferHomeObjectives({ purchases: 40, purchase_value: 9000 }).map((o) => o.metric),
    ).toEqual(['purchase_value', 'purchases']);
  });

  it("reads Easy Fit's week as purchases first, conversations second", () => {
    const objectives = inferHomeObjectives({ purchases: 73, conversations: 525, leads: 40 });
    expect(objectives.map((o) => [o.metric, o.role])).toEqual([
      ['purchases', 'primary'],
      ['conversations', 'secondary'],
    ]);
  });

  it('falls back to spend when nothing happened, so the Home always has a figure', () => {
    expect(inferHomeObjectives({}).map((o) => o.metric)).toEqual(['spend']);
  });
});

describe('resolveHomeObjectives', () => {
  const brandRow = {
    brand_id: 'b',
    scope: 'brand',
    source: 'user' as const,
    objectives: [
      {
        id: 'tours',
        label: 'Tours booked',
        metric: 'purchases' as const,
        role: 'primary' as const,
      },
    ],
  };

  it('uses the brand row for an account that has none of its own', () => {
    const resolved = resolveHomeObjectives({ scope: 'act_1', rows: [brandRow], totals: {} });
    expect(resolved.objectives[0]?.label).toBe('Tours booked');
    expect(resolved.fromScope).toBe('brand');
  });

  it('infers when no row exists', () => {
    const resolved = resolveHomeObjectives({ scope: 'brand', rows: [], totals: { leads: 3 } });
    expect(resolved.source).toBe('inferred');
    expect(resolved.objectives[0]?.metric).toBe('leads');
  });

  const suggested = [
    {
      id: 'purchase_value',
      label: 'Revenue',
      metric: 'purchase_value' as const,
      role: 'primary' as const,
    },
  ];

  it("leads with the business's suggested goals while the account has no result", () => {
    const resolved = resolveHomeObjectives({
      scope: 'brand',
      rows: [],
      totals: { spend: 120, clicks: 40 },
      suggested,
    });
    expect(resolved.objectives).toEqual(suggested);
    expect(resolved.source).toBe('inferred');
    expect(resolved.fromSuggestion).toBe(true);
  });

  it('lets a real result outrank the suggestion', () => {
    const resolved = resolveHomeObjectives({
      scope: 'brand',
      rows: [],
      totals: { leads: 2 },
      suggested,
    });
    expect(resolved.objectives[0]?.metric).toBe('leads');
    expect(resolved.fromSuggestion).toBe(false);
  });

  it('never lets a suggestion outrank what the team saved', () => {
    const resolved = resolveHomeObjectives({
      scope: 'brand',
      rows: [brandRow],
      totals: {},
      suggested,
    });
    expect(resolved.objectives[0]?.label).toBe('Tours booked');
  });
});

describe('objective list rules', () => {
  it('keeps one primary after a promotion', () => {
    const list = makeHomeObjectivePrimary(
      [
        { id: 'a', label: 'A', metric: 'purchases', role: 'primary' },
        { id: 'b', label: 'B', metric: 'conversations', role: 'secondary' },
      ],
      'b',
    );
    expect(list.map((o) => [o.id, o.role])).toEqual([
      ['b', 'primary'],
      ['a', 'secondary'],
    ]);
    expect(homeObjectiveListSchema.safeParse(list).success).toBe(true);
  });

  it('refuses two primaries', () => {
    const twoPrimaries = [
      { id: 'a', label: 'A', metric: 'purchases', role: 'primary' },
      { id: 'b', label: 'B', metric: 'leads', role: 'primary' },
    ];
    expect(homeObjectiveListSchema.safeParse(twoPrimaries).success).toBe(false);
  });
});
