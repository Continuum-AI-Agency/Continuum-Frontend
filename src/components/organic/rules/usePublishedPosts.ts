'use client';

// The brand's published posts, for choosing which ones a rule watches.
//
// Reuses the analytics read the metrics tab already makes, with scope 'posts'.
// Nothing new is fetched from Instagram and no permission is added: the
// thumbnails, captions and dates a picker needs are already crossing the wire
// for the dashboard.
//
// Decisions worth knowing before changing this file:
// - 25 posts per request is the route's own ceiling. Asking for more is rejected
//   before the request reaches Instagram, which is how the picker first appeared
//   broken. More than 25 therefore has to come from more requests, not a bigger
//   one — a client who posts often would otherwise be unable to point a rule at
//   anything older than a couple of weeks.
// - The windows come from the metrics gallery's own helper, which tiles history
//   without overlapping or skipping a day. Reusing it means the picker and the
//   gallery cannot disagree about what "the last 90 days" means.
// - Ids are de-duplicated on the way out. The windows do not overlap today, and
//   a boundary change that made them overlap must not double a tile.
// - An empty window advances by itself. The first window is only the last seven
//   days, so an account that posted nine days ago opens to an empty grid and a
//   button — "show me my posts" must not require clicking past windows that hold
//   nothing. Bounded by the window count, so an account with no posts at all
//   makes a handful of requests and stops.
// - The account id must be the METRICS `integrationAccountId`, which is what the
//   analytics route resolves posts by. The publisher's own account id is a
//   different identifier for the same account: passing it is accepted, returns
//   nothing, and reads as "this account has no posts".
// - A refresh that bypasses the cache is offered, not automatic. The analytics
//   read is cached upstream, so a post published minutes ago — or a window read
//   while a token was briefly dead — stays missing until someone asks again.
//   Forcing it on every open would spend an Instagram call each time the tab is
//   visited to learn nothing.
// - Published posts do not change, so this is kept fresh far longer than the
//   rules are. Re-fetching on every visit spends an Instagram call to learn
//   nothing.

import { useInfiniteQuery } from '@tanstack/react-query';
import React from 'react';
import { postWindowRange } from '@/components/organic/organic-metrics-utils';
import { fetchOrganicAnalytics } from '@/lib/api/organicAnalytics.client';
import type { OrganicPost } from '@/lib/schemas/organicMetrics';

const POSTS_PER_WINDOW = 25;
const STALE_TIME = 15 * 60_000;

interface PostWindow {
  posts: OrganicPost[];
  offset: number;
}

export interface PublishedPosts {
  posts: OrganicPost[];
  /** Re-read past the upstream cache. */
  refresh: () => void;
  isRefreshing: boolean;
  /** False when no account was named, which is a different problem from an empty account. */
  hasAccount: boolean;
  isLoading: boolean;
  isError: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
}

function dedupeById(posts: OrganicPost[]): OrganicPost[] {
  const seen = new Set<string>();
  return posts.filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
}

export function usePublishedPosts(input: {
  brandId: string | null;
  accountId: string | null;
  enabled?: boolean;
}): PublishedPosts {
  const { brandId, accountId, enabled = true } = input;

  const [force, setForce] = React.useState(0);

  const query = useInfiniteQuery<PostWindow>({
    queryKey: ['comment-rules', 'published-posts', brandId ?? 'none', accountId ?? 'none', force],
    enabled: enabled && brandId !== null && accountId !== null,
    staleTime: STALE_TIME,
    retry: 1,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const offset = pageParam as number;
      const range = postWindowRange(offset);
      if (range === null) return { posts: [], offset };
      const result = await fetchOrganicAnalytics({
        brandId: brandId as string,
        integrationAccountId: accountId as string,
        platform: 'instagram',
        range: { preset: 'custom', custom: range },
        scope: 'posts',
        postsLimit: POSTS_PER_WINDOW,
        forceRefresh: force > 0,
      });
      return { posts: result?.posts ?? [], offset };
    },
    getNextPageParam: (last) =>
      postWindowRange(last.offset + 1) === null ? undefined : last.offset + 1,
  });

  const posts = dedupeById((query.data?.pages ?? []).flatMap((page) => page.posts));

  const { isFetching, hasNextPage, fetchNextPage } = query;
  React.useEffect(() => {
    if (posts.length === 0 && hasNextPage && !isFetching) void fetchNextPage();
  }, [posts.length, hasNextPage, isFetching, fetchNextPage]);

  return {
    posts,
    hasAccount: accountId !== null,
    refresh: () => setForce((n) => n + 1),
    isRefreshing: force > 0 && query.isFetching,
    // Still "loading" while windows are being skipped: nothing has been found
    // yet, so an empty grid would be a wrong answer rather than a slow one.
    isLoading: query.isLoading || (posts.length === 0 && query.hasNextPage),
    isError: query.isError,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMore: () => {
      void query.fetchNextPage();
    },
  };
}
