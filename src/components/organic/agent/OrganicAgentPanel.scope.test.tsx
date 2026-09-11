import { describe, expect, it } from 'bun:test';
import { buildOrganicScopeOptions, scopeOrganicPlatformAccounts } from './OrganicAgentPanel';

const accountIds = {
  instagram: 'ig-1',
  facebook: 'fb-1',
};

describe('OrganicAgentPanel account scope', () => {
  it('keeps every existing default selected on first render', () => {
    expect(scopeOrganicPlatformAccounts(accountIds, Object.keys(accountIds))).toEqual(accountIds);
  });

  it('can exclude one platform account or explicitly select none', () => {
    expect(scopeOrganicPlatformAccounts(accountIds, ['instagram'])).toEqual({ instagram: 'ig-1' });
    expect(scopeOrganicPlatformAccounts(accountIds, [])).toEqual({});
  });

  it('names the currently selected account from the available options', () => {
    expect(
      buildOrganicScopeOptions(accountIds, {
        instagram: [
          { id: 'ig-other', label: 'Other Instagram' },
          { id: 'ig-1', label: 'Main Instagram' },
        ],
        facebook: [{ id: 'fb-1', label: 'Main Facebook' }],
      }),
    ).toEqual([
      { id: 'instagram', label: 'Instagram · Main Instagram' },
      { id: 'facebook', label: 'Facebook · Main Facebook' },
    ]);
  });
});
