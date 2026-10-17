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
  linkedin: {
    accounts: [
      account({
        integrationAccountId: 'li-page',
        name: 'Company page',
        type: 'linkedin_organization',
      }),
    ],
  },
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

  // A personal link is not a brand assignment, so it names nothing to post to.
  it('honours a personally connected platform without inventing an account for it', () => {
    const rows = deriveOrganicPlatformAccounts({
      integrationSummary: summary,
      connections: { facebook: { connected: true, accountId: 'fb-personal' } },
    });
    const facebook = rows.find((row) => row.platform === 'facebook');

    expect(facebook?.connected).toBe(true);
    expect(facebook?.accountId).toBeNull();
    expect(facebook?.options).toEqual([]);
  });

  it('names a default only when exactly one account can take the post', () => {
    const rows = deriveOrganicPlatformAccounts({ integrationSummary: summary });

    expect(rows.find((row) => row.platform === 'linkedin')?.accountId).toBe('li-page');
    // Two Instagram profiles is a choice; the first by name is not an answer.
    expect(rows.find((row) => row.platform === 'instagram')?.accountId).toBeNull();
    expect(rows.find((row) => row.platform === 'facebook')?.accountId).toBeNull();
  });

  it('never offers an ad account as a place to post', () => {
    const rows = deriveOrganicPlatformAccounts({
      integrationSummary: {
        facebook: {
          accounts: [
            // Sorts first by name, as it did for Pink Elephant.
            account({ integrationAccountId: 'fb-ads', name: 'Avendaño', type: 'meta_ad_account' }),
            account({ integrationAccountId: 'fb-page', name: 'Brand Page', type: 'meta_page' }),
          ],
        },
        linkedin: {
          accounts: [
            account({ integrationAccountId: 'li-ads', name: 'Ads', type: 'linkedin_ad_account' }),
          ],
        },
      },
    });
    const facebook = rows.find((row) => row.platform === 'facebook');
    const linkedin = rows.find((row) => row.platform === 'linkedin');

    expect(facebook?.options).toEqual([{ id: 'fb-page', label: 'Brand Page' }]);
    expect(facebook?.accountId).toBe('fb-page');
    expect(linkedin?.options).toEqual([]);
    expect(linkedin?.connected).toBe(false);
  });

  // The planner page resolves a publish account id per platform from this list. It stopped at
  // Instagram/Facebook/LinkedIn, so a TikTok draft never had an account id to publish with.
  it('covers every publishable platform unless a narrower set is asked for', () => {
    expect(
      deriveOrganicPlatformAccounts({ integrationSummary: summary }).map((r) => r.platform),
    ).toEqual(['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'x']);
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

  it('offers TikTok and X, which have publishers', () => {
    const options = deriveOrganicPublishAccountOptions({
      ...summary,
      tiktok: { accounts: [account({ integrationAccountId: 'tt-1', name: 'TikTok' })] },
      x: { accounts: [account({ integrationAccountId: 'x-1', name: 'X handle' })] },
    });

    expect(options.find((option) => option.platform === 'tiktok')).toEqual({
      platform: 'tiktok',
      platformLabel: 'TikTok',
      accountId: 'tt-1',
      label: 'TikTok',
    });
    // X ships a publisher since 2026-10-06.
    expect(options.map((option) => option.accountId)).toContain('x-1');
  });
});
