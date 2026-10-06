import {
  type ConversationDataAccount,
  normalizeAdAccountId,
  type PlatformId,
} from '@continuum/contracts';
import { resolveAssetLabel } from '@/lib/integrations/assetLabel';
import type { BrandIntegrationAccountSummary } from '@/lib/integrations/brandProfile';

type Account = Pick<
  BrandIntegrationAccountSummary,
  'integrationAccountId' | 'externalAccountId' | 'alias' | 'name' | 'type'
>;
export type JainaAccountOption = {
  id: string;
  label: string;
  platform: 'meta' | 'google_ads' | 'tiktok_ads';
};

/** The integration types that are a TikTok Marketing API advertiser. The `tiktokAds` key also
 *  resolves from them alone, but a summary cached before that mapping can still hand back an
 *  organic creator profile, and Jaina cannot read ad metrics from one. */
const TIKTOK_AD_ACCOUNT_TYPES: ReadonlySet<string> = new Set([
  'tiktok_advertiser',
  'tiktok_ads_advertiser',
  'tiktok_ad_account',
  'tiktok_ads_account',
]);

function isOfferable(platform: JainaAccountOption['platform'], account: Account): boolean {
  if (platform === 'meta') return account.type === 'meta_ad_account';
  if (platform === 'tiktok_ads') return TIKTOK_AD_ACCOUNT_TYPES.has(account.type ?? '');
  return true;
}

export function jainaAccountOptions(
  primaryId: string | null,
  integrations?: {
    facebook?: { accounts: Account[] };
    googleAds?: { accounts: Account[] };
    tiktokAds?: { accounts: Account[] };
  },
): JainaAccountOption[] {
  const options: JainaAccountOption[] = [];
  const seen = new Set<string>();
  for (const [platform, accounts] of [
    ['meta', integrations?.facebook?.accounts],
    ['google_ads', integrations?.googleAds?.accounts],
    ['tiktok_ads', integrations?.tiktokAds?.accounts],
  ] as const) {
    for (const account of accounts ?? []) {
      if (!isOfferable(platform, account)) continue;
      const source = account.externalAccountId ?? account.integrationAccountId;
      const key =
        platform === 'meta' ? normalizeAdAccountId(source) : source.trim().replace(/-/g, '');
      if (seen.has(`${platform}:${key}`)) continue;
      seen.add(`${platform}:${key}`);
      const isPrimary =
        primaryId &&
        key ===
          (platform === 'meta'
            ? normalizeAdAccountId(primaryId)
            : primaryId.trim().replace(/-/g, ''));
      options.push({
        id: isPrimary ? primaryId : source,
        platform,
        label:
          account.alias ??
          resolveAssetLabel({
            name: account.name,
            type: account.type,
            external_id: account.externalAccountId,
          }),
      });
    }
  }
  if (!primaryId) return options;
  const primary = options.find((option) => option.id === primaryId);
  return [
    primary ?? { id: primaryId, label: primaryId, platform: 'meta' },
    ...options.filter((option) => option !== primary),
  ];
}

/** The data-scope contract names TikTok once, for organic and ads alike; Jaina holds no TikTok
 *  read tool yet, so the Backend states the account to the model and reads nothing from it. */
const TURN_PLATFORM: Record<JainaAccountOption['platform'], ConversationDataAccount['platform']> = {
  meta: 'meta',
  google_ads: 'google_ads',
  tiktok_ads: 'tiktok',
};

/**
 * The accounts a turn is scoped to, each with its own platform. Null keeps the legacy request —
 * one Meta account, said by `adAccountId` alone; a Google or TikTok account, or more than one,
 * has to be said, or the Backend reads every id as Meta.
 */
export function jainaTurnAccounts(
  options: readonly JainaAccountOption[],
  selectedIds: readonly string[],
): ConversationDataAccount[] | null {
  const selected = options.filter((option) => selectedIds.includes(option.id));
  if (selected.length <= 1 && selected.every((option) => option.platform === 'meta')) return null;
  return selected.map((option) => ({
    platform: TURN_PLATFORM[option.platform],
    accountId: option.id,
  }));
}

/** The brand's account on the platform a deep link names; null when it has none there or the
 *  link names Meta, whose account is already the primary. */
export function jainaAccountForPlatform(
  options: readonly JainaAccountOption[],
  platform: PlatformId | null,
): JainaAccountOption | null {
  if (platform == null || platform === 'meta') return null;
  return options.find((option) => option.platform === platform) ?? null;
}
