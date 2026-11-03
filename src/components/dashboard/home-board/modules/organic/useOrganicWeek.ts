'use client';

// The organic week's two reads, both the ones the Organic calendar makes, so a visit to either
// warms the other:
//   - published posts: POST /api/organic/calendar-posts {brandId, start, end} for this week,
//     database only (organic.organic_published_posts) — the same hook and cache key as the
//     calendar; it never asks the platforms' APIs from the Home;
//   - drafts: GET /api/organic/calendar/drafts?brandId (Backend), every draft of the brand, as
//     the calendar loads them; the week is sliced locally.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';
import { useCalendarPostedContent } from '@/components/organic/hooks/useCalendarPostedContent';
import { request } from '@/lib/api/http';
import type { SnapshotAccountRef } from '@/lib/organic/brandOrganicSnapshot';
import type { PersistedOrganicDraftRow } from '@/lib/organic/calendar-draft-persistence';
import type { CalendarPostAccountsByPlatform } from '@/lib/organic/calendar-posts';
import { buildOrganicWeek, type OrganicWeek, organicWeekStart } from './organicWeekModel';

const draftRowSchema = z.custom<PersistedOrganicDraftRow>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string',
);
const draftsResponseSchema = z.object({ drafts: z.array(draftRowSchema) });
type DraftsResponse = { drafts: PersistedOrganicDraftRow[] };

export const homeOrganicDraftsKey = (brandId: string) => ['home-organic-drafts', brandId] as const;

function postAccountsOf(accounts: SnapshotAccountRef[]): CalendarPostAccountsByPlatform {
  const byPlatform: CalendarPostAccountsByPlatform = {
    instagram: [],
    facebook: [],
    tiktok: [],
    youtube: [],
    linkedin: [],
  };
  for (const account of accounts) {
    if (account.platform === 'x') continue;
    byPlatform[account.platform].push({
      integrationAccountId: account.integrationAccountId,
      name: account.name,
    });
  }
  return byPlatform;
}

export type OrganicWeekLoad = {
  week: OrganicWeek | null;
  loading: boolean;
  failed: boolean;
  retry: () => void;
};

export function useOrganicWeek(brandId: string, accounts: SnapshotAccountRef[]): OrganicWeekLoad {
  const queryClient = useQueryClient();
  const enabled = accounts.length > 0;
  // Today's Monday, fixed for the life of the mount so the cache key does not move.
  const weekStart = useMemo(() => organicWeekStart(new Date()), []);
  const accountsKey = accounts.map((account) => account.integrationAccountId).join('|');
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key names the accounts; a new array with the same accounts must not refetch
  const accountsByPlatform = useMemo(() => postAccountsOf(accounts), [accountsKey]);

  const posts = useCalendarPostedContent({
    brandProfileId: enabled ? brandId : undefined,
    viewMode: 'week',
    weekStart,
    monthAnchorDate: weekStart,
    accountsByPlatform,
  });
  const drafts = useQuery({
    queryKey: homeOrganicDraftsKey(brandId),
    queryFn: () =>
      request<DraftsResponse>({
        path: `/api/organic/calendar/drafts?${new URLSearchParams({ brandId })}`,
        schema: draftsResponseSchema,
      }),
    enabled,
    staleTime: 60_000,
  });

  const week = useMemo(
    () =>
      drafts.data && !posts.isLoading
        ? buildOrganicWeek({ now: new Date(), posts: posts.posts, drafts: drafts.data.drafts })
        : null,
    [drafts.data, posts.isLoading, posts.posts],
  );

  const { retry: retryPosts } = posts;
  const retry = useCallback(() => {
    retryPosts();
    void queryClient.invalidateQueries({ queryKey: homeOrganicDraftsKey(brandId) });
  }, [brandId, queryClient, retryPosts]);

  return {
    week,
    loading: enabled && (posts.isLoading || drafts.isPending),
    failed: Boolean(posts.error) || drafts.isError,
    retry,
  };
}
