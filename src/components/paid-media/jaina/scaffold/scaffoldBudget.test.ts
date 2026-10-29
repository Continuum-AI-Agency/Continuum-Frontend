/**
 * Ramiro, 2026-10-29: a CBO ad set has no budget of its own. The Optimizer counts it as an
 * equal share of its campaign's budget, and every view prints that share as the estimate it
 * is — the fraction, then the amount — never as the ad set's own daily budget.
 */
import { describe, expect, it } from 'bun:test';
import { formatAdSetBudget, formatCampaignBudgetShare } from './scaffoldBudget';

describe('a CBO ad set’s budget reads as a share of the campaign’s', () => {
  it('names the real fraction and the estimated amount', () => {
    expect(
      formatCampaignBudgetShare({ adSetCount: 3, campaignDailyBudgetMinorUnits: 30_000 }, 'USD'),
    ).toBe('≈ 1/3 of the campaign budget (CBO) · ≈ $100 USD/day');
  });

  it('says the whole budget for a lone ad set, and only the fraction when the campaign has no figure', () => {
    expect(
      formatCampaignBudgetShare({ adSetCount: 1, campaignDailyBudgetMinorUnits: 25_000 }, 'USD'),
    ).toBe('All of the campaign budget (CBO) · $250 USD/day');
    expect(
      formatCampaignBudgetShare({ adSetCount: 4, campaignDailyBudgetMinorUnits: null }, 'USD'),
    ).toBe('≈ 1/4 of the campaign budget (CBO)');
  });

  it('prints an ABO ad set’s own budget as before', () => {
    expect(
      formatAdSetBudget({ dailyBudgetMinorUnits: 6199, campaignBudgetShare: null }, 'USD'),
    ).toBe('$61.99 USD/day');
    expect(
      formatAdSetBudget(
        {
          dailyBudgetMinorUnits: null,
          campaignBudgetShare: { adSetCount: 3, campaignDailyBudgetMinorUnits: 30_000 },
        },
        'USD',
      ),
    ).toBe('≈ 1/3 of the campaign budget (CBO) · ≈ $100 USD/day');
  });
});
