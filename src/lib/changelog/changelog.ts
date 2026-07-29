// Pure changelog logic: sort newest-first and derive unread counts against a
// persisted "last seen" id. No React and no data source here so the ordering /
// unread math stays unit-testable in isolation. Entries are sourced from the
// whats_new table via src/lib/changelog/server.ts.

import type { ChangelogEntry } from './schema';

export const CHANGELOG_RETENTION_DAYS = 5;

/** Oldest calendar date still eligible for the header changelog window, in UTC. */
export function getChangelogRetentionStartDate(now: Date = new Date()): string {
  const windowStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - CHANGELOG_RETENTION_DAYS),
  );
  return windowStart.toISOString().slice(0, 10);
}

/** Sort DESC by (date, id): newest first, same-day ties broken by id descending. */
export function sortChangelogDesc(entries: ChangelogEntry[]): ChangelogEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
}

export function getLatestEntryId(entries: ChangelogEntry[]): string | null {
  return entries[0]?.id ?? null;
}

/**
 * How many entries are newer than `lastSeenId` in the sorted (newest-first)
 * list. Fail-open: a null or unrecognized id counts every entry as unread so a
 * new user (or one whose seen-id predates the current window) sees today's news.
 */
export function computeUnreadCount(entries: ChangelogEntry[], lastSeenId: string | null): number {
  if (lastSeenId === null) return entries.length;
  const seenIndex = entries.findIndex((entry) => entry.id === lastSeenId);
  if (seenIndex === -1) return entries.length;
  return seenIndex;
}
