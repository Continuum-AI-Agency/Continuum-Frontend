'use client';

// The playback renditions of one asset version (ladder, HDR proxy, scrub sprite, audio
// proxy), fetched once per version and shared: a grid of cards hovers the same asset
// many times, and the detail stage and its download menu read the same answer.

import { type LibraryPlayback, libraryPlaybackSchema } from '@continuum/contracts';
import { useEffect, useState } from 'react';

type PlaybackKey = { brandId: string; assetId: string; versionId?: string | null };
type VersionKey = Pick<PlaybackKey, 'assetId' | 'versionId'>;

// The signed URLs live an hour; a Library tab stays open far longer, so an answer is
// refetched well before its URLs would 400.
const CACHE_TTL_MS = 45 * 60 * 1000;

type Entry = {
  at: number;
  promise: Promise<LibraryPlayback | null>;
  value?: LibraryPlayback | null;
};
const cache = new Map<string, Entry>();

const cacheKey = ({ assetId, versionId }: VersionKey) => `${assetId}:${versionId ?? 'head'}`;

function freshEntry(key: string): Entry | undefined {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.at < CACHE_TTL_MS) return entry;
  cache.delete(key);
  return undefined;
}

/** Null when the asset has no version to play (404); throws on any other failure. */
export function fetchLibraryPlayback(key: PlaybackKey): Promise<LibraryPlayback | null> {
  const id = cacheKey(key);
  const cached = freshEntry(id);
  if (cached) return cached.promise;

  const query = new URLSearchParams({ brandId: key.brandId, assetId: key.assetId });
  if (key.versionId) query.set('versionId', key.versionId);
  const entry: Entry = {
    at: Date.now(),
    promise: fetch(`/api/library/playback?${query.toString()}`).then(async (response) => {
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Playback lookup failed (${response.status})`);
      return libraryPlaybackSchema.parse(await response.json());
    }),
  };
  cache.set(id, entry);
  entry.promise.then(
    (value) => {
      entry.value = value;
    },
    // A failure is not an answer: the next hover asks again.
    () => {
      if (cache.get(id) === entry) cache.delete(id);
    },
  );
  return entry.promise;
}

/** A settled answer already in the cache, so a re-hover paints without a render of lag. */
export function peekLibraryPlayback(key: VersionKey): LibraryPlayback | null | undefined {
  return freshEntry(cacheKey(key))?.value;
}

/** Test seam: forget every cached answer. */
export function clearLibraryPlaybackCache(): void {
  cache.clear();
}

/** The playback of one version; null until it loads, when disabled, or when there is none. */
export function useLibraryPlayback(
  key: Partial<PlaybackKey> & { enabled?: boolean },
): LibraryPlayback | null {
  const { brandId, assetId, versionId, enabled = true } = key;
  const [loaded, setLoaded] = useState<{ id: string; value: LibraryPlayback | null } | null>(null);
  const id = enabled && brandId && assetId ? cacheKey({ assetId, versionId }) : null;

  useEffect(() => {
    if (!enabled || !brandId || !assetId) return;
    let live = true;
    const id = cacheKey({ assetId, versionId });
    fetchLibraryPlayback({ brandId, assetId, versionId }).then(
      (value) => {
        if (live) setLoaded({ id, value });
      },
      (error: unknown) => console.warn('[libraryPlayback] lookup failed', error),
    );
    return () => {
      live = false;
    };
  }, [enabled, brandId, assetId, versionId]);

  if (!id || !assetId) return null;
  if (loaded?.id === id) return loaded.value;
  return peekLibraryPlayback({ assetId, versionId }) ?? null;
}
