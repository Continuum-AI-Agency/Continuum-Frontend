'use client';

// What the Home's tiles share about the brand's accounts: the ad account the Home reads (with the
// currency its row stores), why Google refused every read when it did — said in the Google tab's
// own words (useGoogleRefusal) — and the brand's 7-day organic rollups.

import type { AdAccount } from '@continuum/contracts';
import { useEffect, useMemo, useState } from 'react';
import {
  type GoogleReadFailureState,
  googleReadFailure,
  isGoogleNoAccess,
  isGoogleRefusal,
} from '@/components/paid-media/optimizer/sections/platforms/useGoogleAdsOverview';
import { useBrandRole } from '@/lib/library/useBrandRole';
import {
  type BrandOrganicSnapshot,
  loadBrandOrganicSnapshot,
  type SnapshotAccountRef,
} from '@/lib/organic/brandOrganicSnapshot';

export type HomeAdPlatform = 'meta' | 'google_ads';

/** An ad account the Home reads. `currency` is what its account row stores, null when the row
 *  has none (money from such an account is never added to another account's). */
export type HomeAdAccount = {
  id: string;
  name: string;
  currency: string | null;
  platform: HomeAdPlatform;
};

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

/** An account whose read failed, and what the read threw: the edge's own answer when it gave one
 *  (EdgeReadError keeps its words, its typed code and its HTTP status). */
export type AccountReadFailure = { account: HomeAdAccount; error: unknown };

/**
 * The failure that explains why no account answered, when every read that failed is a Google
 * account the edge refused (no access, or a login Google refused); null otherwise — any other
 * failure is one Retry can fix, and "the ad platform didn't answer" stays true.
 */
export function googleRefusalOf(failures: AccountReadFailure[]): AccountReadFailure | null {
  const [first] = failures;
  const allRefused = failures.every(
    ({ account, error }) => account.platform === 'google_ads' && isGoogleRefusal(error),
  );
  return first && allRefused ? first : null;
}

function googleAdAccountOf(account: HomeAdAccount): AdAccount {
  return {
    platform: account.platform,
    account_id: account.id,
    name: account.name,
    status: null,
    currency: account.currency,
  };
}

/**
 * What the Home says when Google refused every read it made: the Google tab's own state for the
 * first refused account (googleReadFailure), the caller's role read only after a no-access
 * refusal, as the tab does. Null when the reads did not fail that way.
 */
export function useGoogleRefusal(
  brandId: string,
  load: { status: 'loading' } | { status: 'error'; failures: AccountReadFailure[] },
): GoogleReadFailureState | null {
  const refusal = load.status === 'error' ? googleRefusalOf(load.failures) : null;
  const role = useBrandRole(refusal && isGoogleNoAccess(refusal.error) ? brandId : null);
  if (!refusal) return null;
  return googleReadFailure(refusal.error, googleAdAccountOf(refusal.account), role);
}

export function useOrganicSnapshot(brandId: string, accounts: SnapshotAccountRef[], attempt = 0) {
  const [state, setState] = useState<Load<BrandOrganicSnapshot>>({ status: 'loading' });
  const key = accounts
    .map((account) => `${account.platform}|${account.integrationAccountId}|${account.name}`)
    .join(',');
  // Rebuilt from the key so a new array with the same accounts does not refetch.
  const stableAccounts = useMemo<SnapshotAccountRef[]>(
    () =>
      key
        ? key.split(',').map((entry) => {
            const [platform, integrationAccountId, ...name] = entry.split('|');
            return {
              platform: platform as SnapshotAccountRef['platform'],
              integrationAccountId: integrationAccountId ?? '',
              name: name.join('|'),
            };
          })
        : [],
    [key],
  );

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    loadBrandOrganicSnapshot({ brandId, accounts: stableAccounts, rangePreset: 'last_7d' })
      .then((data) => !cancelled && setState({ status: 'ready', data }))
      .catch(() => !cancelled && setState({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [brandId, stableAccounts, attempt]);

  return state;
}
