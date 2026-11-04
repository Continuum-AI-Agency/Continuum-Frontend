import { describe, expect, it } from 'bun:test';
import {
  type HomeOpportunityCard,
  homeOpportunitiesReadSchema,
  homeOpportunityCardSchema,
  sortHomeOpportunities,
} from './opportunities';

const BRAND = '6f597f42-b5b5-4b9a-baa5-9a4d9fdb9b64';

function opportunity(
  overrides: Partial<HomeOpportunityCard> & { id: string },
): HomeOpportunityCard {
  return homeOpportunityCardSchema.parse({
    origin: 'account_read',
    detector: 'dead_tail',
    adAccountId: 'act_1',
    portfolioIds: [],
    label: 'Spending on nothing',
    basis: '96/day on 0 results',
    headline: null,
    confidence: 0.8,
    state: null,
    cta: { kind: 'portfolio', targetId: 'p-1' },
    cardAction: null,
    impact: {
      moneyPerDay: 10,
      currency: 'MXN',
      impactClass: 'recoverable',
      unit: 'money',
      goalMetric: null,
      goalUnits: null,
      costPerResult: null,
      goalUnitsBasis: null,
      goalUnitsBecause: 'No cost per result was observed for this entity.',
    },
    source: { kind: 'optimizer_get_account_read', ref: 'read-1', since: null, until: '2026-11-03' },
    ...overrides,
  });
}

const inGoal = (goalUnits: number, moneyPerDay: number) => ({
  moneyPerDay,
  currency: 'MXN',
  impactClass: 'better_price' as const,
  unit: 'goal' as const,
  goalMetric: 'leads' as const,
  goalUnits,
  costPerResult: moneyPerDay / goalUnits,
  goalUnitsBasis: 'portfolio_price' as const,
  goalUnitsBecause: 'At the portfolio’s own 24.12 MXN per lead over the last 14 days.',
});

describe('homeOpportunityCardSchema', () => {
  it('a money opportunity carries no goal units and says why', () => {
    const parsed = homeOpportunityCardSchema.safeParse(opportunity({ id: 'a' }));
    expect(parsed.success).toBe(true);
  });

  it('refuses goal units on an opportunity marked as money', () => {
    const bad = {
      ...opportunity({ id: 'a' }),
      impact: { ...opportunity({ id: 'a' }).impact, goalUnits: 3 },
    };
    expect(homeOpportunityCardSchema.safeParse(bad).success).toBe(false);
  });

  it('refuses a goal opportunity without its metric, figure or basis', () => {
    const base = opportunity({ id: 'a', impact: inGoal(2, 48) });
    for (const missing of ['goalMetric', 'goalUnits', 'goalUnitsBasis'] as const) {
      const bad = { ...base, impact: { ...base.impact, [missing]: null } };
      expect(homeOpportunityCardSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('refuses a negative money figure', () => {
    const base = opportunity({ id: 'a' });
    const bad = { ...base, impact: { ...base.impact, moneyPerDay: -1 } };
    expect(homeOpportunityCardSchema.safeParse(bad).success).toBe(false);
  });
});

describe('sortHomeOpportunities', () => {
  it('goal units lead, then money, then id', () => {
    const sorted = sortHomeOpportunities([
      opportunity({
        id: 'money-big',
        impact: { ...opportunity({ id: 'x' }).impact, moneyPerDay: 900 },
      }),
      opportunity({ id: 'goal-small', impact: inGoal(0.5, 12) }),
      opportunity({ id: 'goal-big', impact: inGoal(4, 96) }),
      opportunity({
        id: 'money-b',
        impact: { ...opportunity({ id: 'x' }).impact, moneyPerDay: 5 },
      }),
      opportunity({
        id: 'money-a',
        impact: { ...opportunity({ id: 'x' }).impact, moneyPerDay: 5 },
      }),
    ]);
    expect(sorted.map((o) => o.id)).toEqual([
      'goal-big',
      'goal-small',
      'money-big',
      'money-a',
      'money-b',
    ]);
  });

  it('does not reorder the list it was given', () => {
    const list = [opportunity({ id: 'b' }), opportunity({ id: 'a' })];
    sortHomeOpportunities(list);
    expect(list.map((o) => o.id)).toEqual(['b', 'a']);
  });
});

describe('homeOpportunitiesReadSchema', () => {
  it('accepts a ready stack and a missing answer', () => {
    const ready = {
      state: 'ready',
      brandId: BRAND,
      generatedAt: '2026-11-03T12:00:00.000Z',
      data: {
        goal: { metric: 'leads', label: 'Leads', from: 'results' },
        opportunities: [opportunity({ id: 'a' })],
        total: 1,
        accounts: [
          {
            adAccountId: 'act_1',
            readId: 'read-1',
            readyAt: '2026-11-03T00:02:24Z',
            currency: 'MXN',
          },
        ],
      },
    };
    expect(homeOpportunitiesReadSchema.safeParse(ready).success).toBe(true);
    const missing = {
      state: 'missing',
      brandId: BRAND,
      generatedAt: '2026-11-03T12:00:00.000Z',
      missing: { reason: 'no_portfolio', detail: 'No Optimizer portfolio yet.' },
    };
    expect(homeOpportunitiesReadSchema.safeParse(missing).success).toBe(true);
  });
});
