import "server-only";

import { Redis } from "@upstash/redis";

// Frontend half of the shared app cache. Points at the SAME Upstash DB as the
// backend (APP_CACHE_REDIS_* — REST endpoint), so both tiers share one cache
// provider. Server-only: never import into a Client Component. Fail-open — any
// Redis error or a missing config (local dev) degrades to the direct loader, so
// the cache can slow nothing and break nothing.

const DEFAULT_TTL_SECONDS = 60 * 60;
const TIMEOUT_MS = 200;
const SCAN_COUNT = 200;
const SCAN_MAX_ITERATIONS = 50;

let client: Redis | null = null;
let resolved = false;

function getClient(): Redis | null {
  if (resolved) return client;
  const url = process.env.APP_CACHE_REDIS_URL;
  const token = process.env.APP_CACHE_REDIS_TOKEN;
  if (url && token && /^https?:\/\//i.test(url)) {
    client = new Redis({ url, token });
  }
  resolved = true;
  return client;
}

/** Test seam: inject a fake client (or null to force the degraded path). */
export function __setAppCacheClientForTests(fake: Redis | null): void {
  client = fake;
  resolved = true;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`app cache op timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

export interface CachedReadArgs<T> {
  key: string;
  ttlSeconds?: number;
  load: () => Promise<T>;
}

/**
 * Read-through: return the cached value, else run `load`, cache it, and return.
 * The loader is authoritative — if it throws, the throw propagates and nothing
 * is cached (so error results never get pinned).
 */
export async function cachedRead<T>({ key, ttlSeconds, load }: CachedReadArgs<T>): Promise<T> {
  const redis = getClient();
  if (!redis) return load();

  try {
    const hit = await withTimeout(redis.get<T>(key), TIMEOUT_MS);
    if (hit !== null && hit !== undefined) return hit;
  } catch {
    // fall through to the loader
  }

  const fresh = await load();
  try {
    await withTimeout(
      redis.set(key, JSON.stringify(fresh), { ex: ttlSeconds ?? DEFAULT_TTL_SECONDS }),
      TIMEOUT_MS,
    );
  } catch {
    // best-effort
  }
  return fresh;
}

/** Delete every key under a prefix (e.g. all members' cached views of a brand). */
export async function invalidateCachePrefix(prefix: string): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    let cursor = "0";
    let iterations = 0;
    do {
      const [next, keys] = await withTimeout(
        redis.scan(cursor, { match: `${prefix}*`, count: SCAN_COUNT }),
        TIMEOUT_MS,
      );
      cursor = next;
      if (keys.length > 0) await withTimeout(redis.del(...keys), TIMEOUT_MS);
      iterations += 1;
    } while (cursor !== "0" && iterations < SCAN_MAX_ITERATIONS);
  } catch {
    // best-effort — a missed invalidation self-heals at the TTL
  }
}
