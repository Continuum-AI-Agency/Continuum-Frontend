import { SelectableAsset, SelectableAssetsResponse } from "@/lib/schemas/integrations";

export type MetaSelectableAdAccountBundle = {
  ad_account_id: string;
  ad_account: SelectableAsset | null;
  assets: SelectableAsset[];
};

export type MetaSelectableAdAccountBundles = {
  ad_accounts: MetaSelectableAdAccountBundle[];
  assets_without_ad_account: SelectableAsset[];
};

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
