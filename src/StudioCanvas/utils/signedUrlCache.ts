import { signedUrlExpiresAtMs } from './canvasMediaResign';

/**
 * Single-flight, TTL-aware cache for signed media URLs.
 *
 * A signed URL is cache-busting by construction: signing the same object twice mints
 * two different tokens, so the two URLs are different strings, so every `<img>`/
 * `<video>` whose `src` swaps to the second one downloads the bytes again. The canvas
 * signs from several places — initial load, the realtime catch-up, a node's own
 * on-error retry — and those overlap on a cold open, which is why a canvas showing
 * ~9 distinct objects was measured issuing 31 storage GETs.
 *
 * The fix is not to let one caller win and the rest go without: a caller denied its
 * claim renders a blank node, and a claim that is held while its sign fails blanks the
 * node for the whole session. Callers asking for the same pointer must SHARE one
 * fetch and all receive the same URL. That is what this does:
 *
 *   - a key already resolved and still comfortably valid returns its cached URL
 *   - a key with a request in flight returns that same in-flight promise
 *   - only genuinely new keys reach the network, batched into one call by the caller
 *   - a failed or absent result is evicted, so the next caller retries rather than
 *     inheriting a permanent hole
 *
 * Keyed by `bucket\npath` — the durable pointer, never the URL, since the URL is the
 * thing that keeps changing.
 */

export interface SignedUrlCoordinate {
  bucket: string;
  path: string;
}

/** Refresh this far before the token's own expiry so a URL never lands already dead. */
const EXPIRY_SKEW_MS = 60_000;

/**
 * Fallback lifetime for a URL whose token carries no readable `exp`. Deliberately
 * short: guessing long on an unknown token risks handing out a dead URL, and the cost
 * of guessing short is one extra sign.
 */
const UNKNOWN_EXPIRY_TTL_MS = 5 * 60_000;

export const signedUrlKey = (bucket: string, path: string): string => `${bucket}\n${path}`;

interface CacheEntry {
  url: string;
  expiresAtMs: number;
}

const resolved = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();

function readFresh(key: string, now: number): string | null {
  const entry = resolved.get(key);
  if (!entry) return null;
  if (entry.expiresAtMs <= now) {
    resolved.delete(key);
    return null;
  }
  return entry.url;
}

function remember(key: string, url: string, now: number): void {
  const exp = signedUrlExpiresAtMs(url);
  const expiresAtMs = exp === null ? now + UNKNOWN_EXPIRY_TTL_MS : exp - EXPIRY_SKEW_MS;
  // A URL that is already inside the skew window is worth returning to this caller but
  // not worth storing — caching it would just hand the next caller something stale.
  if (expiresAtMs <= now) return;
  resolved.set(key, { url, expiresAtMs });
}

/**
 * Resolve a batch of coordinates to signed URLs, hitting `signBatch` only for the ones
 * that are neither cached nor already being fetched by someone else.
 *
 * `signBatch` receives ONLY the coordinates that actually need signing and should
 * return a Map keyed by `signedUrlKey`. Anything it omits is treated as a failure for
 * that key: the waiter gets null and the key is evicted so a later attempt can retry.
 */
export async function resolveSignedUrls<Coordinate extends SignedUrlCoordinate>(
  coordinates: readonly Coordinate[],
  signBatch: (pending: Coordinate[]) => Promise<Map<string, string>>,
): Promise<Map<string, string>> {
  const now = Date.now();
  const out = new Map<string, string>();
  const waits: Array<{ key: string; promise: Promise<string | null> }> = [];
  const pending: Coordinate[] = [];
  const pendingKeys = new Set<string>();

  for (const coordinate of coordinates) {
    const key = signedUrlKey(coordinate.bucket, coordinate.path);
    if (out.has(key) || pendingKeys.has(key)) continue;

    const fresh = readFresh(key, now);
    if (fresh) {
      out.set(key, fresh);
      continue;
    }

    const existing = inFlight.get(key);
    if (existing) {
      waits.push({ key, promise: existing });
      continue;
    }

    pending.push(coordinate);
    pendingKeys.add(key);
  }

  if (pending.length > 0) {
    // One shared request for the whole pending set. Every key in it is registered
    // against that request BEFORE the first await, so a caller arriving mid-flight
    // joins this fetch instead of starting a second one.
    const batch = signBatch(pending).catch(() => new Map<string, string>());

    for (const coordinate of pending) {
      const key = signedUrlKey(coordinate.bucket, coordinate.path);
      const promise = batch.then((signed) => signed.get(key) ?? null);
      inFlight.set(key, promise);
      waits.push({ key, promise });
    }

    void batch.finally(() => {
      for (const coordinate of pending) {
        inFlight.delete(signedUrlKey(coordinate.bucket, coordinate.path));
      }
    });
  }

  const settled = await Promise.all(waits.map((wait) => wait.promise));
  const settledAt = Date.now();
  settled.forEach((url, index) => {
    const key = waits[index]?.key;
    if (!key || !url) return;
    remember(key, url, settledAt);
    out.set(key, url);
  });

  return out;
}

/** Drop everything. Used when the canvas switches rooms or brands, and by tests. */
export function clearSignedUrlCache(): void {
  resolved.clear();
  inFlight.clear();
}
