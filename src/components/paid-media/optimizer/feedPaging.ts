// Keyset paging for the optimizer's two brand feeds, on the client side of the edge.
//
// Both RPCs cursor on `ts` with a STRICT `<`, which loses every row that ties with the
// cursor. optimizer_list_actions already handles that server-side (the `actions` view
// returns `next_before`); optimizer_list_logs cannot, because the logs view's response
// shape — `{ logs }` and nothing else — is load-bearing for deployed clients. So the
// same rule is applied here for the log feed: hold the trailing tie group back from THIS
// page and cursor on the last row that survives, so the next read picks that whole group up.
// The cost is one deferred row per page; the alternative is a feed with holes in it.

/** One keyset page. `nextBefore` is null exactly when the feed is exhausted. */
export type FeedPage<TRow> = { rows: TRow[]; nextBefore: string | null };

type TimestampedRow = { ts: string };

/**
 * Turn a raw page of newest-first rows into a page plus its cursor.
 *
 * A SHORT page means the feed is exhausted — no cursor, no further reads. A FULL page
 * whose trailing rows share one timestamp is trimmed back to before that group. A page
 * that is one tie group end to end has nothing to trim: it cursors on the shared
 * timestamp and accepts the gap rather than returning an empty page forever.
 */
export function pageOnTimestamp<TRow extends TimestampedRow>(
  rows: readonly TRow[],
  limit: number,
): FeedPage<TRow> {
  const lastTs = rows[rows.length - 1]?.ts;
  if (rows.length < limit || typeof lastTs !== 'string') {
    return { rows: [...rows], nextBefore: null };
  }
  const tieStart = rows.findIndex((row) => row.ts === lastTs);
  if (tieStart <= 0) return { rows: [...rows], nextBefore: lastTs };
  const kept = rows.slice(0, tieStart);
  return { rows: kept, nextBefore: kept[kept.length - 1]?.ts ?? lastTs };
}

/**
 * Flatten loaded pages into one feed, first occurrence wins.
 *
 * Two things make duplicates real rather than theoretical: the tie-group overlap above,
 * and a periodic refetch — React Query re-runs every loaded page against its FROZEN
 * cursor, so rows written since the first load push the page-1 boundary down into page 2.
 * Both are honest reads of a moving feed; rendering the same row twice is not.
 */
export function dedupeById<TRow extends { id: string | number }>(
  pages: readonly { rows: TRow[] }[],
): TRow[] {
  const seen = new Set<string>();
  const out: TRow[] = [];
  for (const page of pages) {
    for (const row of page.rows) {
      const key = String(row.id);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}
