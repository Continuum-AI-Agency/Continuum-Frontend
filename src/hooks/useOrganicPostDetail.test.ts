import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { usePostAnalyticsStore } from '@/lib/organic/post-analytics-store';
import type { OrganicPost } from '@/lib/schemas/organicMetrics';

const fetchOrganicAnalytics = mock(async (_input: { forceRefresh?: boolean }) => ({
  posts: [
    {
      id: 'post-1',
      mediaUrl: 'https://cdn.example/fresh.jpg',
      metrics: { reach: 12 },
    } as OrganicPost,
  ],
}));

mock.module('@/lib/api/organicAnalytics.client', () => ({ fetchOrganicAnalytics }));

const { useOrganicPostDetail } = await import('./useOrganicPostDetail');

describe('useOrganicPostDetail media recovery', () => {
  beforeEach(() => {
    fetchOrganicAnalytics.mockClear();
    usePostAnalyticsStore.getState().clearPostDetails();
    usePostAnalyticsStore.getState().setPostDetail({
      integrationAccountId: 'account-1',
      post: {
        id: 'post-1',
        mediaUrl: 'https://cdn.example/expired.jpg',
        metrics: { reach: 12 },
      } as OrganicPost,
    });
  });

  afterEach(() => cleanup());

  test('force-refreshes a cached post once when repeated image errors request recovery', async () => {
    const { result } = renderHook(() =>
      useOrganicPostDetail({
        brandId: 'brand-1',
        platform: 'instagram',
        integrationAccountId: 'account-1',
      }),
    );

    await act(async () => {
      await Promise.all([
        result.current.recoverPostMedia('post-1'),
        result.current.recoverPostMedia('post-1'),
      ]);
    });

    expect(fetchOrganicAnalytics).toHaveBeenCalledTimes(1);
    expect(fetchOrganicAnalytics.mock.calls[0]?.[0]).toMatchObject({
      selectedPostId: 'post-1',
      forceRefresh: true,
    });
    await waitFor(() =>
      expect(result.current.postDetailsById['post-1']?.mediaUrl).toBe(
        'https://cdn.example/fresh.jpg',
      ),
    );
  });

  test('does not let an overlapping ordinary request overwrite recovered media', async () => {
    usePostAnalyticsStore.getState().clearPostDetails();
    let resolveRecovery: ((value: { posts: OrganicPost[] }) => void) | undefined;
    let resolveOrdinary: ((value: { posts: OrganicPost[] }) => void) | undefined;
    fetchOrganicAnalytics.mockImplementation(
      (input) =>
        new Promise((resolve) => {
          if (input.forceRefresh) resolveRecovery = resolve;
          else resolveOrdinary = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useOrganicPostDetail({
        brandId: 'brand-1',
        platform: 'instagram',
        integrationAccountId: 'account-1',
      }),
    );

    let recovery: Promise<OrganicPost | null> | undefined;
    let ordinary: Promise<OrganicPost | null> | undefined;
    act(() => {
      recovery = result.current.recoverPostMedia('post-1');
      ordinary = result.current.requestPostDetail('post-1');
    });

    await act(async () => {
      resolveRecovery?.({
        posts: [
          {
            id: 'post-1',
            mediaUrl: 'https://cdn.example/fresh.jpg',
            metrics: { reach: 12 },
          } as OrganicPost,
        ],
      });
      await recovery;
      resolveOrdinary?.({
        posts: [
          {
            id: 'post-1',
            mediaUrl: 'https://cdn.example/expired.jpg',
            metrics: { reach: 12 },
          } as OrganicPost,
        ],
      });
      await ordinary;
    });

    expect(
      usePostAnalyticsStore.getState().getPostDetail({
        integrationAccountId: 'account-1',
        postId: 'post-1',
      })?.mediaUrl,
    ).toBe('https://cdn.example/fresh.jpg');
  });
});
