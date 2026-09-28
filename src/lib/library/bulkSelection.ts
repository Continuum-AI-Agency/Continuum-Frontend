// "Select all matching" for the bulk toolbar, and the chunking every bulk write needs.
//
// The dispatcher takes at most 250 asset ids per call (media.library_execute_operation
// refuses more), so a selection of any size is written as sequential chunks. Sequential,
// not parallel: each chunk is its own idempotent operation, and a failure stops the run
// with the earlier chunks applied and reported, instead of racing half the brand.

import type { LibraryBrowsePage } from '@continuum/contracts';

export const BULK_CHUNK_SIZE = 250;

// Past this a "select all" is a data migration, not a gesture.
export const MAX_MATCHING_SELECTION = 5000;

const BROWSE_PAGE_SIZE = 96;

export function chunkIds(ids: readonly string[], size = BULK_CHUNK_SIZE): string[][] {
  const chunks: string[][] = [];
  for (let start = 0; start < ids.length; start += size) {
    chunks.push(ids.slice(start, start + size));
  }
  return chunks;
}

/** Runs `write` over every chunk in order; returns how many ids were written. */
export async function writeInChunks(
  ids: readonly string[],
  write: (chunk: string[]) => Promise<unknown>,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  let done = 0;
  for (const chunk of chunkIds(ids)) {
    await write(chunk);
    done += chunk.length;
    onProgress?.(done, ids.length);
  }
  return done;
}

/**
 * writeInChunks for a selection another member may be deleting from. The dispatcher refuses
 * a whole chunk as asset_not_found when one of its ids is gone — ordinary across a thousand
 * selected assets — so a refused chunk is re-read (`remainingOf`) and written again with the
 * ids that are left. Returns how many ids were actually written.
 */
export async function writeInChunksSkippingVanished(
  ids: readonly string[],
  write: (chunk: string[]) => Promise<unknown>,
  remainingOf: (chunk: string[]) => Promise<string[]>,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  let skipped = 0;
  const done = await writeInChunks(
    ids,
    async (chunk) => {
      try {
        return await write(chunk);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith('asset_not_found')) throw error;
        const remaining = await remainingOf(chunk);
        if (remaining.length === chunk.length) throw error;
        skipped += chunk.length - remaining.length;
        return remaining.length > 0 ? write(remaining) : undefined;
      }
    },
    onProgress,
  );
  return done - skipped;
}

/**
 * Every asset id the Library page's current filters match, read through the same
 * browse route the grid pages with. `search` is the page's own query string — the
 * page's URL IS its filter state — so the selection cannot disagree with the grid.
 */
export async function fetchAllMatchingAssetIds(params: {
  brandId: string;
  search: string;
  collectionId: string | null;
  fetchImpl?: typeof fetch;
}): Promise<string[]> {
  const fetcher = params.fetchImpl ?? fetch;
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams(params.search);
    query.set('brandId', params.brandId);
    query.set('limit', String(BROWSE_PAGE_SIZE));
    if (params.collectionId) query.set('collection', params.collectionId);
    if (cursor) query.set('cursor', cursor);
    else query.delete('cursor');
    const response = await fetcher(`/api/library/browse?${query.toString()}`);
    if (!response.ok) throw new Error(`Loading the matching assets failed (${response.status})`);
    const page = (await response.json()) as LibraryBrowsePage;
    for (const item of page.items) ids.push(item.id);
    cursor = page.nextCursor;
  } while (cursor && ids.length < MAX_MATCHING_SELECTION);
  return [...new Set(ids)].slice(0, MAX_MATCHING_SELECTION);
}
