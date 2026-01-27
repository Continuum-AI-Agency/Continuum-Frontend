import type { SelectableAsset } from "@/lib/schemas/integrations";

export function resolveSelectableAssetLabel(asset: SelectableAsset): string {
  if (asset.name) {
    return asset.name;
  }
  return asset.external_id || "Unknown Asset";
}
