import type { SelectableAsset } from "@/lib/schemas/integrations";

export function resolveSelectableAssetLabel(asset: { name: string | null; external_id: string }): string {
  return asset.name?.trim() || asset.external_id;
}

export function sortSelectableAssetsByTypeThenLabel(assets: SelectableAsset[]): SelectableAsset[] {
  return [...assets].sort((a, b) => {
    const typeCompare = a.type.localeCompare(b.type);
    if (typeCompare !== 0) return typeCompare;
    const aLabel = resolveSelectableAssetLabel(a);
    const bLabel = resolveSelectableAssetLabel(b);
    return aLabel.localeCompare(bLabel);
  });
}
