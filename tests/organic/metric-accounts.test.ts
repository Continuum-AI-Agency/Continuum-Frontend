import assert from 'node:assert/strict';
import test from 'node:test';
import type { OnboardingConnectionState } from '../../src/lib/onboarding/state';
import {
  deriveMetricAccountsByPlatform,
  toMetricAccountOptions,
} from '../../src/lib/organic/metricAccounts';

function makeConnection(
  partial: Partial<OnboardingConnectionState> = {},
): OnboardingConnectionState {
  return {
    connected: false,
    accountId: null,
    accounts: [],
    integrationIds: [],
    lastSyncedAt: null,
    ...partial,
  };
}

test('prefers integration summary accounts over onboarding cache for metrics selector', () => {
  const onboardingInstagram = makeConnection({
    connected: true,
    accountId: 'stale-instagram-id',
    accounts: [{ id: 'stale-instagram-id', name: 'Stale IG', status: 'active', metadata: {} }],
  });
  const onboardingFacebook = makeConnection();

  const result = deriveMetricAccountsByPlatform({
    integrationSummary: {
      instagram: {
        accounts: [
          {
            integrationAccountId: 'live-instagram-id',
            name: 'Live Instagram',
            externalAccountId: '1789',
          },
        ],
      },
      facebook: { accounts: [] },
    },
    onboardingConnections: {
      instagram: onboardingInstagram,
      facebook: onboardingFacebook,
    },
  });

  assert.equal(result.instagram.length, 1);
  assert.equal(result.instagram[0]?.integrationAccountId, 'live-instagram-id');
  assert.equal(result.instagram[0]?.name, 'Live Instagram');
  assert.equal(result.instagram[0]?.externalAccountId, '1789');
});

test('falls back to onboarding accounts when integration summary has no platform accounts', () => {
  const onboardingInstagram = makeConnection({
    connected: true,
    accounts: [
      {
        id: 'onboarding-instagram-id',
        name: 'Onboarding IG',
        status: 'active',
        metadata: { externalAccountId: 'ig-ext' },
      },
    ],
  });
  const onboardingFacebook = makeConnection({
    connected: true,
    accountId: 'onboarding-facebook-id',
  });

  const result = deriveMetricAccountsByPlatform({
    integrationSummary: {
      instagram: { accounts: [] },
      facebook: { accounts: [] },
    },
    onboardingConnections: {
      instagram: onboardingInstagram,
      facebook: onboardingFacebook,
    },
  });

  assert.equal(result.instagram[0]?.integrationAccountId, 'onboarding-instagram-id');
  assert.equal(result.instagram[0]?.externalAccountId, 'ig-ext');
  assert.equal(result.facebook[0]?.integrationAccountId, 'onboarding-facebook-id');
  assert.equal(result.facebook[0]?.name, 'Facebook Page');
});

test('dedupes metric account options by integration account id', () => {
  const result = toMetricAccountOptions(
    makeConnection({
      connected: true,
      accounts: [
        {
          id: 'dup-id',
          name: 'Instagram A',
          status: 'active',
          metadata: { externalAccountId: '1' },
        },
        {
          id: 'dup-id',
          name: 'Instagram A Duplicate',
          status: 'active',
          metadata: { externalAccountId: '1' },
        },
      ],
    }),
    'Instagram account',
  );

  assert.equal(result.length, 1);
  assert.equal(result[0]?.integrationAccountId, 'dup-id');
});
