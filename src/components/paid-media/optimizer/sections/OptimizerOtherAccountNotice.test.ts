// Pure decision tests for the empty-optimizer branch. The four states the tab used to
// collapse into one onboarding screen are distinguished HERE, so they are testable
// without rendering (the render suites in this directory register process-wide partial
// mocks of ../useOptimizerData and @/components/ui/*).

import { describe, expect, it } from 'bun:test';
import type { AdAccount } from '@continuum/contracts';

import { resolveEmptyPortfolioState, resolveHiddenAccounts } from './OptimizerOtherAccountNotice';

const account = (overrides: Partial<AdAccount> = {}): AdAccount => ({
  platform: 'meta',
  account_id: '123',
  name: 'Main account',
  status: 'ACTIVE',
  currency: 'USD',
  ...overrides,
});

describe('resolveEmptyPortfolioState', () => {
  it('sends a brand with portfolios on another ad account to the notice, not onboarding', () => {
    expect(
      resolveEmptyPortfolioState({ brandPortfolioCount: 3, otherAccountIds: ['act_999'] }),
    ).toBe('other-account');
  });

  it('sends a genuinely empty brand to onboarding', () => {
    expect(resolveEmptyPortfolioState({ brandPortfolioCount: 0, otherAccountIds: [] })).toBe(
      'onboarding',
    );
  });

  it('sends portfolios with no ad account at all to onboarding — nothing is being hidden', () => {
    expect(resolveEmptyPortfolioState({ brandPortfolioCount: 2, otherAccountIds: [] })).toBe(
      'onboarding',
    );
  });
});

describe('resolveHiddenAccounts', () => {
  it('names the owning account by matching ids bare across the act_ prefix', () => {
    expect(resolveHiddenAccounts(['act_123'], [account()])).toEqual([
      { accountId: '123', label: 'Main account', known: true },
    ]);
  });

  it('matches a bare stored id against an act_-prefixed assigned account', () => {
    expect(resolveHiddenAccounts(['123'], [account({ account_id: 'act_123' })])).toEqual([
      { accountId: 'act_123', label: 'Main account', known: true },
    ]);
  });

  it('falls back to the stored id and refuses a switch when no assigned account matches', () => {
    expect(resolveHiddenAccounts(['act_999'], [account()])).toEqual([
      { accountId: 'act_999', label: 'act_999', known: false },
    ]);
  });

  it('labels a nameless account by its id', () => {
    expect(resolveHiddenAccounts(['123'], [account({ name: null })])).toEqual([
      { accountId: '123', label: '123', known: true },
    ]);
  });
});
