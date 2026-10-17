'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import type { OrganicCalendarPostedContent } from '@/components/organic/primitives/types';
import {
  type CalendarPostAccountsByPlatform,
  calendarPostsResponseSchema,
  getVisibleMonthRange,
  getWeekRange,
} from '@/lib/organic/calendar-posts';
import { getLocalStorageJSON, setLocalStorageJSON } from '@/lib/storage';

type UseCalendarPostedContentParams = {
  brandProfileId?: string;
  viewMode: 'week' | 'month' | 'list';
  weekStart: Date;
  monthAnchorDate: Date;
  accountsByPlatform: CalendarPostAccountsByPlatform;
};

type CalendarPostsCache = {
  cachedAt: number;
  posts: OrganicCalendarPostedContent[];
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const STALE_TIME_MS = 5 * 60 * 1000;
const GC_TIME_MS = 30 * 60 * 1000;
const LOAD_ERROR = 'Unable to load posted content.';
const EMPTY_POSTS: OrganicCalendarPostedContent[] = [];
const NO_EXTERNAL_RANGES: ReadonlySet<string> = new Set();

// Whether the range includes posts read from the platforms' own APIs (TikTok, YouTube) is part
// of the key. Kept outside it, every refetch on focus, reconnect or retry ran the database-only
// request and quietly replaced the external posts the user had asked for.
export const calendarPostsQueryKey = (
  brandId: string | undefined,
  start: string,
  end: string,
  accountsKey: string,
  includeExternal: boolean,
) => ['organic-calendar-posts', brandId, start, end, accountsKey, includeExternal] as const;

function stableAccountKey(accountsByPlatform: CalendarPostAccountsByPlatform): string {
  return (['instagram', 'facebook', 'tiktok', 'youtube'] as const)
    .flatMap((platform) =>
      accountsByPlatform[platform].map((account) => `${platform}:${account.integrationAccountId}`),
    )
    .sort()
    .join('|');
}

function readFreshCache(key: string): OrganicCalendarPostedContent[] | null {
  const cached = getLocalStorageJSON<CalendarPostsCache | null>(key, null);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > CACHE_TTL_MS) return null;
  return cached.posts;
}

async function fetchCalendarPosts(body: {
  brandId: string;
  start: string;
  end: string;
  accountsByPlatform: CalendarPostAccountsByPlatform;
  includeExternal: boolean;
  forceRefreshExternal: boolean;
}): Promise<OrganicCalendarPostedContent[]> {
  const response = await fetch('/api/organic/calendar-posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(LOAD_ERROR);
  return calendarPostsResponseSchema.parse(await response.json()).posts;
}

const subscribeToNothing = () => () => undefined;

export function useCalendarPostedContent({
  brandProfileId,
  viewMode,
  weekStart,
  monthAnchorDate,
  accountsByPlatform,
}: UseCalendarPostedContentParams) {
  const queryClient = useQueryClient();
  const [isFetchingExternal, setIsFetchingExternal] = React.useState(false);
  const [externalRanges, setExternalRanges] = React.useState(NO_EXTERNAL_RANGES);
  const [externalError, setExternalError] = React.useState<{
    cacheKey: string;
    message: string;
  } | null>(null);

  const range = React.useMemo(
    () => (viewMode === 'month' ? getVisibleMonthRange(monthAnchorDate) : getWeekRange(weekStart)),
    [monthAnchorDate, viewMode, weekStart],
  );
  const accountsKey = React.useMemo(
    () => stableAccountKey(accountsByPlatform),
    [accountsByPlatform],
  );
  const cacheKey = brandProfileId
    ? [
        'continuum:organic-calendar:posted-content',
        brandProfileId,
        range.start,
        range.end,
        accountsKey,
      ].join(':')
    : null;
  const includeExternal = cacheKey !== null && externalRanges.has(cacheKey);
  const queryKey = React.useMemo(
    () => calendarPostsQueryKey(brandProfileId, range.start, range.end, accountsKey, includeExternal),
    [accountsKey, brandProfileId, includeExternal, range.end, range.start],
  );

  // The localStorage copy is read only once hydrated: the server has no storage, so reading
  // it during the hydration render would paint posts the server HTML never had.
  const isHydrated = React.useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  const storedPosts = React.useMemo(
    () => (isHydrated && cacheKey ? readFreshCache(cacheKey) : null),
    [cacheKey, isHydrated],
  );

  const fetchPosts = React.useCallback(
    async (options: { includeExternal: boolean; forceRefreshExternal: boolean }) => {
      if (!brandProfileId || !cacheKey) return EMPTY_POSTS;
      const posts = await fetchCalendarPosts({
        brandId: brandProfileId,
        start: range.start,
        end: range.end,
        accountsByPlatform,
        ...options,
      });
      setLocalStorageJSON<CalendarPostsCache>(cacheKey, { cachedAt: Date.now(), posts });
      return posts;
    },
    [accountsByPlatform, brandProfileId, cacheKey, range.end, range.start],
  );

  // Placeholder, not initialData: the stored copy shows while every mount revalidates, as it
  // did before, and the query cache then serves repeat visits within the stale window.
  const query = useQuery({
    queryKey,
    // A background refetch reads the platforms' cached answers; only the explicit fetch below
    // forces them to refresh.
    queryFn: () => fetchPosts({ includeExternal, forceRefreshExternal: false }),
    enabled: Boolean(brandProfileId),
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    placeholderData: storedPosts ?? undefined,
  });

  const fetchExternalPosts = React.useCallback(async () => {
    if (!cacheKey) return;
    const externalKey = calendarPostsQueryKey(
      brandProfileId,
      range.start,
      range.end,
      accountsKey,
      true,
    );
    setIsFetchingExternal(true);
    setExternalError(null);
    try {
      const posts = await fetchPosts({ includeExternal: true, forceRefreshExternal: true });
      // A refetch of this key that started while the forced one ran would otherwise land
      // after it and overwrite the fresh answer with the older one it read.
      await queryClient.cancelQueries({ queryKey: externalKey });
      queryClient.setQueryData(externalKey, posts);
      // Switched only once the data is in place, so the key change finds it fresh instead of
      // starting a second, unforced external request.
      setExternalRanges((current) => new Set(current).add(cacheKey));
    } catch (error: unknown) {
      setExternalError({ cacheKey, message: error instanceof Error ? error.message : LOAD_ERROR });
    } finally {
      setIsFetchingExternal(false);
    }
  }, [accountsKey, brandProfileId, cacheKey, fetchPosts, queryClient, range.end, range.start]);

  const { refetch } = query;
  const retry = React.useCallback(() => {
    setExternalError(null);
    void refetch();
  }, [refetch]);

  // A retry clears the alert while it runs, as the hand-rolled fetch did.
  const queryError =
    query.error && !query.isFetching
      ? query.error instanceof Error
        ? query.error.message
        : LOAD_ERROR
      : null;

  return {
    posts: query.data ?? EMPTY_POSTS,
    range,
    // First load only: a background refetch keeps the posts on screen, so it must not flash
    // the loading row above the grid. A query disabled for want of a brand never loads.
    isLoading: Boolean(brandProfileId) && query.isPending,
    isFetchingExternal,
    error: (externalError?.cacheKey === cacheKey ? externalError.message : null) ?? queryError,
    retry,
    fetchExternalPosts,
  };
}
