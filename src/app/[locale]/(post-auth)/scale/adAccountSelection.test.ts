import { afterEach, describe, expect, it } from 'bun:test';

import {
  assignedAccountsForPlatform,
  chooseDefaultAdAccount,
  isSameAdAccount,
  rankPortfolioAccounts,
  readSavedAdAccount,
  saveAdAccount,
} from './adAccountSelection';

// The production shape of brand Home | Vivo47 (61b80f51) on 2026-10-07: the RPC lists the
// accounts by name, and both active portfolios live on VIVO47 MKT.
const VIVO_ASSIGNED = [
  { platform: 'google_ads', account_id: '3710693645', name: 'Vivo 47' },
  { platform: 'meta_ads', account_id: 'act_1164707387246066', name: 'Berna Pavón New' },
  { platform: 'meta_ads', account_id: 'act_941792232690867', name: 'Daniel Gutierrez Buendia' },
  { platform: 'meta_ads', account_id: 'act_1779847382038564', name: 'VIVO47 MKT' },
];
const VIVO_PORTFOLIOS = [
  { ad_account_id: 'act_1779847382038564', status: 'active', daily_total: 900 },
  { ad_account_id: 'act_1779847382038564', status: 'active', daily_total: 967.74 },
];

describe('assignedAccountsForPlatform', () => {
  it('keeps only the platform asked for, named, in the RPC spelling', () => {
    expect(assignedAccountsForPlatform(VIVO_ASSIGNED, 'meta')).toEqual([
      { id: 'act_1164707387246066', name: 'Berna Pavón New' },
      { id: 'act_941792232690867', name: 'Daniel Gutierrez Buendia' },
      { id: 'act_1779847382038564', name: 'VIVO47 MKT' },
    ]);
    expect(assignedAccountsForPlatform(VIVO_ASSIGNED, 'google-ads')).toEqual([
      { id: '3710693645', name: 'Vivo 47' },
    ]);
  });

  it('falls back to the id for a nameless account and is empty for platforms the RPC omits', () => {
    expect(
      assignedAccountsForPlatform(
        [{ platform: 'meta_ads', account_id: 'act_1', name: null }],
        'meta',
      ),
    ).toEqual([{ id: 'act_1', name: 'act_1' }]);
    expect(assignedAccountsForPlatform(VIVO_ASSIGNED, 'linkedin')).toEqual([]);
  });
});

describe('rankPortfolioAccounts', () => {
  it('ranks accounts by the daily budget their active portfolios carry, bare ids', () => {
    expect(
      rankPortfolioAccounts([
        { ad_account_id: 'act_small', status: 'active', daily_total: 50 },
        { ad_account_id: 'big', status: 'active', daily_total: 400 },
        { ad_account_id: 'act_small', status: 'active', daily_total: 60 },
      ]),
    ).toEqual(['big', 'small']);
  });

  it('breaks a budget tie by portfolio count and ignores inactive or unowned portfolios', () => {
    expect(
      rankPortfolioAccounts([
        { ad_account_id: 'one', status: 'active', daily_total: null },
        { ad_account_id: 'two', status: 'active', daily_total: null },
        { ad_account_id: 'two', status: 'active', daily_total: null },
        { ad_account_id: 'paused', status: 'paused', daily_total: 9999 },
        { ad_account_id: null, status: 'active', daily_total: 9999 },
      ]),
    ).toEqual(['two', 'one']);
  });
});

describe('chooseDefaultAdAccount', () => {
  const candidates = assignedAccountsForPlatform(VIVO_ASSIGNED, 'meta');
  const portfolioAccountRank = rankPortfolioAccounts(VIVO_PORTFOLIOS);

  it('opens Vivo47 on the account holding its portfolios, not the alphabetical first', () => {
    expect(chooseDefaultAdAccount({ candidates, savedAccountId: null, portfolioAccountRank })).toBe(
      'act_1779847382038564',
    );
  });

  it('prefers the saved choice, matched across act_ spellings', () => {
    expect(
      chooseDefaultAdAccount({
        candidates,
        savedAccountId: '941792232690867',
        portfolioAccountRank,
      }),
    ).toBe('act_941792232690867');
  });

  it('ignores a saved choice that is no longer assigned', () => {
    expect(
      chooseDefaultAdAccount({ candidates, savedAccountId: 'act_gone', portfolioAccountRank }),
    ).toBe('act_1779847382038564');
  });

  it('skips a portfolio account that is not a candidate and falls back to the first', () => {
    expect(
      chooseDefaultAdAccount({ candidates, savedAccountId: null, portfolioAccountRank: ['other'] }),
    ).toBe('act_1164707387246066');
    expect(
      chooseDefaultAdAccount({ candidates: [], savedAccountId: 'x', portfolioAccountRank }),
    ).toBeNull();
  });
});

describe('isSameAdAccount', () => {
  it('compares bare, and null only equals null', () => {
    expect(isSameAdAccount('act_1', '1')).toBe(true);
    expect(isSameAdAccount('act_1', 'act_2')).toBe(false);
    expect(isSameAdAccount(null, 'act_1')).toBe(false);
    expect(isSameAdAccount(null, null)).toBe(true);
  });
});

describe('saved ad account storage', () => {
  const originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');

  afterEach(() => {
    if (originalStorage) Object.defineProperty(window, 'localStorage', originalStorage);
    window.localStorage.clear();
  });

  it('round-trips per brand and per platform', () => {
    saveAdAccount('brand-a', 'meta', 'act_1');
    saveAdAccount('brand-a', 'google-ads', '99');
    expect(readSavedAdAccount('brand-a', 'meta')).toBe('act_1');
    expect(readSavedAdAccount('brand-a', 'google-ads')).toBe('99');
    expect(readSavedAdAccount('brand-b', 'meta')).toBeNull();
  });

  it('reads nothing and writes nothing, without throwing, when storage throws', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: storage blocked');
      },
    });
    expect(() => saveAdAccount('brand-a', 'meta', 'act_1')).not.toThrow();
    expect(readSavedAdAccount('brand-a', 'meta')).toBeNull();
  });
});
