import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const SIGNED_URL_TTL_SECONDS = 3600; // 1 hour

// Assets can live in different buckets: user uploads in `media-library`,
// AI-generated creatives in `brand-profile-assets`. Always sign from the
// asset's own bucket rather than assuming one.
export interface SignablePath {
  path: string;
  bucket: string;
}

export async function mintSignedUrl(
  storagePath: string,
  bucket: string,
): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error("[media/signed-urls] Failed to sign URL", { bucket, storagePath, error });
    return null;
  }
  return data.signedUrl;
}

// Signs a batch of paths that may span multiple buckets. Returns a Map keyed by
// storage path. Paths are bucket-scoped and brand-prefixed, so path collisions
// across buckets are not a practical concern.
export async function mintSignedUrls(
  items: SignablePath[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (items.length === 0) return map;

  const admin = createSupabaseAdminClient();

  const pathsByBucket = new Map<string, string[]>();
  for (const { path, bucket } of items) {
    const existing = pathsByBucket.get(bucket);
    if (existing) {
      existing.push(path);
    } else {
      pathsByBucket.set(bucket, [path]);
    }
  }

  await Promise.all(
    Array.from(pathsByBucket.entries()).map(async ([bucket, paths]) => {
      const { data, error } = await admin.storage
        .from(bucket)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      if (error || !data) {
        console.error("[media/signed-urls] Batch sign failed", { bucket, error });
        return;
      }
      for (const item of data) {
        if (item.signedUrl && item.path) {
          map.set(item.path, item.signedUrl);
        }
      }
    }),
  );

  return map;
}
