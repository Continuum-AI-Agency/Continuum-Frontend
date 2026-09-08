import { describe, expect, it } from 'bun:test';
import type { BrandIntegrationAccountSummary } from '@/lib/integrations/brandProfile';
import { deriveAdAccountOptions } from './ProjectScopePicker';

function account(
  overrides: Partial<BrandIntegrationAccountSummary> & { integrationAccountId: string },
): BrandIntegrationAccountSummary {
  return {
    assignmentId: `assign-${overrides.integrationAccountId}`,
    name: 'Account',
    alias: null,
    externalAccountId: null,
    status: 'active',
    linkedAt: null,
    providerIntegrationId: 'provider-1',
    type: null,
    settings: null,
    ownerUserId: null,
    ...overrides,
  };
}

describe('deriveAdAccountOptions', () => {
  it('stores the provider id, not the internal assignment uuid', () => {
    const options = deriveAdAccountOptions({
      facebook: {
        accounts: [account({ integrationAccountId: 'uuid-1', externalAccountId: 'act_123' })],
      },
    });

    // The whole point: Project.adAccountIds is compared against provider ids by every
    // downstream reader, so persisting the internal uuid would silently match nothing.
    expect(options).toEqual([
      { id: 'act_123', name: 'Account', platform: 'facebook', platformLabel: 'Meta' },
    ]);
  });

  it('falls back to the internal id only when there is no provider id', () => {
    const options = deriveAdAccountOptions({
      linkedin: { accounts: [account({ integrationAccountId: 'uuid-2' })] },
    });
    expect(options.map((option) => option.id)).toEqual(['uuid-2']);
  });

  it('excludes organic-only platforms', () => {
    const options = deriveAdAccountOptions({
      instagram: {
        accounts: [account({ integrationAccountId: 'uuid-3', externalAccountId: 'ig_1' })],
      },
      facebook: {
        accounts: [account({ integrationAccountId: 'uuid-4', externalAccountId: 'act_9' })],
      },
    });
    expect(options.map((option) => option.id)).toEqual(['act_9']);
  });

  it('lists an account assigned under two platforms once', () => {
    const shared = { integrationAccountId: 'uuid-5', externalAccountId: 'act_dup' };
    const options = deriveAdAccountOptions({
      facebook: { accounts: [account(shared)] },
      googleAds: { accounts: [account(shared)] },
    });
    expect(options).toHaveLength(1);
    expect(options[0]?.platformLabel).toBe('Meta');
  });

  it('prefers the alias a member gave the account over the provider name', () => {
    const options = deriveAdAccountOptions({
      googleAds: {
        accounts: [
          account({
            integrationAccountId: 'uuid-6',
            externalAccountId: '555',
            name: 'Provider name',
            alias: 'House account',
          }),
        ],
      },
    });
    expect(options[0]?.name).toBe('House account');
  });

  it('returns nothing when the summary has not loaded', () => {
    expect(deriveAdAccountOptions(undefined)).toEqual([]);
  });
});
