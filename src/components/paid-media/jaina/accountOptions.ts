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
export type JainaAccountOption = { id: string; label: string; platform: 'meta' | 'google_ads' };

export function jainaAccountOptions(
  primaryId: string | null,
  integrations?: {
    facebook?: { accounts: Account[] };
    googleAds?: { accounts: Account[] };
  },
): JainaAccountOption[] {
  const options: JainaAccountOption[] = [];
  const seen = new Set<string>();
  for (const [platform, accounts] of [
    ['meta', integrations?.facebook?.accounts],
    ['google_ads', integrations?.googleAds?.accounts],
  ] as const) {
    for (const account of accounts ?? []) {
      if (platform === 'meta' && account.type !== 'meta_ad_account') continue;
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

/**
 * The accounts a turn is scoped to, each with its own platform. Null keeps the legacy request —
 * one Meta account, said by `adAccountId` alone; a Google account, or more than one, has to be
 * said, or the Backend reads every id as Meta.
 */
export function jainaTurnAccounts(
  options: readonly JainaAccountOption[],
  selectedIds: readonly string[],
): ConversationDataAccount[] | null {
  const selected = options.filter((option) => selectedIds.includes(option.id));
  if (selected.length <= 1 && selected.every((option) => option.platform === 'meta')) return null;
  return selected.map((option) => ({ platform: option.platform, accountId: option.id }));
}

/** The brand's account on the platform a deep link names; null when it has none there (TikTok
 *  has no connector yet) or the link names Meta, whose account is already the primary. */
export function jainaAccountForPlatform(
  options: readonly JainaAccountOption[],
  platform: PlatformId | null,
): JainaAccountOption | null {
  if (platform == null || platform === 'meta') return null;
  return options.find((option) => option.platform === platform) ?? null;
}
