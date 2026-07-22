// Pure changelog logic: parse the authored raw array once, sort newest-first,
// and derive unread counts against a persisted "last seen" id. No React here so
// the ordering/unread math is unit-testable in isolation.

import { CHANGELOG_RAW } from '@/content/changelog';
import { type ChangelogEntry, changelogSchema } from './schema';

let sortedCache: ChangelogEntry[] | null = null;

/**
 * Validated changelog entries sorted DESC by (date, id). Parsing and sorting run
 * once, then memoize — the source is a static module-level constant.
 */
export function getSortedChangelog(): ChangelogEntry[] {
  if (sortedCache) return sortedCache;
  const parsed = changelogSchema.parse(CHANGELOG_RAW);
  sortedCache = [...parsed].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
  return sortedCache;
}

export function getLatestEntryId(entries: ChangelogEntry[]): string | null {
  return entries[0]?.id ?? null;
}

/**
 * How many entries are newer than `lastSeenId` in the sorted (newest-first)
 * list. Fail-open: a null or unrecognized id counts every entry as unread so a
 * new user (or one whose seen-id predates the current bundle) sees today's news.
 */
export function computeUnreadCount(entries: ChangelogEntry[], lastSeenId: string | null): number {
  if (lastSeenId === null) return entries.length;
  const seenIndex = entries.findIndex((entry) => entry.id === lastSeenId);
  if (seenIndex === -1) return entries.length;
  return seenIndex;
}
