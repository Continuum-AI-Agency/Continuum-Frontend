import { describe, expect, it } from 'bun:test';
import type { HomeOpportunityCard, HomeOpportunityGoal } from '@continuum/contracts';
import { oppConfidenceLine, oppImpactLine, oppLeadOf } from './oppsStack';

const LEADS: HomeOpportunityGoal = { metric: 'leads', label: 'Leads', from: 'results' };

const card = (impact: Partial<HomeOpportunityCard['impact']>, over = {}): HomeOpportunityCard => ({
  id: 'c1',
  origin: 'account_read',
  detector: 'dead_tail',
  adAccountId: 'act_1',
  portfolioIds: [],
  label: 'Spending on nothing',
  basis: 'spent with no conversions',
  headline: null,
  confidence: 1,
  state: null,
  cta: { kind: 'none', targetId: null },
  cardAction: null,
  source: { kind: 'optimizer_get_account_read', ref: 'r1', since: null, until: '2026-11-04' },
  impact: {
    moneyPerDay: 9.16,
    currency: 'MXN',
    impactClass: 'recoverable',
    unit: 'money',
    goalMetric: 'leads',
    goalUnits: null,
    costPerResult: null,
    goalUnitsBasis: null,
    goalUnitsBecause: 'No cost per result was observed for this portfolio.',
    ...impact,
  },
  ...over,
});

describe('oppImpactLine', () => {
  it('leads with the goal when the read priced it in the goal', () => {
    const line = oppImpactLine(
      card({ unit: 'goal', goalUnits: 0.43, goalUnitsBasis: 'portfolio_price' }),
      LEADS,
    );
    expect(line).toBe('+0.43 leads a day');
  });

  it('speaks the name the team gave its goal', () => {
    const line = oppImpactLine(
      card({ unit: 'goal', goalUnits: 2, goalMetric: 'purchases', goalUnitsBasis: 'entity_price' }),
      { metric: 'purchases', label: 'Tours booked', from: 'team' },
    );
    expect(line).toBe('+2 tours booked a day');
  });

  it('an account’s own goal is named by its metric, not by the brand’s label', () => {
    const line = oppImpactLine(
      card({ unit: 'goal', goalUnits: 1.5, goalMetric: 'leads', goalUnitsBasis: 'entity_price' }),
      { metric: 'purchases', label: 'Tours booked', from: 'team' },
    );
    expect(line).toBe('+1.5 leads a day');
  });

  it('stays in the account’s money when the read did not convert it', () => {
    expect(oppImpactLine(card({}), LEADS)).toBe('$9.16 MXN a day');
  });

  it('never assumes a currency', () => {
    expect(oppImpactLine(card({ currency: null }), LEADS)).toBe('9.16 a day');
  });

  it('says so when nothing is priced', () => {
    expect(oppImpactLine(card({ moneyPerDay: 0 }), LEADS)).toBe('Not priced per day yet');
  });
});

describe('oppConfidenceLine', () => {
  it('prints the Optimizer’s own reading', () => {
    expect(oppConfidenceLine(card({}, { confidence: 0.45 }))).toBe('Confidence 45%');
  });

  it('a source that states none stays silent', () => {
    expect(oppConfidenceLine(card({}, { confidence: null }))).toBeNull();
  });
});

describe('oppLeadOf', () => {
  it('is the stack’s first card, as the read sorted it', () => {
    const first = card({}, { id: 'a' });
    expect(oppLeadOf({ goal: LEADS, opportunities: [first], total: 1, accounts: [] })?.id).toBe(
      'a',
    );
    expect(oppLeadOf({ goal: LEADS, opportunities: [], total: 0, accounts: [] })).toBeNull();
    expect(oppLeadOf(null)).toBeNull();
  });
});
