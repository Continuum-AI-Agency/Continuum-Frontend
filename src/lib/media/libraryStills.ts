'use client';

import { useQuery } from '@tanstack/react-query';

export type StillEdge = 96 | 160 | 320 | 480;

const BATCH = 100;

type Waiters = Map<string, Array<(url: string | null) => void>>;
const queues = new Map<string, { brandId: string; edge: StillEdge; waiters: Waiters }>();

async function flush(queueKey: string) {
  const queue = queues.get(queueKey);
  queues.delete(queueKey);
  if (!queue) return;
  const ids = [...queue.waiters.keys()];
  for (let start = 0; start < ids.length; start += BATCH) {
    const assetIds = ids.slice(start, start + BATCH);
    let stills: Record<string, string | null> = {};
    try {
      const response = await fetch('/api/library/stills', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brandId: queue.brandId, assetIds, edge: queue.edge }),
      });
      if (response.ok) stills = ((await response.json()) as { stills: typeof stills }).stills;
    } catch (error) {
      console.warn('[libraryStills] could not load stills', error);
    }
    for (const id of assetIds) {
      for (const resolve of queue.waiters.get(id) ?? []) resolve(stills[id] ?? null);
    }
  }
}

/**
 * A Library asset's small still (its poster, or the image resized to `edge`), never the original.
 * Every box that asks in the same tick shares one request, so a ledger of 50 rows is one call.
 */
export function loadLibraryStill(
  brandId: string,
  assetId: string,
  edge: StillEdge,
): Promise<string | null> {
  const queueKey = `${brandId}\n${edge}`;
  let queue = queues.get(queueKey);
  if (!queue) {
    queue = { brandId, edge, waiters: new Map() };
    queues.set(queueKey, queue);
    setTimeout(() => void flush(queueKey), 0);
  }
  const waiters = queue.waiters;
  return new Promise((resolve) => {
    waiters.set(assetId, [...(waiters.get(assetId) ?? []), resolve]);
  });
}

/** The still for one box: undefined while it loads, null when the asset has none. */
export function useLibraryStill(
  brandId: string | null | undefined,
  assetId: string | null | undefined,
  edge: StillEdge,
): string | null | undefined {
  const { data } = useQuery({
    queryKey: ['library-still', brandId, assetId, edge],
    queryFn: () => loadLibraryStill(brandId as string, assetId as string, edge),
    enabled: Boolean(brandId && assetId),
    // A signed still lives an hour; the server hands back the same URL while half of it is left.
    staleTime: 25 * 60_000,
  });
  return data;
}
