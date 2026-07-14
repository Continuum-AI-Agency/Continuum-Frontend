'use client';

import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';

import { fetchOrganicAnalytics } from '@/lib/api/organicAnalytics.client';
import {
  selectAccountPostDetails,
  usePostAnalyticsStore,
} from '@/lib/organic/post-analytics-store';
import type { OrganicPlatform, OrganicPost } from '@/lib/schemas/organicMetrics';

const POST_INSIGHT_METRIC_KEYS = [
  'reach',
  'views',
  'likes',
  'comments',
  'shares',
  'saved',
  'totalInteractions',
] as const;

// A cached response with every core metric at zero is the signature of a
// transient Meta failure that slipped past the edge fn's own zero-guard
// before it started guarding; self-heal it with one forced live refetch
// rather than showing a permanently blank card.
export function isAllZeroPost(post: OrganicPost): boolean {
  const metrics = post.metrics;
  if (!metrics) return true;
  return POST_INSIGHT_METRIC_KEYS.every((key) => {
    const value = metrics[key];
    return typeof value !== 'number' || value === 0;
  });
}

type UseOrganicPostDetailParams = {
  brandId: string;
  platform: Extract<OrganicPlatform, 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'linkedin'>;
  integrationAccountId: string | null;
};

type UseOrganicPostDetailReturn = {
  // Store-first cache check, then a live fetch (self-healing a stale all-zero
  // cache entry with one forced refetch). Safe to call repeatedly for the
  // same postId — in-flight and already-loaded ids are deduped internally.
  // Resolves the post (cached or freshly fetched), or null when unavailable.
  requestPostDetail: (postId: string) => Promise<OrganicPost | null>;
  // Bypasses the local/server cache once per post after a rendered media URL
  // fails. Repeated image errors are deduped until the account scope resets.
  recoverPostMedia: (postId: string) => Promise<OrganicPost | null>;
  loadingPostId: string | null;
  // Scoped to integrationAccountId, keyed by post id. Backed by
  // usePostAnalyticsStore, so any consumer sharing an account+post pair reads
  // the same cache entry — no duplicate fetches across widgets.
  postDetailsById: Record<string, OrganicPost>;
  // Clears the in-flight/loaded gating refs and the shared store, forcing the
  // next requestPostDetail call for any post to hit the network again — for
  // an explicit "refresh" action, not needed on ordinary account/platform switches.
  resetPostDetails: () => void;
};

// Single-post detail fetch + cache, shared by every surface that wants a
// post's full detail (fresh thumbnail_url, comments, breakdowns) beyond what
// the bulk posts list carries. The bulk analytics response is cached for 12h
// server-side; Meta's signed thumbnail/media URLs routinely expire inside
// that window, so this lazy, per-post path is what keeps a post's visible
// thumbnail fresh instead of relying on the bulk payload's baked-in URL.
export function useOrganicPostDetail(
  params: UseOrganicPostDetailParams,
): UseOrganicPostDetailReturn {
  const { brandId, platform, integrationAccountId } = params;

  const setPostDetailInStore = usePostAnalyticsStore((store) => store.setPostDetail);
  const postDetailsById = usePostAnalyticsStore(
    useShallow((store) => selectAccountPostDetails(store.postDetailsById, integrationAccountId)),
  );

  const [loadingPostId, setLoadingPostId] = React.useState<string | null>(null);
  const loadedPostDetailIdsRef = React.useRef<Set<string>>(new Set());
  const loadingPostDetailIdsRef = React.useRef<Set<string>>(new Set());
  const recoveredMediaPostIdsRef = React.useRef<Set<string>>(new Set());
  const mediaRecoveryGenerationRef = React.useRef<Map<string, number>>(new Map());

  // biome-ignore lint/correctness/useExhaustiveDependencies: platform/integrationAccountId are intentional trigger deps (reset gating refs on account switch), not data deps the effect body reads
  React.useEffect(() => {
    loadedPostDetailIdsRef.current.clear();
    loadingPostDetailIdsRef.current.clear();
    recoveredMediaPostIdsRef.current.clear();
    mediaRecoveryGenerationRef.current.clear();
    setLoadingPostId(null);
  }, [platform, integrationAccountId]);

  const requestPostDetail = React.useCallback(
    async (postId: string): Promise<OrganicPost | null> => {
      if (!integrationAccountId || postId.length === 0) return null;
      if (loadingPostDetailIdsRef.current.has(postId)) return null;
      const mediaRecoveryGeneration = mediaRecoveryGenerationRef.current.get(postId) ?? 0;

      const cached = usePostAnalyticsStore
        .getState()
        .getPostDetail({ integrationAccountId, postId });
      if (cached) {
        loadedPostDetailIdsRef.current.add(postId);
        return cached;
      }
      if (loadedPostDetailIdsRef.current.has(postId)) return null;

      const fetchDetail = async (forceRefresh: boolean) => {
        const data = await fetchOrganicAnalytics({
          brandId,
          integrationAccountId,
          platform,
          range: { preset: 'last_30d' },
          scope: 'posts',
          selectedPostId: postId,
          forceRefresh,
        });
        return (data.posts ?? []).find((post) => post.id === postId) ?? null;
      };

      loadingPostDetailIdsRef.current.add(postId);
      setLoadingPostId(postId);
      try {
        let detailedPost = await fetchDetail(false);
        if (detailedPost && isAllZeroPost(detailedPost)) {
          const refreshed = await fetchDetail(true);
          if (refreshed) detailedPost = refreshed;
        }
        if (detailedPost) {
          loadedPostDetailIdsRef.current.add(postId);
          // If a media-error recovery started while this ordinary cached request
          // was in flight, do not let its stale response overwrite the forced one.
          if ((mediaRecoveryGenerationRef.current.get(postId) ?? 0) === mediaRecoveryGeneration) {
            setPostDetailInStore({ integrationAccountId, post: detailedPost });
          }
        }
        return detailedPost;
      } catch (error) {
        console.error('[useOrganicPostDetail] Failed to load post detail', error);
        return null;
      } finally {
        loadingPostDetailIdsRef.current.delete(postId);
        setLoadingPostId((current) => (current === postId ? null : current));
      }
    },
    [brandId, platform, integrationAccountId, setPostDetailInStore],
  );

  const recoverPostMedia = React.useCallback(
    async (postId: string): Promise<OrganicPost | null> => {
      if (!integrationAccountId || postId.length === 0) return null;

      const current = () =>
        usePostAnalyticsStore.getState().getPostDetail({ integrationAccountId, postId }) ?? null;
      if (recoveredMediaPostIdsRef.current.has(postId)) return current();

      // Claim the single recovery attempt before yielding so duplicate React
      // error events and concurrent gallery/detail renderers collapse to one fetch.
      recoveredMediaPostIdsRef.current.add(postId);
      const recoveryGeneration = (mediaRecoveryGenerationRef.current.get(postId) ?? 0) + 1;
      mediaRecoveryGenerationRef.current.set(postId, recoveryGeneration);
      setLoadingPostId(postId);
      try {
        const data = await fetchOrganicAnalytics({
          brandId,
          integrationAccountId,
          platform,
          range: { preset: 'last_30d' },
          scope: 'posts',
          selectedPostId: postId,
          forceRefresh: true,
        });
        const refreshedPost = (data.posts ?? []).find((post) => post.id === postId) ?? null;
        if (refreshedPost) {
          loadedPostDetailIdsRef.current.add(postId);
          setPostDetailInStore({ integrationAccountId, post: refreshedPost });
        }
        return refreshedPost;
      } catch (error) {
        console.error('[useOrganicPostDetail] Failed to recover post media', error);
        return null;
      } finally {
        mediaRecoveryGenerationRef.current.set(postId, recoveryGeneration + 1);
        setLoadingPostId((currentPostId) => (currentPostId === postId ? null : currentPostId));
      }
    },
    [brandId, platform, integrationAccountId, setPostDetailInStore],
  );

  const resetPostDetails = React.useCallback(() => {
    loadedPostDetailIdsRef.current.clear();
    loadingPostDetailIdsRef.current.clear();
    recoveredMediaPostIdsRef.current.clear();
    mediaRecoveryGenerationRef.current.clear();
    usePostAnalyticsStore.getState().clearPostDetails();
    setLoadingPostId(null);
  }, []);

  return {
    requestPostDetail,
    recoverPostMedia,
    loadingPostId,
    postDetailsById,
    resetPostDetails,
  };
}
