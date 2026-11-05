import 'server-only';

import { CANVAS_MEDIA_PREVIEW_MAX_EDGE, isGcsPointer } from '@continuum/contracts';
import { getApiBaseUrl } from '@/lib/api/config';
import { claimsIdentityOf } from '@/lib/auth/claims';
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
  /** The row's `updated_at`: an object replaced at the same path gets a new URL, not a cached one. */
  version?: string | null;
  /** The derivative's longest edge in px (CANVAS_MEDIA_PREVIEW_MAX_EDGE when unset). */
  edge?: number;
}

const reuseKey = (userId: string | undefined, item: SignablePath): string | null =>
  userId
    ? [
        userId,
        item.bucket,
        item.path,
        item.displayDerivative ? `display${item.edge ?? ''}` : '',
        item.version ?? '',
      ].join('\n')
    : null;

// Every mint is a new token, so a page rendered again for the same person names each image by a
// new URL and the browser downloads it again. A URL already minted for this person is handed back
// while at least half its life is left, which makes the revisit a cache hit. Callers key it by
// person, object and the row's version, so an object replaced at the same path gets a fresh URL.
// ponytail: per-instance memo; move it to a shared cache if instances stop being reused.
const REUSE_LIMIT = 5_000;
const minted = new Map<string, { url: string; expiresAt: number; lifeMs: number }>();

export function reusableSignedUrl(key: string): string | undefined {
  const hit = minted.get(key);
  return hit && hit.expiresAt - Date.now() >= hit.lifeMs / 2 ? hit.url : undefined;
}

export function rememberSignedUrl(key: string, url: string, ttlSeconds: number): void {
  minted.delete(key);
  minted.set(key, { url, expiresAt: Date.now() + ttlSeconds * 1000, lifeMs: ttlSeconds * 1000 });
  if (minted.size > REUSE_LIMIT) minted.delete(minted.keys().next().value as string);
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
    updated_at?: string | null;
  }[],
): SignablePath[] {
  return rows.flatMap((row) => {
    const version = row.updated_at;
    const poster: SignablePath[] = row.thumbnail_path
      ? [{ path: row.thumbnail_path, bucket: row.bucket, version }]
      : RESIZABLE_IMAGE_TYPES.has(row.mime_type ?? '')
        ? [{ path: row.storage_path, bucket: row.bucket, displayDerivative: true, version }]
        : [];
    return [{ path: row.storage_path, bucket: row.bucket, version }, ...poster];
  });
}

/**
 * The still a small box draws for an asset row: its poster, else a resized copy of the image at
 * `edge` px. Never the original — a video with no poster, or a file Supabase cannot resize, has
 * no still, and the box draws its placeholder instead of downloading the source.
 */
export function stillSignable(
  row: {
    bucket: string;
    storage_path: string;
    mime_type?: string | null;
    thumbnail_path?: string | null;
    updated_at?: string | null;
  },
  edge: number,
): SignablePath | null {
  const version = row.updated_at;
  if (row.thumbnail_path) return { path: row.thumbnail_path, bucket: row.bucket, version };
  if (isGcsPointer(row.bucket) || !RESIZABLE_IMAGE_TYPES.has(row.mime_type ?? '')) return null;
  return { path: row.storage_path, bucket: row.bucket, displayDerivative: true, version, edge };
}

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// A HyperFrames film lives in GCS (bucket `gs://…`), and only the Backend holds a key that
// can sign it — never Vercel. The server hands the caller's own session to the Backend's
// signer, which re-checks brand membership and that the path is under the brand.
async function mintGcsSignedUrl(
  client: ServerClient,
  storagePath: string,
  bucket: string,
  download?: string,
): Promise<string | null> {
  const token = (await client.auth.getSession()).data.session?.access_token;
  if (!token) return null;
  const response = await fetch(`${getApiBaseUrl()}/api/organic/agent/hyperframes/sign`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      brandId: storagePath.split('/')[0],
      bucket,
      path: storagePath,
      ...(download ? { download } : {}),
    }),
  }).catch(() => null);
  if (!response?.ok) {
    console.error('[media/signed-urls] GCS sign failed', {
      bucket,
      storagePath,
      status: response?.status,
    });
    return null;
  }
  return ((await response.json()) as { signedUrl?: string }).signedUrl ?? null;
}

/**
 * `download` names the saved file; a GCS URL has to be signed with it. `version` is the row's
 * `updated_at`, so a poster replaced at the same path gets a new URL rather than the reused one.
 */
export async function mintSignedUrl(
  storagePath: string,
  bucket: string,
  download?: string,
  version?: string | null,
): Promise<string | null> {
  const client = await createSupabaseServerClient();
  if (isGcsPointer(bucket)) return mintGcsSignedUrl(client, storagePath, bucket, download);
  const key = reuseKey((await claimsIdentityOf(client))?.id, { path: storagePath, bucket, version });
  const reused = key ? reusableSignedUrl(key) : undefined;
  if (reused) return reused;
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error('[media/signed-urls] Failed to sign URL', { bucket, storagePath, error });
    return null;
  }
  const url = toBrowserReachableStorageUrl(data.signedUrl, process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (key) rememberSignedUrl(key, url, SIGNED_URL_TTL_SECONDS);
  return url;
}

// Signs a batch of paths that may span multiple buckets. Returns a Map keyed by
// storage path (display derivatives by displayDerivativeKey). Paths are
// bucket-scoped and brand-prefixed, so path collisions across buckets are not a
// practical concern.
export async function mintSignedUrls(items: SignablePath[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (items.length === 0) return map;

  const client = await createSupabaseServerClient();
  const userId = (await claimsIdentityOf(client))?.id;

  // Per bucket, the paths still to sign, each with its reuse key.
  const pathsByBucket = new Map<string, Map<string, string | null>>();
  for (const item of items) {
    if (item.displayDerivative) continue;
    const key = isGcsPointer(item.bucket) ? null : reuseKey(userId, item);
    const reused = key ? reusableSignedUrl(key) : undefined;
    if (reused) {
      map.set(item.path, reused);
      continue;
    }
    const pending = pathsByBucket.get(item.bucket) ?? new Map<string, string | null>();
    pending.set(item.path, key);
    pathsByBucket.set(item.bucket, pending);
  }

  const signOriginals = Array.from(pathsByBucket.entries()).map(async ([bucket, pending]) => {
    const paths = [...pending.keys()];
    if (isGcsPointer(bucket)) {
      // ponytail: one Backend call per film; batch the sign route when a page holds many films.
      for (const path of paths) {
        const url = await mintGcsSignedUrl(client, path, bucket);
        if (url) map.set(path, url);
      }
      return;
    }
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    if (error || !data) {
      console.error('[media/signed-urls] Batch sign failed', { bucket, error });
      return;
    }
    for (const item of data) {
      if (item.signedUrl && item.path) {
        const url = toBrowserReachableStorageUrl(
          item.signedUrl,
          process.env.NEXT_PUBLIC_SUPABASE_URL,
        );
        map.set(item.path, url);
        const key = pending.get(item.path);
        if (key) rememberSignedUrl(key, url, SIGNED_URL_TTL_SECONDS);
      }
    }
  });

  // One call per path, because the batch signer accepts a `transform` and silently
  // ignores it. A derivative that fails to sign is simply absent: the card falls
  // back to the original.
  const signDerivatives = items
    .filter((item) => item.displayDerivative)
    .map(async (item) => {
      const { path, bucket } = item;
      const key = reuseKey(userId, item);
      const reused = key ? reusableSignedUrl(key) : undefined;
      if (reused) {
        map.set(displayDerivativeKey(path), reused);
        return;
      }
      const { data, error } = await client.storage
        .from(bucket)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS, {
          transform: {
            width: item.edge ?? CANVAS_MEDIA_PREVIEW_MAX_EDGE,
            height: item.edge ?? CANVAS_MEDIA_PREVIEW_MAX_EDGE,
            resize: 'contain',
          },
        });
      if (error || !data?.signedUrl) return;
      const url = toBrowserReachableStorageUrl(data.signedUrl, process.env.NEXT_PUBLIC_SUPABASE_URL);
      map.set(displayDerivativeKey(path), url);
      if (key) rememberSignedUrl(key, url, SIGNED_URL_TTL_SECONDS);
    });

  await Promise.all([...signOriginals, ...signDerivatives]);

  return map;
}
