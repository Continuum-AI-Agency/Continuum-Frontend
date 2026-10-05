// The Overview's platform tabs — Todas · Meta · Google · TikTok — as the multi-platform plan
// recommends them (docs/optimizer-multiplatform/frontend.html §2, MP1 for "All", MP2 inside each
// tab). The ids are the canonical ones `packages/contracts/src/paid/platform.ts` settles on
// (`meta | google_ads | tiktok_ads`), so this vocabulary never adds a fifth spelling of Google.

import type { AdAccount } from '@continuum/contracts';

export const AD_PLATFORMS = ['meta', 'google_ads', 'tiktok_ads'] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];

export const PLATFORM_TABS = ['all', ...AD_PLATFORMS] as const;
export type PlatformTab = (typeof PLATFORM_TABS)[number];

export const PLATFORM_NAMES: Record<AdPlatform, string> = {
  meta: 'Meta',
  google_ads: 'Google',
  tiktok_ads: 'TikTok',
};

const TAB_LABELS: Record<PlatformTab, string> = { all: 'All', ...PLATFORM_NAMES };

export function platformTabLabel(tab: PlatformTab): string {
  return TAB_LABELS[tab];
}

/** `?platform=` → the tab. Anything unknown or absent is "All": a bad link opens the account,
 *  never an error. */
export function parsePlatformTab(raw: string | null): PlatformTab {
  return PLATFORM_TABS.find((tab) => tab === raw) ?? 'all';
}

/**
 * The platform every portfolio, card and row on the Overview belongs to today. Every optimizer
 * read is wired to Meta (useOptimizerData posts `platform: 'meta'` to paid-media-metrics and
 * the engine ingests Meta snapshots only), so nothing it shows can be anything else. When
 * PortfolioListItem gains its own `platform`, read it there and delete this.
 */
export const OPTIMIZER_MANAGED_PLATFORM: AdPlatform = 'meta';

/** The platforms a portfolio holds. PortfolioListItem carries no `platforms` yet, and every
 *  portfolio the engine runs is on OPTIMIZER_MANAGED_PLATFORM. When the list item gains
 *  `platforms[]` (derived from its members), read it there and delete this. */
export const OPTIMIZER_PORTFOLIO_PLATFORMS: readonly AdPlatform[] = [OPTIMIZER_MANAGED_PLATFORM];

/** A loose read-model value (a jsonb field, a row the contract has not caught up with) as one
 *  of the canonical platform ids, or null when it names none of them. */
export function readAdPlatform(raw: unknown): AdPlatform | null {
  return AD_PLATFORMS.find((platform) => platform === raw) ?? null;
}

/** list_brand_ad_accounts spells Meta `meta_ads` and Google `google_ads`; it has no TikTok row. */
function accountPlatform(account: AdAccount): AdPlatform | null {
  if (account.platform === 'meta_ads' || account.platform === 'meta') return 'meta';
  if (account.platform === 'google_ads' || account.platform === 'google-ads') return 'google_ads';
  return null;
}

/** The brand's granted accounts on one platform, in the order the RPC returned them. */
export function accountsOn(accounts: readonly AdAccount[], platform: AdPlatform): AdAccount[] {
  return accounts.filter((account) => accountPlatform(account) === platform);
}

/**
 * Whether each platform has an account granted to this brand. TikTok Ads has no connector yet,
 * so it is never connected — it stays in the row with "Connect" rather than disappearing.
 */
export function connectedPlatforms(accounts: readonly AdAccount[]): Record<AdPlatform, boolean> {
  return {
    meta: accountsOn(accounts, 'meta').length > 0,
    google_ads: accountsOn(accounts, 'google_ads').length > 0,
    tiktok_ads: false,
  };
}

/** "All" and "Meta" share the O1 layout (cards, portfolio rows); "All" leads with the multi-platform
 *  producer, "Meta" with today's O1 figures. Google and TikTok are their own screens. */
export function rendersManagedOverview(
  tab: PlatformTab,
): tab is 'all' | 'meta' {
  return tab === 'all' || tab === OPTIMIZER_MANAGED_PLATFORM;
}
