import { SelectableAsset, SelectableAssetsResponse } from "@/lib/schemas/integrations";
import type { PlatformKey } from "@/components/onboarding/platforms";
import type { BrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import { isHigherPrivilegeRole } from "@/lib/integrations/metaRole";

// #155: the same Meta ad account reached through two logins arrives as two rows
// with the same `ad_account_id` but different `asset_pk`/`integration_account_id`.
// When collapsing to one visible row, keep the higher-privilege login's row so
// the account stays fully actionable rather than pinned to a read-only login.
function pickHigherPrivilegeAsset(existing: SelectableAsset, incoming: SelectableAsset): SelectableAsset {
  return isHigherPrivilegeRole(incoming.role ?? "unknown", existing.role ?? "unknown") ? incoming : existing;
}

export type MetaSelectableAdAccountBundle = {
  ad_account_id: string;
  ad_account: SelectableAsset | null;
  assets: SelectableAsset[];
};

export type MetaSelectableAdAccountBundles = {
  ad_accounts: MetaSelectableAdAccountBundle[];
  assets_without_ad_account: SelectableAsset[];
};

const FALLBACK_TYPE_BY_PLATFORM: Record<PlatformKey, string> = {
  youtube: "youtube_channel",
  instagram: "meta_instagram_account",
  facebook: "meta_page",
  tiktok: "tiktok_account",
  x: "x_user",
  linkedin: "linkedin_account",
  googleAds: "google_ad_account",
  amazonAds: "amazon_ad_account",
  dv360: "dv360_advertiser",
  googleAnalytics: "ga4_property",
  threads: "meta_threads_account",
};

const PROVIDER_BY_PLATFORM: Partial<Record<PlatformKey, string>> = {
  youtube: "google",
  instagram: "meta",
  facebook: "meta",
  googleAds: "google",
  dv360: "google",
  googleAnalytics: "google",
  threads: "meta",
  x: "x",
};

function inferProviderFromType(type: string): string | undefined {
  const normalized = type.toLowerCase();
  if (
    normalized.includes("meta") ||
    normalized.includes("facebook") ||
    normalized.includes("instagram") ||
    normalized.includes("threads")
  ) {
    return "meta";
  }
  if (
    normalized.includes("google") ||
    normalized.includes("youtube") ||
    normalized.includes("dv360") ||
    normalized.includes("ga4")
  ) {
    return "google";
  }
  return undefined;
}

function buildSelectableAssetFromBrandAccount(
  platformKey: PlatformKey,
  account: {
    integrationAccountId: string;
    externalAccountId: string | null;
    type: string | null;
    name: string;
    alias: string | null;
  }
): SelectableAsset {
  return {
    asset_pk: account.integrationAccountId,
    integration_account_id: account.integrationAccountId,
    external_id: account.externalAccountId ?? account.integrationAccountId,
    type: account.type ?? FALLBACK_TYPE_BY_PLATFORM[platformKey],
    name: account.alias ?? account.name ?? null,
    business_id: null,
    ad_account_id: null,
  };
}

export function mergeSelectableAssetsWithBrandSummary(
  response: SelectableAssetsResponse,
  summary: BrandIntegrationSummary
): SelectableAssetsResponse {
  const knownIds = new Set(
    getSelectableAssetsFlatList(response).map((asset) => asset.integration_account_id || asset.asset_pk)
  );

  const missingByProvider = new Map<string, SelectableAsset[]>();
  const missingAssets: SelectableAsset[] = [];

  (Object.keys(summary) as PlatformKey[]).forEach((platformKey) => {
    const accounts = summary[platformKey]?.accounts ?? [];
    accounts.forEach((account) => {
      const integrationAccountId = account.integrationAccountId;
      if (!integrationAccountId || knownIds.has(integrationAccountId)) {
        return;
      }

      knownIds.add(integrationAccountId);
      const selectableAsset = buildSelectableAssetFromBrandAccount(platformKey, account);
      missingAssets.push(selectableAsset);

      const providerKey =
        PROVIDER_BY_PLATFORM[platformKey] ??
        inferProviderFromType(selectableAsset.type);
      if (!providerKey) {
        return;
      }

      const existing = missingByProvider.get(providerKey) ?? [];
      existing.push(selectableAsset);
      missingByProvider.set(providerKey, existing);
    });
  });

  if (missingAssets.length === 0) {
    return response;
  }

  const mergedProviders = { ...(response.providers ?? {}) };
  missingByProvider.forEach((providerAssets, providerKey) => {
    const provider = mergedProviders[providerKey] ?? {};
    const existingAssets = provider.assets ?? [];
    const existingIds = new Set(existingAssets.map((asset: SelectableAsset) => asset.integration_account_id || asset.asset_pk));
    const nextAssets = [...existingAssets];
    providerAssets.forEach((asset) => {
      const id = asset.integration_account_id || asset.asset_pk;
      if (!existingIds.has(id)) {
        existingIds.add(id);
        nextAssets.push(asset);
      }
    });

    mergedProviders[providerKey] = {
      ...provider,
      assets: nextAssets,
    };
  });

  return {
    ...response,
    assets: [...(response.assets ?? []), ...missingAssets],
    providers: mergedProviders,
  };
}

function isAllowedSelectableAsset(asset: SelectableAsset, allowedAccountIds: Set<string>): boolean {
  const id = asset.integration_account_id || asset.asset_pk;
  return allowedAccountIds.has(id);
}

function filterSelectableAssetArray(
  assets: SelectableAsset[] | undefined,
  allowedAccountIds: Set<string>
): SelectableAsset[] {
  return (assets ?? []).filter((asset) => isAllowedSelectableAsset(asset, allowedAccountIds));
}

function filterMetaIntegrationBusinesses(integrations: any[], allowedAccountIds: Set<string>): any[] {
  return integrations
    .map((integration: any) => ({
      ...integration,
      businesses: (integration.businesses ?? [])
        .map((business: any) => ({
          ...business,
          ad_accounts: (business.ad_accounts ?? [])
            .map((adAccount: any) => ({
              ...adAccount,
              ad_account: adAccount.ad_account && isAllowedSelectableAsset(adAccount.ad_account, allowedAccountIds)
                ? adAccount.ad_account
                : null,
              pages: filterSelectableAssetArray(adAccount.pages, allowedAccountIds),
              instagram_accounts: filterSelectableAssetArray(adAccount.instagram_accounts, allowedAccountIds),
              threads_accounts: filterSelectableAssetArray(adAccount.threads_accounts, allowedAccountIds),
            }))
            .filter((adAccount: any) =>
              Boolean(adAccount.ad_account) ||
              adAccount.pages.length > 0 ||
              adAccount.instagram_accounts.length > 0 ||
              adAccount.threads_accounts.length > 0
            ),
          pages_without_ad_account: filterSelectableAssetArray(business.pages_without_ad_account, allowedAccountIds),
          instagram_accounts_without_ad_account: filterSelectableAssetArray(
            business.instagram_accounts_without_ad_account,
            allowedAccountIds
          ),
          threads_accounts_without_ad_account: filterSelectableAssetArray(
            business.threads_accounts_without_ad_account,
            allowedAccountIds
          ),
        }))
        .filter((business: any) =>
          business.ad_accounts.length > 0 ||
          business.pages_without_ad_account.length > 0 ||
          business.instagram_accounts_without_ad_account.length > 0 ||
          business.threads_accounts_without_ad_account.length > 0
        ),
    }))
    .filter((integration: any) => integration.businesses.length > 0);
}

function filterProviderHierarchy(
  hierarchy: SelectableAssetsResponse["providers"][string]["hierarchy"],
  allowedAccountIds: Set<string>
): SelectableAssetsResponse["providers"][string]["hierarchy"] {
  if (!hierarchy) return hierarchy;

  const metaIntegrations = hierarchy.meta?.integrations;
  if (Array.isArray(metaIntegrations)) {
    return {
      ...hierarchy,
      meta: {
        ...hierarchy.meta,
        integrations: filterMetaIntegrationBusinesses(metaIntegrations, allowedAccountIds),
      },
    };
  }

  const integrations = hierarchy.integrations;
  if (Array.isArray(integrations)) {
    if (integrations.some((integration: any) => Array.isArray(integration.businesses))) {
      return {
        ...hierarchy,
        integrations: filterMetaIntegrationBusinesses(integrations, allowedAccountIds),
      };
    }

    return {
      ...hierarchy,
      integrations: integrations
        .map((integration: any) => ({
          ...integration,
          ad_accounts: filterSelectableAssetArray(integration.ad_accounts, allowedAccountIds),
          youtube_channels: filterSelectableAssetArray(integration.youtube_channels, allowedAccountIds),
          dv360_advertisers: filterSelectableAssetArray(integration.dv360_advertisers, allowedAccountIds),
          ga4_properties: filterSelectableAssetArray(integration.ga4_properties, allowedAccountIds),
        }))
        .filter((integration: any) =>
          integration.ad_accounts.length > 0 ||
          integration.youtube_channels.length > 0 ||
          integration.dv360_advertisers.length > 0 ||
          integration.ga4_properties.length > 0
        ),
    };
  }

  return hierarchy;
}

export function filterSelectableAssetsByAccountIds(
  response: SelectableAssetsResponse,
  allowedAccountIds: Set<string>
): SelectableAssetsResponse {
  if (allowedAccountIds.size === 0) {
    return {
      ...response,
      assets: [],
      providers: {},
    };
  }

  const providers = Object.entries(response.providers ?? {}).reduce(
    (acc, [providerKey, provider]) => {
      const assets = filterSelectableAssetArray(provider.assets, allowedAccountIds);
      const hierarchy = filterProviderHierarchy(provider.hierarchy, allowedAccountIds);
      const hasHierarchy = getSelectableAssetsFlatList({
        synced_at: response.synced_at,
        stale: response.stale,
        assets: [],
        providers: { [providerKey]: { ...provider, assets: [], hierarchy } },
      }).length > 0;

      if (assets.length > 0 || hasHierarchy) {
        acc[providerKey] = {
          ...provider,
          assets,
          hierarchy,
          asset_count: assets.length || provider.asset_count,
        };
      }
      return acc;
    },
    {} as SelectableAssetsResponse["providers"]
  );

  return {
    ...response,
    assets: filterSelectableAssetArray(response.assets, allowedAccountIds),
    providers,
  };
}

export function getSelectableAssetLabel(asset: Pick<SelectableAsset, "name" | "external_id">): string {
  return asset.name?.trim() || asset.external_id;
}

export function getSelectableAssetsFlatList(response: SelectableAssetsResponse): SelectableAsset[] {
  const assets: SelectableAsset[] = [...(response.assets ?? [])];
  
  if (response.providers) {
    Object.values(response.providers).forEach((provider: any) => {
      if (provider.assets) {
        assets.push(...provider.assets);
      }
      
      const processIntegration = (integration: any) => {
        // Handle Meta structure (with businesses)
        integration.businesses?.forEach((business: any) => {
          business.ad_accounts?.forEach((adAccount: any) => {
            if (adAccount.ad_account) assets.push(adAccount.ad_account);
            if (adAccount.pages) assets.push(...adAccount.pages);
            if (adAccount.instagram_accounts) assets.push(...adAccount.instagram_accounts);
            if (adAccount.threads_accounts) assets.push(...adAccount.threads_accounts);
          });
          if (business.pages_without_ad_account) assets.push(...business.pages_without_ad_account);
          if (business.instagram_accounts_without_ad_account) assets.push(...business.instagram_accounts_without_ad_account);
          if (business.threads_accounts_without_ad_account) assets.push(...business.threads_accounts_without_ad_account);
        });

        // Handle Google structure (directly under integration)
        if (integration.ad_accounts) assets.push(...integration.ad_accounts);
        if (integration.youtube_channels) assets.push(...integration.youtube_channels);
        if (integration.dv360_advertisers) assets.push(...integration.dv360_advertisers);
        if (integration.ga4_properties) assets.push(...integration.ga4_properties);
      };

      if (provider.hierarchy?.meta?.integrations) {
        provider.hierarchy.meta.integrations.forEach(processIntegration);
      } else if (provider.hierarchy?.integrations) {
        provider.hierarchy.integrations.forEach(processIntegration);
      }
    });
  }

  const seen = new Set<string>();
  return assets.filter(asset => {
    const id = asset.integration_account_id || asset.asset_pk;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function getSelectableAssetsFlatListForProvider(response: SelectableAssetsResponse, provider: string): SelectableAsset[] {
  const providerData = response.providers?.[provider];
  if (!providerData) return [];
  
  return getSelectableAssetsFlatList({
    ...response,
    assets: [],
    providers: { [provider]: providerData }
  });
}

export function getMetaSelectableAdAccountBundles(response: SelectableAssetsResponse): MetaSelectableAdAccountBundles | null {
  const bundles: MetaSelectableAdAccountBundle[] = [];
  const others: SelectableAsset[] = [];
  const adAccountMap = new Map<string, MetaSelectableAdAccountBundle>();

  // Union of (provider-meta assets) ∪ (flat-list meta_* assets). Either source
  // alone misses cases: provider-meta is empty for a user with only their own
  // assets (which live in response.assets), and the flat list is incomplete
  // when merges inject teammate-owned assets into response.providers.meta.
  // A standalone IG account (no ad_account_id) MUST surface regardless of
  // whether any other Meta-side assets are present.
  const seen = new Set<string>();
  const assets: SelectableAsset[] = [];
  const pushUnique = (asset: SelectableAsset) => {
    const id = asset.integration_account_id || asset.asset_pk;
    if (!id || seen.has(id)) return;
    seen.add(id);
    assets.push(asset);
  };
  getSelectableAssetsFlatListForProvider(response, "meta").forEach(pushUnique);
  getSelectableAssetsFlatList(response).forEach((asset) => {
    if (asset.type.startsWith("meta_")) pushUnique(asset);
  });

  if (assets.length === 0) return null;

  // Dedup children/standalones by their real external id so a page/IG shared
  // across two logins isn't listed twice. Ad accounts are keyed by ad_account_id
  // (below) rather than external id, so this only guards the sub-assets.
  const seenChildExternalIds = new Set<string>();

  assets.forEach(asset => {
    if (asset.ad_account_id) {
      let bundle = adAccountMap.get(asset.ad_account_id);
      if (!bundle) {
        bundle = { ad_account_id: asset.ad_account_id, ad_account: null, assets: [] };
        adAccountMap.set(asset.ad_account_id, bundle);
        bundles.push(bundle);
      }
      if (asset.type === "meta_ad_account") {
        // Collapse duplicate ad-account rows (#155): keep the highest-privilege
        // login's row instead of letting the last one arbitrarily win.
        bundle.ad_account = bundle.ad_account ? pickHigherPrivilegeAsset(bundle.ad_account, asset) : asset;
      } else {
        const childKey = `${asset.type}:${asset.external_id}`;
        if (!seenChildExternalIds.has(childKey)) {
          seenChildExternalIds.add(childKey);
          bundle.assets.push(asset);
        }
      }
    } else {
      const standaloneKey = `${asset.type}:${asset.external_id}`;
      if (!seenChildExternalIds.has(standaloneKey)) {
        seenChildExternalIds.add(standaloneKey);
        others.push(asset);
      }
    }
  });

  bundles.forEach(bundle => {
    bundle.assets.sort((a, b) => {
      const typeOrder: Record<string, number> = {
        meta_instagram_account: 1,
        meta_page: 2,
        meta_threads_account: 3
      };
      const orderA = typeOrder[a.type] ?? 99;
      const orderB = typeOrder[b.type] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return getSelectableAssetLabel(a).localeCompare(getSelectableAssetLabel(b));
    });
  });

  return {
    ad_accounts: bundles.sort((a, b) => {
      const labelA = a.ad_account ? getSelectableAssetLabel(a.ad_account) : a.ad_account_id;
      const labelB = b.ad_account ? getSelectableAssetLabel(b.ad_account) : b.ad_account_id;
      return labelA.localeCompare(labelB);
    }),
    assets_without_ad_account: others.sort((a, b) => getSelectableAssetLabel(a).localeCompare(getSelectableAssetLabel(b)))
  };
}
