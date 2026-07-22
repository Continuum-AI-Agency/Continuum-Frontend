'use client';

// Read-model for the header "What's New" bell. Combines the static, validated
// changelog with the persisted last-seen id to derive the unread badge count.
// The store is client-persisted, so unreadCount is gated behind a mounted flag
// to keep the server render (always 0) matching the first client render and
// avoid a hydration mismatch on the badge.

import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  computeUnreadCount,
  getLatestEntryId,
  getSortedChangelog,
} from '@/lib/changelog/changelog';
import type { ChangelogEntry } from '@/lib/changelog/schema';
import { useDashboardPrefsStore } from '@/stores/dashboardPrefs';

export type UseChangelogResult = {
  entries: ChangelogEntry[];
  unreadCount: number;
  latestId: string | null;
  lastSeenId: string | null;
  markAllSeen: () => void;
};

export function useChangelog(): UseChangelogResult {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { lastSeenId, setLastSeenChangelogId } = useDashboardPrefsStore(
    useShallow((store) => ({
      lastSeenId: store.lastSeenChangelogId,
      setLastSeenChangelogId: store.setLastSeenChangelogId,
    })),
  );

  const entries = getSortedChangelog();
  const latestId = getLatestEntryId(entries);

  const unreadCount = useMemo(
    () => (mounted ? computeUnreadCount(entries, lastSeenId) : 0),
    [mounted, entries, lastSeenId],
  );

  return {
    entries,
    unreadCount,
    latestId,
    lastSeenId,
    markAllSeen: () => setLastSeenChangelogId(latestId),
  };
}
