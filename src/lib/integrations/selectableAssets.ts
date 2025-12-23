import type {
  MetaSelectableHierarchy,
  ProviderSelectableAssets,
  SelectableAsset,
  SelectableAssetsResponse,
} from "@/lib/schemas/integrations";

export function getSelectableAssetLabel(asset: Pick<SelectableAsset, "name" | "external_id">): string {
  return asset.name?.trim() || asset.external_id;
}

// Meta hierarchy is expressed as Businesses -> Ad Accounts -> Assets, but business nodes are not
// meaningful for selection in the UI. We flatten and group directly by Ad Account instead.
//
// Selecting an Ad Account implies selecting all contained assets.
//
export type MetaSelectableAdAccountBundle = {
  ad_account_id: string;
  ad_account: SelectableAsset | null;
  assets: SelectableAsset[];
};

export type MetaSelectableAdAccountBundles = {
  ad_accounts: MetaSelectableAdAccountBundle[];
  assets_without_ad_account: SelectableAsset[];
};

function dedupeSelectableAssets(assets: SelectableAsset[]): SelectableAsset[] {
  const seen = new Set<string>();
  const result: SelectableAsset[] = [];
  for (const asset of assets) {
    const key = asset.integration_account_id ?? asset.asset_pk;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(asset);
  }
  return result;
}

function flattenMetaSelectableHierarchy(hierarchy?: MetaSelectableHierarchy): SelectableAsset[] {
  if (!hierarchy) return [];
  const assets: SelectableAsset[] = [];

  for (const integration of hierarchy.integrations) {
    for (const business of integration.businesses) {
      for (const adAccount of business.ad_accounts) {
        if (adAccount.ad_account) assets.push(adAccount.ad_account);
        assets.push(...adAccount.pages);
        assets.push(...adAccount.instagram_accounts);
        assets.push(...adAccount.threads_accounts);
      }
      assets.push(...business.pages_without_ad_account);
      assets.push(...business.instagram_accounts_without_ad_account);
      assets.push(...business.threads_accounts_without_ad_account);
    }
  }

  return assets;
}

function sortSelectableAssetsByTypeThenLabel(assets: SelectableAsset[]): SelectableAsset[] {
  return [...assets].sort((a, b) => {
    const typeCompare = a.type.localeCompare(b.type);
    if (typeCompare !== 0) return typeCompare;
    const aLabel = getSelectableAssetLabel(a);
    const bLabel = getSelectableAssetLabel(b);
    return aLabel.localeCompare(bLabel);
  });
}

export function getSelectableAssetsFlatList(response: SelectableAssetsResponse): SelectableAsset[] {
  const topLevelAssets = response.assets ?? [];
  const providerAssets = Object.values(response.providers ?? {}).flatMap(provider => provider.assets ?? []);
  const metaHierarchyAssets = flattenMetaSelectableHierarchy(response.providers?.meta?.hierarchy?.meta);

  return dedupeSelectableAssets([...topLevelAssets, ...providerAssets, ...metaHierarchyAssets]);
}

export function getMetaSelectableAdAccountBundles(
  response: SelectableAssetsResponse
): MetaSelectableAdAccountBundles | null {
  const hierarchy = response.providers?.meta?.hierarchy?.meta;
  if (!hierarchy) {
    const fallbackAssets = response.assets.length > 0
      ? response.assets
      : response.providers?.meta?.assets ?? [];

    const metaAssets = fallbackAssets.filter(asset => asset.type.toLowerCase().startsWith("meta_"));
    if (metaAssets.length === 0) return null;

    const groupedByAdAccountId = new Map<string, SelectableAsset[]>();
    const adAccountAssets = new Map<string, SelectableAsset>();
    const assetsWithoutAdAccount: SelectableAsset[] = [];

    for (const asset of metaAssets) {
      if (asset.ad_account_id) {
        const existing = groupedByAdAccountId.get(asset.ad_account_id) ?? [];
        existing.push(asset);
        groupedByAdAccountId.set(asset.ad_account_id, existing);
        if (asset.type === "meta_ad_account") {
          adAccountAssets.set(asset.ad_account_id, asset);
        }
      } else {
        assetsWithoutAdAccount.push(asset);
      }
    }

    const adAccountGroups = [...groupedByAdAccountId.entries()]
      .map(([adAccountId, assets]) => {
        const adAccount = adAccountAssets.get(adAccountId) ?? null;
        const nestedAssets = assets.filter(asset => asset.type !== "meta_ad_account");
        return {
          ad_account_id: adAccountId,
          ad_account: adAccount,
          assets: sortSelectableAssetsByTypeThenLabel(dedupeSelectableAssets(nestedAssets)),
        };
      })
      .sort((a, b) => {
        const aLabel = a.ad_account ? getSelectableAssetLabel(a.ad_account) : a.ad_account_id;
        const bLabel = b.ad_account ? getSelectableAssetLabel(b.ad_account) : b.ad_account_id;
        return aLabel.localeCompare(bLabel);
      });

    const dedupedWithoutAdAccount = new Map<string, SelectableAsset>();
    for (const asset of assetsWithoutAdAccount) {
      const key = `${asset.type}|${asset.business_id ?? "none"}|${getSelectableAssetLabel(asset)}`;
      if (!dedupedWithoutAdAccount.has(key)) {
        dedupedWithoutAdAccount.set(key, asset);
      }
    }

    return {
      ad_accounts: adAccountGroups,
      assets_without_ad_account: sortSelectableAssetsByTypeThenLabel(
        Array.from(dedupedWithoutAdAccount.values())
      ),
    };
  }

  const groupedByAdAccountId = new Map<string, MetaSelectableAdAccountBundle>();
  const assetsWithoutAdAccount: SelectableAsset[] = [];

  for (const integration of hierarchy.integrations) {
    for (const business of integration.businesses) {
      for (const adAccount of business.ad_accounts) {
        const existing = groupedByAdAccountId.get(adAccount.ad_account_id);
        const adAccountAsset = adAccount.ad_account ?? existing?.ad_account ?? null;
        const mergedAssets = existing
          ? [
            ...existing.assets,
            ...(adAccount.pages ?? []),
            ...(adAccount.instagram_accounts ?? []),
            ...(adAccount.threads_accounts ?? []),
          ]
          : [
            ...(adAccount.pages ?? []),
            ...(adAccount.instagram_accounts ?? []),
            ...(adAccount.threads_accounts ?? []),
          ];

        groupedByAdAccountId.set(adAccount.ad_account_id, {
          ad_account_id: adAccount.ad_account_id,
          ad_account: adAccountAsset,
          assets: sortSelectableAssetsByTypeThenLabel(dedupeSelectableAssets(mergedAssets)),
        });
      }

      assetsWithoutAdAccount.push(
        ...(business.pages_without_ad_account ?? []),
        ...(business.instagram_accounts_without_ad_account ?? []),
        ...(business.threads_accounts_without_ad_account ?? [])
      );
    }
  }

  const adAccountGroups = [...groupedByAdAccountId.values()].sort((a, b) => {
    const aLabel = a.ad_account ? getSelectableAssetLabel(a.ad_account) : a.ad_account_id;
    const bLabel = b.ad_account ? getSelectableAssetLabel(b.ad_account) : b.ad_account_id;
    return aLabel.localeCompare(bLabel);
  });

  return {
    ad_accounts: adAccountGroups,
    assets_without_ad_account: sortSelectableAssetsByTypeThenLabel(dedupeSelectableAssets(assetsWithoutAdAccount)),
  };
}

export function getSelectableAssetsForProvider(
  response: SelectableAssetsResponse,
  provider: string
): ProviderSelectableAssets | undefined {
  return response.providers?.[provider];
}

export function getSelectableAssetsFlatListForProvider(
  response: SelectableAssetsResponse,
  provider: string
): SelectableAsset[] {
  const selectableAssets = getSelectableAssetsForProvider(response, provider);
  if (!selectableAssets) return [];
  if (selectableAssets.assets.length > 0) return selectableAssets.assets;
  if (provider === "meta") return dedupeSelectableAssets(flattenMetaSelectableHierarchy(selectableAssets.hierarchy?.meta));
  return [];
}

export function getMetaSelectableAssetsFlatList(response: SelectableAssetsResponse): SelectableAsset[] {
  return getSelectableAssetsFlatListForProvider(response, "meta");
}

export function getMetaSelectableHierarchy(response: SelectableAssetsResponse): MetaSelectableHierarchy | undefined {
  return getSelectableAssetsForProvider(response, "meta")?.hierarchy?.meta;
}
