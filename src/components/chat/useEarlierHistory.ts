'use client';

import { useCallback, useState } from 'react';

// Paging backwards through a transcript is the same problem on every surface: hold the cursor for
// the next older page, fetch it once at a time, splice it in above what is already loaded, and stop
// when the cursor runs out. Only "how to apply a page" differs, so that is the one thing injected.

export type EarlierPage<TItem> = {
  items: TItem[];
  nextCursor: string | null;
};

type UseEarlierHistoryParams<TItem> = {
  // Returns null when the surface cannot fetch right now (no session, no brand).
  fetchPage: (cursor: string) => Promise<EarlierPage<TItem> | null>;
  applyPage: (items: TItem[]) => void;
};

export type EarlierHistory = {
  hasEarlier: boolean;
  isLoadingEarlier: boolean;
  loadEarlier: () => Promise<void>;
  /** Seed from the first page's cursor, and reset to null when switching sessions. */
  setEarlierCursor: (cursor: string | null) => void;
};

export function useEarlierHistory<TItem>({
  fetchPage,
  applyPage,
}: UseEarlierHistoryParams<TItem>): EarlierHistory {
  const [earlierCursor, setEarlierCursor] = useState<string | null>(null);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);

  const loadEarlier = useCallback(async () => {
    if (!earlierCursor || isLoadingEarlier) return;

    setIsLoadingEarlier(true);
    try {
      const page = await fetchPage(earlierCursor);
      if (!page) return;
      applyPage(page.items);
      setEarlierCursor(page.nextCursor);
    } catch {
      // A failed page must not leave the sentinel armed on a cursor that keeps throwing.
      setEarlierCursor(null);
    } finally {
      setIsLoadingEarlier(false);
    }
  }, [applyPage, earlierCursor, fetchPage, isLoadingEarlier]);

  return {
    hasEarlier: Boolean(earlierCursor),
    isLoadingEarlier,
    loadEarlier,
    setEarlierCursor,
  };
}

/**
 * Splices an older page above what is already loaded, dropping anything already present. An
 * overlapping re-fetch is normal (a turn can land while a page is in flight) and must not duplicate
 * a message.
 */
export function prependUnseen<TItem extends { id: string }>(
  current: readonly TItem[],
  older: readonly TItem[],
): TItem[] {
  if (older.length === 0) return current as TItem[];
  const known = new Set(current.map((item) => item.id));
  const fresh = older.filter((item) => !known.has(item.id));
  return fresh.length > 0 ? [...fresh, ...current] : (current as TItem[]);
}
