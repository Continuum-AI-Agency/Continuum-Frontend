import { SelectableAsset, SelectableAssetsResponse } from "@/lib/schemas/integrations";
import type { PlatformKey } from "@/components/onboarding/platforms";
import type { BrandIntegrationSummary } from "@/lib/integrations/brandProfile";

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
  linkedin: "linkedin_account",
  googleAds: "google_ad_account",
  amazonAds: "amazon_ad_account",
  dv360: "dv360_advertiser",
  threads: "meta_threads_account",
};

const PROVIDER_BY_PLATFORM: Partial<Record<PlatformKey, string>> = {
  youtube: "google",
  instagram: "meta",
  facebook: "meta",
  googleAds: "google",
  dv360: "google",
  threads: "meta",
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
  if (normalized.includes("google") || normalized.includes("youtube") || normalized.includes("dv360")) {
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
  const metaProvider = response.providers?.meta;
  if (!metaProvider) {
    const flatMeta = getSelectableAssetsFlatList(response).filter(a => a.type.startsWith("meta_"));
    if (flatMeta.length === 0) return null;
  }

  const bundles: MetaSelectableAdAccountBundle[] = [];
  const others: SelectableAsset[] = [];
  const adAccountMap = new Map<string, MetaSelectableAdAccountBundle>();

  const assets = getSelectableAssetsFlatListForProvider(response, "meta");
  if (assets.length === 0) {
    getSelectableAssetsFlatList(response).forEach(asset => {
      if (asset.type.startsWith("meta_")) {
        assets.push(asset);
      }
    });
  }

  assets.forEach(asset => {
    if (asset.ad_account_id) {
      let bundle = adAccountMap.get(asset.ad_account_id);
      if (!bundle) {
        bundle = { ad_account_id: asset.ad_account_id, ad_account: null, assets: [] };
        adAccountMap.set(asset.ad_account_id, bundle);
        bundles.push(bundle);
      }
      if (asset.type === "meta_ad_account") {
        bundle.ad_account = asset;
      } else {
        bundle.assets.push(asset);
      }
    } else {
      others.push(asset);
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
