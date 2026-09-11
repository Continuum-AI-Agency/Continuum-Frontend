import { describe, expect, it } from 'bun:test';

import { conversationDataScopeV1Schema } from './conversation-data-scope';

describe('conversationDataScopeV1Schema', () => {
  it('accepts platform-tagged accounts and intersecting entity constraints', () => {
    const parsed = conversationDataScopeV1Schema.parse({
      schemaVersion: 1,
      accounts: [
        { platform: 'meta', accountId: 'act_1' },
        { platform: 'google_ads', accountId: 'customers/2' },
      ],
      campaigns: {
        ids: ['campaign-1'],
        filters: {
          statuses: ['ACTIVE'],
          objectives: ['OUTCOME_SALES'],
          nameQuery: 'summer',
        },
      },
      groups: { filters: { types: ['PROSPECTING'] } },
      ads: { ids: ['ad-1'] },
    });

    expect(parsed.accounts[1]?.platform).toBe('google_ads');
    expect(parsed.campaigns?.ids).toEqual(['campaign-1']);
    expect(parsed.campaigns?.filters?.statuses).toEqual(['ACTIVE']);
    expect(parsed.groups?.filters?.types).toEqual(['PROSPECTING']);
  });

  it.each([
    'meta',
    'google_ads',
    'facebook',
    'instagram',
    'linkedin',
    'tiktok',
    'youtube',
  ])('accepts the %s platform', (platform) => {
    expect(
      conversationDataScopeV1Schema.safeParse({
        schemaVersion: 1,
        accounts: [{ platform, accountId: 'account-1' }],
      }).success,
    ).toBe(true);
  });

  it('rejects more than ten accounts and duplicate platform/account pairs', () => {
    const tooMany = Array.from({ length: 11 }, (_, index) => ({
      platform: 'instagram',
      accountId: `account-${index}`,
    }));
    expect(
      conversationDataScopeV1Schema.safeParse({ schemaVersion: 1, accounts: tooMany }).success,
    ).toBe(false);
    expect(
      conversationDataScopeV1Schema.safeParse({
        schemaVersion: 1,
        accounts: [
          { platform: 'meta', accountId: 'act_1' },
          { platform: 'meta', accountId: 'act_1' },
        ],
      }).success,
    ).toBe(false);
  });

  it('preserves absent entity scope as all authorized and ids: [] as explicitly empty', () => {
    const all = conversationDataScopeV1Schema.parse({
      schemaVersion: 1,
      accounts: [{ platform: 'facebook', accountId: 'page-1' }],
    });
    const empty = conversationDataScopeV1Schema.parse({
      schemaVersion: 1,
      accounts: [{ platform: 'facebook', accountId: 'page-1' }],
      campaigns: { ids: [] },
    });

    expect(all.campaigns).toBeUndefined();
    expect(empty.campaigns?.ids).toEqual([]);
  });

  it('rejects an entity scope that expresses no selection or filter', () => {
    expect(
      conversationDataScopeV1Schema.safeParse({
        schemaVersion: 1,
        accounts: [{ platform: 'meta', accountId: 'act_1' }],
        campaigns: {},
      }).success,
    ).toBe(false);
  });
});
