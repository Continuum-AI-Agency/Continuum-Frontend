const DEFAULT_BUCKET = "creative-assets";

export function getCreativeAssetsBucket(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_CREATIVE_BUCKET?.trim() || DEFAULT_BUCKET;
}

export function resolveStoragePath(brandProfileId: string, folder: string, name?: string): string {
  const segments = [brandProfileId.trim(), folder.trim(), name?.trim()].filter(Boolean);
  return segments.join("/").replace(/\/+/g, "/");
}
