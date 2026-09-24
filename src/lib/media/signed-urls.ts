import 'server-only';

import { CANVAS_MEDIA_PREVIEW_MAX_EDGE } from '@continuum/contracts';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { displayDerivativeKey } from './mapper';
import { toBrowserReachableStorageUrl } from './storage-url';

const SIGNED_URL_TTL_SECONDS = 3600; // 1 hour

// Assets can live in different buckets: user uploads in `media-library`,
// AI-generated creatives in `brand-profile-assets`. Always sign from the
// asset's own bucket rather than assuming one.
export interface SignablePath {
  path: string;
  bucket: string;
  /** Sign a display-sized derivative instead of the original, keyed by displayDerivativeKey(path). */
  displayDerivative?: boolean;
}

// Formats Supabase resizes without losing anything a card shows. GIF would lose
// its animation; everything else keeps painting from the original.
const RESIZABLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Every path an asset row needs signed: the asset itself plus its poster, which
// lives in the SAME bucket. An image with no poster gets a display-sized derivative
// instead: generated originals are ~3 MB each, and a grid card is a few hundred
// pixels wide. Feed this into mintSignedUrls and hand the resulting Map to
// rowToSignedMediaAsset.
export function assetSignablePaths(
  rows: readonly {
    bucket: string;
    storage_path: string;
    mime_type?: string | null;
    thumbnail_path?: string | null;
  }[],
): SignablePath[] {
  return rows.flatMap((row) => {
    const poster: SignablePath[] = row.thumbnail_path
      ? [{ path: row.thumbnail_path, bucket: row.bucket }]
      : RESIZABLE_IMAGE_TYPES.has(row.mime_type ?? '')
        ? [{ path: row.storage_path, bucket: row.bucket, displayDerivative: true }]
        : [];
    return [{ path: row.storage_path, bucket: row.bucket }, ...poster];
  });
}

export async function mintSignedUrl(storagePath: string, bucket: string): Promise<string | null> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error('[media/signed-urls] Failed to sign URL', { bucket, storagePath, error });
    return null;
  }
  return toBrowserReachableStorageUrl(data.signedUrl, process.env.NEXT_PUBLIC_SUPABASE_URL);
}

// Signs a batch of paths that may span multiple buckets. Returns a Map keyed by
// storage path (display derivatives by displayDerivativeKey). Paths are
// bucket-scoped and brand-prefixed, so path collisions across buckets are not a
// practical concern.
export async function mintSignedUrls(items: SignablePath[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (items.length === 0) return map;

  const client = await createSupabaseServerClient();

  const pathsByBucket = new Map<string, string[]>();
  for (const { path, bucket, displayDerivative } of items) {
    if (displayDerivative) continue;
    const existing = pathsByBucket.get(bucket);
    if (existing) {
      existing.push(path);
    } else {
      pathsByBucket.set(bucket, [path]);
    }
  }

  const signOriginals = Array.from(pathsByBucket.entries()).map(async ([bucket, paths]) => {
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    if (error || !data) {
      console.error('[media/signed-urls] Batch sign failed', { bucket, error });
      return;
    }
    for (const item of data) {
      if (item.signedUrl && item.path) {
        map.set(
          item.path,
          toBrowserReachableStorageUrl(item.signedUrl, process.env.NEXT_PUBLIC_SUPABASE_URL),
        );
      }
    }
  });

  // One call per path, because the batch signer accepts a `transform` and silently
  // ignores it. A derivative that fails to sign is simply absent: the card falls
  // back to the original.
  const signDerivatives = items
    .filter((item) => item.displayDerivative)
    .map(async ({ path, bucket }) => {
      const { data, error } = await client.storage
        .from(bucket)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, {
          transform: {
            width: CANVAS_MEDIA_PREVIEW_MAX_EDGE,
            height: CANVAS_MEDIA_PREVIEW_MAX_EDGE,
            resize: 'contain',
          },
        });
      if (error || !data?.signedUrl) return;
      map.set(
        displayDerivativeKey(path),
        toBrowserReachableStorageUrl(data.signedUrl, process.env.NEXT_PUBLIC_SUPABASE_URL),
      );
    });

  await Promise.all([...signOriginals, ...signDerivatives]);

  return map;
}
