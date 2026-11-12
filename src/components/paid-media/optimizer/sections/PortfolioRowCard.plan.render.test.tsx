import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';

// The apply-mode pill wants a tooltip provider ancestor; not what this file is about.
mock.module('../ApplyModePill', () => ({ ApplyModePill: () => null }));

import type { PortfolioListItem } from '@continuum/contracts';
import { PortfolioRowCard } from './PortfolioRowCard';

// PP-DT-B-portfolio-plan-counts-paused-campaigns: the Google tab's row for Easy Fit's Google
// portfolio read "$1,870 MXN/day" — two PAUSED/ENDED campaigns' budgets the engine never moves.

afterEach(cleanup);

const b9cebbcf = {
  id: 'b9cebbcf-2832-440a-b326-3af20c19be37',
  name: 'Leads // Google Ads only',
  ad_account_id: '5251780631',
  objective: 'lead',
  level: 'campaign',
  mode: 'efficiency',
  apply_mode: 'recommend',
  daily_total: 1870,
  budget_source: 'observed',
  conserved_daily_total: 670,
  period_budget: null,
  status: 'active',
  next_realloc_at: null,
  adset_count: 4,
  pending_recommendations: 1,
} as PortfolioListItem;

describe('the portfolio row’s daily budget', () => {
  it('shows what the last cycle conserved for an observed portfolio', () => {
    const { container } = render(
      <PortfolioRowCard currency="MXN" platform="google_ads" portfolio={b9cebbcf} />,
    );
    expect(container.textContent).toContain('$670 MXN/day');
    expect(container.textContent).not.toContain('1,870');
  });
});
