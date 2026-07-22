import { describe, expect, it } from 'bun:test';
import type { OnboardingConnectionState } from '@/lib/onboarding/state';
import { deriveMetricAccountsByPlatform } from './metricAccounts';

const emptyConnection = {
  connected: false,
  accountId: null,
  accounts: [],
} as unknown as OnboardingConnectionState;

const emptySummaryPlatform = { accounts: [] };

describe('deriveMetricAccountsByPlatform', () => {
  it('derives a youtube lane from the integration summary', () => {
    const result = deriveMetricAccountsByPlatform({
      integrationSummary: {
        instagram: emptySummaryPlatform,
        facebook: emptySummaryPlatform,
        tiktok: emptySummaryPlatform,
        youtube: {
          accounts: [
            { integrationAccountId: 'yt-1', name: 'Brand Channel', externalAccountId: 'UC123' },
          ],
        },
      },
      onboardingConnections: { instagram: emptyConnection, facebook: emptyConnection },
    });

    expect(result.youtube).toEqual([
      { integrationAccountId: 'yt-1', name: 'Brand Channel', externalAccountId: 'UC123' },
    ]);
  });

  it('returns an empty youtube lane when no youtube accounts exist', () => {
    const result = deriveMetricAccountsByPlatform({
      integrationSummary: {
        instagram: emptySummaryPlatform,
        facebook: emptySummaryPlatform,
        tiktok: emptySummaryPlatform,
        youtube: emptySummaryPlatform,
      },
      onboardingConnections: { instagram: emptyConnection, facebook: emptyConnection },
    });

    expect(result.youtube).toEqual([]);
  });
});
