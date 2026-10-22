import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type * as React from 'react';
import type { OrganicCalendarPostedContent } from '@/components/organic/primitives/types';

const showMock = vi.fn();

vi.mock('@/lib/auth/getBrowserAccessToken', () => ({
  getBrowserAccessToken: async () => 'test-token',
}));

vi.mock('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: showMock }),
}));

// No DestructiveConfirmationProvider is mounted, so every confirmation answers yes.
import { canDeletePublishedPost, useDeletePublishedPost } from './useDeletePublishedPost';

const API_BASE = 'https://api.trycontinuum.ai';

const fbPost: OrganicCalendarPostedContent = {
  id: 'published:facebook:123_456',
  source: 'published_posts',
  platform: 'facebook',
  externalPostId: '123_456',
  timestamp: '2026-10-21T15:00:00Z',
  dayId: '2026-10-21',
  timeLabel: '9:00 AM',
  title: 'Launch',
};

function jsonResponse(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

function renderDelete(onDeleted: () => void) {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useDeletePublishedPost(onDeleted), { wrapper });
  return { result, invalidate };
}

describe('canDeletePublishedPost', () => {
  it('offers delete only on posts Continuum published to Facebook', () => {
    expect(canDeletePublishedPost(fbPost)).toBe(true);
    expect(canDeletePublishedPost({ ...fbPost, platform: 'instagram' })).toBe(false);
    expect(canDeletePublishedPost({ ...fbPost, source: 'external' })).toBe(false);
    expect(canDeletePublishedPost({ ...fbPost, externalPostId: undefined })).toBe(false);
  });
});

describe('useDeletePublishedPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_API_URL = API_BASE;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('DELETEs the post on the backend, then refreshes the planner', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, { deleted: true }));
    vi.stubGlobal('fetch', fetchMock);
    const onDeleted = vi.fn();
    const { result, invalidate } = renderDelete(onDeleted);

    await act(async () => {
      await result.current.deletePost(fbPost);
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE}/api/organic/published-posts/123_456`);
    expect(init.method).toBe('DELETE');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['organic-calendar-posts'] });
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(showMock.mock.calls[0][0]).toMatchObject({
      title: 'Deleted from Facebook',
      variant: 'success',
    });
  });

  it('keeps the post listed when Facebook refuses, and says why', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(502, { error: 'token_expired', message: '(#200) Permissions error' }),
        ),
    );
    const onDeleted = vi.fn();
    const { result, invalidate } = renderDelete(onDeleted);

    await act(async () => {
      await result.current.deletePost(fbPost);
    });

    expect(onDeleted).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(showMock.mock.calls[0][0]).toMatchObject({
      title: "Couldn't delete from Facebook",
      description: '(#200) Permissions error',
      variant: 'error',
    });
  });

  it('reports a post Facebook deleted as deleted even when our records lag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        jsonResponse(500, {
          error: 'deleted_records_stale',
          message: 'Deleted from Facebook, but Continuum could not update the planner',
        }),
      ),
    );
    const onDeleted = vi.fn();
    const { result } = renderDelete(onDeleted);

    await act(async () => {
      await result.current.deletePost(fbPost);
    });

    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(showMock.mock.calls[0][0].title).toBe('Deleted from Facebook');
  });
});
