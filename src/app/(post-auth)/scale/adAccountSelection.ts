// Which ad account the Scale page opens on, and remembering the one the person picked.
//
// The server seed (resolveInitialMetaAdAccountId) takes the first ASSIGNED account, and
// plugin_mcp.list_brand_ad_accounts orders by name — so a brand whose portfolios live on
// "VIVO47 MKT" reopened on "Berna Pavón New" every reload and read "No portfolios on this
// ad account". The order here is: the person's own saved choice, then the account that
// holds the brand's active portfolios (the one spending most through them first), then
// the first candidate.
//
// The choice is per-viewer UI state, so it lives in localStorage keyed by brand and
// platform. Storage can be absent or throw (private window, blocked site data); every
// access is wrapped and a failure reads as "nothing saved".

import { bareAccountId } from '@/lib/paid-media/accountId';
import type { PaidMediaPlatform } from '@/lib/paid-media/performance-types';

const STORAGE_PREFIX = 'continuum:scale:ad-account';

export type AccountCandidate = { id: string; name: string };

export type AssignedAccountRow = {
  platform: string;
  account_id: string;
  name: string | null;
};

export type PortfolioAccountRow = {
  ad_account_id: string | null;
  status: string;
  daily_total: number | null;
};

// list_brand_ad_accounts names platforms 'meta_ads' / 'google_ads'; the page names them
// 'meta' / 'google-ads'. Other platforms are not in that RPC.
const ASSIGNED_PLATFORM: Partial<Record<PaidMediaPlatform, string>> = {
  meta: 'meta_ads',
  'google-ads': 'google_ads',
};

function storageKey(brandId: string, platform: PaidMediaPlatform): string {
  return `${STORAGE_PREFIX}:${brandId}:${platform}`;
}

export function readSavedAdAccount(brandId: string, platform: PaidMediaPlatform): string | null {
  try {
    const value = window.localStorage.getItem(storageKey(brandId, platform));
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveAdAccount(
  brandId: string,
  platform: PaidMediaPlatform,
  accountId: string,
): void {
  try {
    window.localStorage.setItem(storageKey(brandId, platform), accountId);
  } catch {
    // Remembering the choice is a convenience; the page works without it.
  }
}

/** The brand's assigned accounts for one platform, named, in the selector's shape. */
export function assignedAccountsForPlatform(
  rows: readonly AssignedAccountRow[],
  platform: PaidMediaPlatform,
): AccountCandidate[] {
  const wanted = ASSIGNED_PLATFORM[platform];
  if (!wanted) return [];
  return rows
    .filter((row) => row.platform === wanted && row.account_id.length > 0)
    .map((row) => ({ id: row.account_id, name: row.name ?? row.account_id }));
}

/** Bare account ids that hold the brand's active portfolios, the largest daily budget
 *  through them first, then the most portfolios. */
export function rankPortfolioAccounts(portfolios: readonly PortfolioAccountRow[]): string[] {
  const totals = new Map<string, { budget: number; count: number }>();
  for (const portfolio of portfolios) {
    if (!portfolio.ad_account_id || portfolio.status !== 'active') continue;
    const id = bareAccountId(portfolio.ad_account_id);
    const entry = totals.get(id) ?? { budget: 0, count: 0 };
    entry.budget += portfolio.daily_total ?? 0;
    entry.count += 1;
    totals.set(id, entry);
  }
  return Array.from(totals.entries())
    .sort(([, a], [, b]) => b.budget - a.budget || b.count - a.count)
    .map(([id]) => id);
}

/** The account to open on, spelled as the candidate spells it; null when there is none. */
export function chooseDefaultAdAccount(params: {
  candidates: readonly AccountCandidate[];
  savedAccountId: string | null;
  portfolioAccountRank: readonly string[];
}): string | null {
  const { candidates, savedAccountId, portfolioAccountRank } = params;
  const byBareId = new Map(candidates.map((candidate) => [bareAccountId(candidate.id), candidate]));

  if (savedAccountId) {
    const saved = byBareId.get(bareAccountId(savedAccountId));
    if (saved) return saved.id;
  }
  for (const rankedId of portfolioAccountRank) {
    const holder = byBareId.get(rankedId);
    if (holder) return holder.id;
  }
  return candidates[0]?.id ?? null;
}

export function isSameAdAccount(a: string | null, b: string | null): boolean {
  if (a == null || b == null) return a === b;
  return bareAccountId(a) === bareAccountId(b);
}
