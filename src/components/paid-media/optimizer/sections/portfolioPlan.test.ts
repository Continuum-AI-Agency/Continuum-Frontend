import { describe, expect, it } from 'bun:test';
import type { PortfolioListItem } from '@continuum/contracts';
import { portfolioPlanPerDay } from './portfolioPlan';

// PP-DT-B-portfolio-plan-counts-paused-campaigns (G8 F11). Easy Fit's "Leads // Google Ads only"
// stores daily_total 1870 — 700 PAUSED + 500 ENDED + 350 + 320, summed when it was created —
// with budget_source 'observed', so the engine conserves the live sum it scores, 670, every
// cycle. The row read "$1,870 MXN/day" and the hero "plan 1,870" beside a card saying 670.

const row = (over: Partial<PortfolioListItem>): PortfolioListItem =>
  ({
    id: 'b9cebbcf-2832-440a-b326-3af20c19be37',
    name: 'Leads // Google Ads only',
    ad_account_id: '5251780631',
    objective: 'lead',
    level: 'campaign',
    mode: 'efficiency',
    apply_mode: 'recommend',
    daily_total: 1870,
    budget_source: 'observed',
    period_budget: null,
    status: 'active',
    next_realloc_at: null,
    adset_count: 4,
    pending_recommendations: 1,
    ...over,
  }) as PortfolioListItem;

describe('a portfolio’s daily plan', () => {
  it('observed: the budget its last cycle conserved, never the creation-time sum', () => {
    expect(portfolioPlanPerDay(row({ conserved_daily_total: 670 }))).toBe(670);
  });

  it('observed before any cycle: the stored sum is all there is', () => {
    expect(portfolioPlanPerDay(row({ conserved_daily_total: null }))).toBe(1870);
    expect(portfolioPlanPerDay(row({}))).toBe(1870);
  });

  it('fixed: the total a person typed is the plan, whatever a cycle conserved', () => {
    expect(
      portfolioPlanPerDay(
        row({ budget_source: 'fixed', daily_total: 900, conserved_daily_total: 670 }),
      ),
    ).toBe(900);
  });
});
