import { normalizeAdAccountId } from '@continuum/contracts';
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
