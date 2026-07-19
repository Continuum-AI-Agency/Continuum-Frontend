// Pure decision tests for the cross-account portfolio browser. The browser's whole value is
// that a row belonging to another ad account still opens, which requires switching the
// selected account FIRST — a row that silently does nothing is worse than no browser. That
// decision is planPortfolioOpen, and it is asserted here directly rather than through a
// render, because the render suites in this directory register process-wide partial mocks
// (bun's mock.module is process-wide, so those mocks leak across a batched run).

import { describe, expect, it } from 'bun:test';
import type { AdAccount, PortfolioListItem } from '@continuum/contracts';

import { groupPortfoliosByAccount, planPortfolioOpen } from './portfolioAccounts';

const account = (overrides: Partial<AdAccount> = {}): AdAccount => ({
  platform: 'meta',
  account_id: '123',
  name: 'Main account',
  status: 'ACTIVE',
  currency: 'USD',
  ...overrides,
});

const portfolio = (overrides: Partial<PortfolioListItem> = {}): PortfolioListItem => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Prospecting',
  ad_account_id: '123',
  objective: 'purchase',
  level: 'adset',
  mode: 'balanced',
  apply_mode: 'recommend',
  daily_total: 100,
  period_budget: null,
  status: 'active',
  next_realloc_at: null,
  adset_count: 3,
  pending_recommendations: 0,
  ...overrides,
});

describe('groupPortfoliosByAccount', () => {
  it('buckets portfolios by owning account and names each account the way the picker does', () => {
    const groups = groupPortfoliosByAccount({
      portfolios: [
        portfolio({ id: 'a', ad_account_id: '123' }),
        portfolio({ id: 'b', ad_account_id: 'act_999' }),
        portfolio({ id: 'c', ad_account_id: '123' }),
      ],
      accounts: [account(), account({ account_id: '999', name: 'Secondary account' })],
      selectedAdAccountId: '123',
    });

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ label: 'Main account', known: true, isSelected: true });
    expect(groups[0]?.portfolios.map((row) => row.id)).toEqual(['a', 'c']);
    expect(groups[1]).toMatchObject({ label: 'Secondary account', known: true, isSelected: false });
    expect(groups[1]?.portfolios.map((row) => row.id)).toEqual(['b']);
  });

  it('matches ids bare across the act_ prefix so one account is not split into two groups', () => {
    const groups = groupPortfoliosByAccount({
      portfolios: [
        portfolio({ id: 'a', ad_account_id: 'act_123' }),
        portfolio({ id: 'b', ad_account_id: '123' }),
      ],
      accounts: [account()],
      selectedAdAccountId: '123',
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.portfolios.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('puts the selected account first even when another account sorts earlier by name', () => {
    const groups = groupPortfoliosByAccount({
      portfolios: [
        portfolio({ id: 'a', ad_account_id: '999' }),
        portfolio({ id: 'b', ad_account_id: '123' }),
      ],
      accounts: [
        account({ account_id: '123', name: 'Zeta account' }),
        account({ account_id: '999', name: 'Alpha account' }),
      ],
      selectedAdAccountId: '123',
    });

    expect(groups.map((group) => group.label)).toEqual(['Zeta account', 'Alpha account']);
  });

  it('files a portfolio with no ad account under the selected account, matching the filter', () => {
    const groups = groupPortfoliosByAccount({
      portfolios: [portfolio({ id: 'a', ad_account_id: null })],
      accounts: [account()],
      selectedAdAccountId: '123',
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ label: 'Main account', isSelected: true });
  });

  it('falls back to the raw stored id when the account is not assigned to this brand', () => {
    const groups = groupPortfoliosByAccount({
      portfolios: [portfolio({ id: 'a', ad_account_id: 'act_555' })],
      accounts: [account()],
      selectedAdAccountId: '123',
    });

    expect(groups[0]).toMatchObject({ accountId: 'act_555', label: 'act_555', known: false });
  });

  it('returns no groups for a brand with no portfolios', () => {
    expect(
      groupPortfoliosByAccount({
        portfolios: [],
        accounts: [account()],
        selectedAdAccountId: '123',
      }),
    ).toEqual([]);
  });
});

describe('planPortfolioOpen', () => {
  it('opens a portfolio on the selected account directly, with no account switch', () => {
    expect(
      planPortfolioOpen({
        portfolioId: 'a',
        portfolioAccountId: '123',
        selectedAdAccountId: '123',
        accounts: [account()],
      }),
    ).toEqual({ kind: 'open', portfolioId: 'a' });
  });

  it('opens directly when the stored id differs from the selected id only by the act_ prefix', () => {
    expect(
      planPortfolioOpen({
        portfolioId: 'a',
        portfolioAccountId: 'act_123',
        selectedAdAccountId: '123',
        accounts: [account()],
      }),
    ).toEqual({ kind: 'open', portfolioId: 'a' });
  });

  it('opens a portfolio with no ad account directly — it belongs to every account view', () => {
    expect(
      planPortfolioOpen({
        portfolioId: 'a',
        portfolioAccountId: null,
        selectedAdAccountId: '123',
        accounts: [account()],
      }),
    ).toEqual({ kind: 'open', portfolioId: 'a' });
  });

  it('switches the ad account BEFORE opening a portfolio owned by another account', () => {
    expect(
      planPortfolioOpen({
        portfolioId: 'a',
        portfolioAccountId: 'act_999',
        selectedAdAccountId: '123',
        accounts: [account(), account({ account_id: '999', name: 'Secondary account' })],
      }),
    ).toEqual({ kind: 'switch-then-open', portfolioId: 'a', accountId: '999' });
  });

  it('switches to the id the PICKER lists, not the id stored on the portfolio', () => {
    expect(
      planPortfolioOpen({
        portfolioId: 'a',
        portfolioAccountId: '999',
        selectedAdAccountId: '123',
        accounts: [account({ account_id: 'act_999', name: 'Secondary account' })],
      }),
    ).toEqual({ kind: 'switch-then-open', portfolioId: 'a', accountId: 'act_999' });
  });

  it('refuses to open when the owning account is not one the picker can switch to', () => {
    expect(
      planPortfolioOpen({
        portfolioId: 'a',
        portfolioAccountId: 'act_555',
        selectedAdAccountId: '123',
        accounts: [account()],
      }),
    ).toEqual({ kind: 'unavailable', portfolioId: 'a', reason: 'unresolvable-account' });
  });
});
