import type { OrganicMetricPlatform } from '@continuum/contracts';
import { blendMetric, groupAccountsByPlatform } from '@/lib/organic/blendAccounts';
import {
  type BrandOrganicSnapshot,
  metricDeltaForAccount,
  metricValueForAccount,
} from '@/lib/organic/brandOrganicSnapshot';

export type OrganicReachRow = {
  platform: OrganicMetricPlatform;
  /** The platform's reach: the Compare view's blend when several accounts share it. */
  reach: number | undefined;
  deltaPct: number | undefined;
  accounts: Array<{
    integrationAccountId: string;
    name: string;
    reach: number | undefined;
    fetchedAt?: string;
  }>;
};

/** Per-platform organic reach, rolled up exactly as OrganicCompareView's Blend does. */
export function organicReachByPlatform(snapshot: BrandOrganicSnapshot): OrganicReachRow[] {
  return [...groupAccountsByPlatform(snapshot.accounts)].map(([platform, accounts]) => {
    const single = accounts.length === 1 ? accounts[0] : null;
    const blended = single ? null : blendMetric(accounts, 'reach');
    return {
      platform,
      reach: single
        ? metricValueForAccount(single, 'reach')
        : blended?.kind === 'sum'
          ? blended.total
          : undefined,
      deltaPct: single
        ? metricDeltaForAccount(single, 'reach')
        : blended?.kind === 'sum'
          ? (blended.comparison?.percentageChange ?? undefined)
          : undefined,
      accounts: accounts.map((account) => ({
        integrationAccountId: account.integrationAccountId,
        name: account.name,
        reach: metricValueForAccount(account, 'reach'),
        fetchedAt: account.fetchedAt,
      })),
    };
  });
}

/**
 * The one window both sides report on: the organic snapshot's resolved dates. Paid is then
 * asked for exactly those dates, because the two edges resolve the same preset differently
 * (organic ends yesterday, paid today) and "last 7 days" would silently mean two periods.
 */
export function organicPeriod(
  snapshot: BrandOrganicSnapshot,
): { since: string; until: string } | null {
  const range = snapshot.accounts[0]?.range;
  return range ? { since: range.since, until: range.until } : null;
}
