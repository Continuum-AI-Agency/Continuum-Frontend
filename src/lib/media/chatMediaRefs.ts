// Sign on view for chat media strips (contracts organic/chat-media.ts).
//
// A strip carries refs, never URLs: a URL persisted in a frame is a broken tile an hour later.
// This module turns refs into short-lived tile URLs: ONE POST for every strip that comes into view
// in the same tick, a cache per ref until shortly before the server's expiry, and a forced re-sign
// when a tile fails to load.

import {
  CHAT_MEDIA_SIGN_MAX_REFS,
  CHAT_MEDIA_SIGN_ROUTE,
  type ChatMediaRef,
  chatMediaRefKey,
  chatMediaSignResponseSchema,
} from '@continuum/contracts';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getApiBaseUrl } from '@/lib/api/config';
import { request } from '@/lib/api/http';

/** One ref's tile URLs, absolute, usable until `expiresAtMs`. */
export type SignedChatMediaTile = {
  key: string;
  /** A ≤480 px still, or null when there is nothing to show without the original. */
  thumbUrl: string | null;
  posterUrl: string | null;
  expiresAtMs: number;
};

// Re-sign a minute early: a URL handed to an <img> a second before it lapses is a broken tile
// by the time the bytes are asked for.
export const CHAT_MEDIA_REFRESH_MARGIN_MS = 60_000;
// Tiles that fail together (a whole strip whose URLs lapsed) re-sign in one call, not one each.
export const CHAT_MEDIA_RECOVER_COALESCE_MS = 120;
// A ref whose fresh URL fails too is not asked about again in a loop, until this long has passed
// (a strip left open for hours outlives its URLs more than once).
export const CHAT_MEDIA_MAX_RECOVERIES_PER_TILE = 2;
export const CHAT_MEDIA_RECOVERY_WINDOW_MS = 10 * 60_000;
// A sign that never answered (offline, a 5xx) is asked once more before the tiles give up.
export const CHAT_MEDIA_SIGN_RETRY_MS = 1_500;

// ponytail: entries are never evicted; a tab holds one small record per ref it has shown. Prune on
// write if a session ever shows tens of thousands of refs.
const cache = new Map<string, SignedChatMediaTile>();
const inFlight = new Map<string, Promise<SignedChatMediaTile | null>>();
const slot = (brandId: string, key: string) => `${brandId}\n${key}`;

/**
 * For tests. A sign-out needs no reset: entries are scoped by brand, and a strip only renders in a
 * brand its viewer can open.
 */
export function resetChatMediaSignCache(): void {
  cache.clear();
  inFlight.clear();
  open.clear();
}

export function cachedChatMediaTile(
  brandId: string,
  ref: ChatMediaRef,
  now = Date.now(),
): SignedChatMediaTile | null {
  const hit = cache.get(slot(brandId, chatMediaRefKey(ref)));
  return hit && hit.expiresAtMs - CHAT_MEDIA_REFRESH_MARGIN_MS > now ? hit : null;
}

// Provider stills come back as a path under the API's thumb route; storage stills are absolute.
function absolute(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('/') ? `${getApiBaseUrl()}${url}` : url;
}

async function postSign(
  brandId: string,
  refs: ChatMediaRef[],
): Promise<Map<string, SignedChatMediaTile>> {
  const tiles = new Map<string, SignedChatMediaTile>();
  try {
    const response = await request({
      path: CHAT_MEDIA_SIGN_ROUTE,
      method: 'POST',
      body: { brandId, refs },
    });
    const parsed = chatMediaSignResponseSchema.safeParse(response);
    if (!parsed.success) return tiles;
    for (const item of parsed.data.items) {
      tiles.set(item.key, {
        key: item.key,
        thumbUrl: absolute(item.thumbUrl),
        posterUrl: absolute(item.posterUrl),
        expiresAtMs: Date.parse(item.expiresAt),
      });
    }
  } catch {
    // A failed sign leaves the refs unsigned (and uncached): the caller asks again.
  }
  return tiles;
}

// Every sign asked for in the same tick (all the strips one commit brings into view, a tray's
// drafts) rides one batch per brand, POSTed in chunks of CHAT_MEDIA_SIGN_MAX_REFS.
type Batch = { refs: Map<string, ChatMediaRef>; signed: Promise<Map<string, SignedChatMediaTile>> };
const open = new Map<string, Batch>();

function enqueue(brandId: string, ref: ChatMediaRef): Promise<SignedChatMediaTile | null> {
  let batch = open.get(brandId);
  if (!batch) {
    const refs = new Map<string, ChatMediaRef>();
    const signed = Promise.resolve().then(async () => {
      if (open.get(brandId)?.refs === refs) open.delete(brandId);
      const all = [...refs.values()];
      const chunks: ChatMediaRef[][] = [];
      for (let start = 0; start < all.length; start += CHAT_MEDIA_SIGN_MAX_REFS) {
        chunks.push(all.slice(start, start + CHAT_MEDIA_SIGN_MAX_REFS));
      }
      const answers = await Promise.all(chunks.map((chunk) => postSign(brandId, chunk)));
      return new Map(answers.flatMap((tiles) => [...tiles]));
    });
    batch = { refs, signed };
    open.set(brandId, batch);
  }
  const key = chatMediaRefKey(ref);
  batch.refs.set(key, ref);
  return batch.signed.then((tiles) => tiles.get(key) ?? null);
}

/**
 * Tiles for `refs`, keyed by chatMediaRefKey. Fresh cache entries and signs already in flight
 * cost nothing; the rest join this tick's batch (one POST per CHAT_MEDIA_SIGN_MAX_REFS). `force`
 * skips both: a tile that failed to load is re-signed even when its URL still looked fresh.
 */
export async function signChatMediaRefs(
  brandId: string,
  refs: readonly ChatMediaRef[],
  { force = false }: { force?: boolean } = {},
): Promise<Map<string, SignedChatMediaTile>> {
  const result = new Map<string, SignedChatMediaTile>();
  const waits: Promise<void>[] = [];
  const toSign: ChatMediaRef[] = [];
  const seen = new Set<string>();
  const keep = (key: string) => (tile: SignedChatMediaTile | null) => {
    if (tile) result.set(key, tile);
  };

  for (const ref of refs) {
    const key = chatMediaRefKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    const hit = force ? null : cachedChatMediaTile(brandId, ref);
    if (hit) {
      result.set(key, hit);
      continue;
    }
    const pending = force ? undefined : inFlight.get(slot(brandId, key));
    if (pending) {
      waits.push(pending.then(keep(key)));
      continue;
    }
    toSign.push(ref);
  }

  for (const ref of toSign) {
    const key = chatMediaRefKey(ref);
    const at = slot(brandId, key);
    const one = enqueue(brandId, ref).then((tile) => {
      if (tile) cache.set(at, tile);
      if (inFlight.get(at) === one) inFlight.delete(at);
      return tile;
    });
    inFlight.set(at, one);
    waits.push(one.then(keep(key)));
  }

  await Promise.all(waits);
  return result;
}

export type ChatMediaTiles = {
  /** Signed tiles by ref key. A key missing after `settled` signed to nothing. */
  tiles: ReadonlyMap<string, SignedChatMediaTile>;
  /** The first sign for these refs has answered. */
  settled: boolean;
  /** A tile failed to load: re-sign it, bypassing the cache, together with any that fail with it. */
  recover: (key: string) => void;
};

const NO_TILES: ReadonlyMap<string, SignedChatMediaTile> = new Map();

function fromCache(
  brandId: string | null | undefined,
  refs: readonly ChatMediaRef[],
): ReadonlyMap<string, SignedChatMediaTile> {
  if (!brandId) return NO_TILES;
  const hits = new Map<string, SignedChatMediaTile>();
  for (const ref of refs) {
    const hit = cachedChatMediaTile(brandId, ref);
    if (hit) hits.set(hit.key, hit);
  }
  return hits;
}

/**
 * A strip's tiles, signed once on view and re-signed per failed tile. `enabled: false` holds the
 * sign back (a strip still off screen) while cached tiles show at once.
 */
export function useChatMediaTiles(
  brandId: string | null | undefined,
  refs: readonly ChatMediaRef[],
  { enabled = true }: { enabled?: boolean } = {},
): ChatMediaTiles {
  const refKeys = refs.map(chatMediaRefKey).join('|');
  const latestRefs = useRef(refs);
  useLayoutEffect(() => {
    latestRefs.current = refs;
  });

  const [tiles, setTiles] = useState(() => fromCache(brandId, refs));
  const [settledFor, setSettledFor] = useState<string | null>(() =>
    brandId && refs.every((ref) => cachedChatMediaTile(brandId, ref)) ? refKeys : null,
  );

  const merge = useCallback((signed: Map<string, SignedChatMediaTile>) => {
    if (signed.size === 0) return;
    setTiles((current) => new Map([...current, ...signed]));
  }, []);

  useEffect(() => {
    if (!brandId || !enabled || refKeys.length === 0) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const sign = (retried: boolean) => {
      void signChatMediaRefs(brandId, latestRefs.current).then((signed) => {
        if (cancelled) return;
        merge(signed);
        // The route answers every ref it was asked about, so a ref with no answer means the
        // call itself failed: ask once more rather than settle the strip into placeholders.
        const unanswered = latestRefs.current.some((ref) => !signed.has(chatMediaRefKey(ref)));
        if (unanswered && !retried) {
          retry = setTimeout(() => sign(true), CHAT_MEDIA_SIGN_RETRY_MS);
          return;
        }
        setSettledFor(refKeys);
      });
    };
    sign(false);
    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, [brandId, enabled, refKeys, merge]);

  const queued = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const recoveries = useRef(new Map<string, { count: number; since: number }>());
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      clearTimeout(retryTimer.current);
    },
    [],
  );

  const recover = useCallback(
    (key: string) => {
      if (!brandId) return;
      const now = Date.now();
      const last = recoveries.current.get(key);
      const asked = last && now - last.since < CHAT_MEDIA_RECOVERY_WINDOW_MS ? last : null;
      if (asked && asked.count >= CHAT_MEDIA_MAX_RECOVERIES_PER_TILE) return;
      recoveries.current.set(key, { count: (asked?.count ?? 0) + 1, since: asked?.since ?? now });
      queued.current.add(key);
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        const keys = new Set(queued.current);
        queued.current.clear();
        const failed = latestRefs.current.filter((ref) => keys.has(chatMediaRefKey(ref)));
        if (failed.length === 0) return;
        // Like the first sign, a re-sign whose call failed is asked once more: otherwise the
        // tile stays on its fallback although a fresh URL was one round trip away.
        const resign = (refs: ChatMediaRef[], retried: boolean) => {
          void signChatMediaRefs(brandId, refs, { force: true }).then((signed) => {
            merge(signed);
            const unanswered = refs.filter((ref) => !signed.has(chatMediaRefKey(ref)));
            if (unanswered.length === 0 || retried) return;
            retryTimer.current = setTimeout(() => resign(unanswered, true), CHAT_MEDIA_SIGN_RETRY_MS);
          });
        };
        resign(failed, false);
      }, CHAT_MEDIA_RECOVER_COALESCE_MS);
    },
    [brandId, merge],
  );

  return { tiles, settled: settledFor === refKeys, recover };
}

// Media signs once it comes near the viewport, so reopening a long thread signs what the reader
// can see, not everything it holds. Latched: media scrolled past stays signed.
export function useNearViewport(): [(node: HTMLElement | null) => void, boolean] {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (near || !node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near, node]);
  return [setNode, near];
}
