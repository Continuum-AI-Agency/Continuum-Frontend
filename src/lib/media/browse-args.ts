import {
  type LibraryBrowseQuery,
  libraryBrowseRpcQuery,
  libraryBrowseSortSpecs,
} from '@continuum/contracts';

/**
 * The contract → RPC argument mapping for `media.library_browse_assets` and
 * `media.library_browse_facet_counts`.
 *
 * Deliberately NOT inside `browse.server.ts`: that module imports `server-only` (and, through
 * `signed-urls`, `next/headers`), so nothing outside a Next request can load it — which would
 * leave an end-to-end bench with no choice but to restate this mapping and grade its own copy.
 * A filter that is passed under the wrong key is exactly the bug such a copy hides.
 *
 * Every filter travels inside ONE jsonb argument, so a new filter is a new key, never a new
 * argument — a second overload is what takes a PostgREST RPC down.
 */
export function libraryBrowseQueryArg(query: LibraryBrowseQuery): Record<string, unknown> {
  return {
    ...libraryBrowseRpcQuery(query),
    ...(query.collectionId ? { collectionId: query.collectionId } : {}),
  };
}

/** The keyset position after a row: its sort key values, then its id. */
export type LibraryBrowseCursor = { keys: unknown[]; id: string };

export function libraryBrowseAssetsArgs(
  query: LibraryBrowseQuery,
  cursor: LibraryBrowseCursor | null,
  limit: number = query.limit,
) {
  return {
    p_brand_id: query.brandId,
    p_query: libraryBrowseQueryArg(query),
    p_sorts: libraryBrowseSortSpecs(query),
    p_cursor: cursor,
    p_limit: limit,
  };
}

export function libraryBrowseFacetArgs(query: LibraryBrowseQuery) {
  return { p_brand_id: query.brandId, p_query: libraryBrowseQueryArg(query) };
}

export function encodeLibraryBrowseCursor(cursor: LibraryBrowseCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/** Inverse of encodeLibraryBrowseCursor; a cursor from before the keyset change reads as none. */
export function decodeLibraryBrowseCursor(
  value: string | null | undefined,
): LibraryBrowseCursor | null {
  if (!value) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid Library cursor');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid Library cursor');
  const { keys, id } = parsed as { keys?: unknown; id?: unknown };
  if (typeof id !== 'string') throw new Error('Invalid Library cursor');
  return Array.isArray(keys) ? { keys, id } : null;
}
