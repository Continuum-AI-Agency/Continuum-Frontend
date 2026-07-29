import { describe, expect, it } from 'bun:test';
import type {
  BrandIntegrationAccountSummary,
  BrandIntegrationSummary,
} from '@/lib/integrations/brandProfile';
import {
  deriveOrganicPlatformAccounts,
  deriveOrganicPublishAccountOptions,
} from './platformAccountOptions';

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

const summary: Partial<BrandIntegrationSummary> = {
  instagram: {
    accounts: [
      account({ integrationAccountId: 'ig-main', name: 'Main IG', alias: 'Main profile' }),
      account({ integrationAccountId: 'ig-second', name: 'Second IG' }),
    ],
  },
  linkedin: { accounts: [account({ integrationAccountId: 'li-page', name: 'Company page' })] },
  facebook: { accounts: [] },
};

describe('deriveOrganicPlatformAccounts', () => {
  it('prefers the alias over the raw account name for the option label', () => {
    const rows = deriveOrganicPlatformAccounts({ integrationSummary: summary });
    const instagram = rows.find((row) => row.platform === 'instagram');

    expect(instagram?.options).toEqual([
      { id: 'ig-main', label: 'Main profile' },
      { id: 'ig-second', label: 'Second IG' },
    ]);
  });

  it('treats a brand-assigned account as connected even with no personal OAuth link', () => {
    const rows = deriveOrganicPlatformAccounts({ integrationSummary: summary, connections: {} });

    expect(rows.find((row) => row.platform === 'instagram')?.connected).toBe(true);
    expect(rows.find((row) => row.platform === 'facebook')?.connected).toBe(false);
  });

  it('honours a personally connected platform that has no assigned accounts', () => {
    const rows = deriveOrganicPlatformAccounts({
      integrationSummary: summary,
      connections: { facebook: { connected: true, accountId: 'fb-personal' } },
    });
    const facebook = rows.find((row) => row.platform === 'facebook');

    expect(facebook?.connected).toBe(true);
    expect(facebook?.accountId).toBe('fb-personal');
    expect(facebook?.options).toEqual([]);
  });

  it('defaults to the first assigned account when onboarding named none', () => {
    const rows = deriveOrganicPlatformAccounts({ integrationSummary: summary });

    expect(rows.find((row) => row.platform === 'instagram')?.accountId).toBe('ig-main');
    expect(rows.find((row) => row.platform === 'facebook')?.accountId).toBeNull();
  });

  it('covers only the MVP platforms unless a wider set is asked for', () => {
    expect(
      deriveOrganicPlatformAccounts({ integrationSummary: summary }).map((r) => r.platform),
    ).toEqual(['instagram', 'facebook', 'linkedin']);
    expect(
      deriveOrganicPlatformAccounts({
        integrationSummary: summary,
        platforms: ['tiktok'],
      }).map((row) => row.platform),
    ).toEqual(['tiktok']);
  });

  it('survives a missing integration summary', () => {
    const rows = deriveOrganicPlatformAccounts({ integrationSummary: null });
    expect(rows.every((row) => row.connected === false && row.options.length === 0)).toBe(true);
  });
});

describe('deriveOrganicPublishAccountOptions', () => {
  it('flattens every publishable pair so platform and account move together', () => {
    expect(deriveOrganicPublishAccountOptions(summary)).toEqual([
      {
        platform: 'instagram',
        platformLabel: 'Instagram',
        accountId: 'ig-main',
        label: 'Main profile',
      },
      {
        platform: 'instagram',
        platformLabel: 'Instagram',
        accountId: 'ig-second',
        label: 'Second IG',
      },
      {
        platform: 'linkedin',
        platformLabel: 'LinkedIn',
        accountId: 'li-page',
        label: 'Company page',
      },
    ]);
  });

  it('never offers a platform the organic publisher does not support', () => {
    const options = deriveOrganicPublishAccountOptions({
      ...summary,
      tiktok: { accounts: [account({ integrationAccountId: 'tt-1', name: 'TikTok' })] },
    });

    expect(options.some((option) => option.platform === 'tiktok')).toBe(false);
  });
});
