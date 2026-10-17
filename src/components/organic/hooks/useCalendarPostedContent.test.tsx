import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { CalendarPostAccountsByPlatform } from '@/lib/organic/calendar-posts';
import { calendarPostsQueryKey, useCalendarPostedContent } from './useCalendarPostedContent';

const ACCOUNTS: CalendarPostAccountsByPlatform = {
  instagram: [{ integrationAccountId: 'ig-1' }],
  facebook: [],
  tiktok: [],
  youtube: [],
  linkedin: [],
};

function post(id: string) {
  return {
    id,
    source: 'published_posts' as const,
    platform: 'instagram' as const,
    timestamp: '2026-08-03T15:00:00Z',
    dayId: '2026-08-03',
    timeLabel: '9:00 AM',
    title: `Post ${id}`,
  };
}

function okResponse(ids: string[]) {
  return new Response(
    JSON.stringify({ posts: ids.map(post), databaseCount: ids.length, externalFetched: false }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

const originalFetch = globalThis.fetch;
let fetchMock: ReturnType<
  typeof mock<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>
>;

// The route answers the database rows, plus the platforms' own posts when asked for them.
function respondByScope(init?: RequestInit): Promise<Response> {
  const body = JSON.parse(String(init?.body)) as { includeExternal: boolean };
  return Promise.resolve(okResponse(body.includeExternal ? ['a', 'tiktok-b'] : ['a']));
}

function deferredResponse() {
  let resolve: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function renderPostedContent({ brandProfileId }: { brandProfileId?: string } = { brandProfileId: 'brand-1' }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const view = renderHook(
    () =>
      useCalendarPostedContent({
        brandProfileId,
        viewMode: 'week',
        weekStart: new Date(2026, 7, 2),
        monthAnchorDate: new Date(2026, 7, 1),
        accountsByPlatform: ACCOUNTS,
      }),
    { wrapper },
  );
  return { ...view, queryClient };
}

function requestBody(call: number) {
  const init = fetchMock.mock.calls[call]?.[1];
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

const WEEK_KEY = ['brand-1', '2026-08-02', '2026-08-08', 'instagram:ig-1'] as const;

describe('calendarPostsQueryKey', () => {
  it('keys the posted content by brand, visible range, accounts and external scope', () => {
    const key = calendarPostsQueryKey(...WEEK_KEY, false);

    expect(key).toEqual([
      'organic-calendar-posts',
      'brand-1',
      '2026-08-02',
      '2026-08-08',
      'instagram:ig-1',
      false,
    ]);
    expect(
      calendarPostsQueryKey('brand-2', '2026-08-02', '2026-08-08', 'instagram:ig-1', false),
    ).not.toEqual(key);
    expect(
      calendarPostsQueryKey('brand-1', '2026-08-09', '2026-08-15', 'instagram:ig-1', false),
    ).not.toEqual(key);
    expect(calendarPostsQueryKey('brand-1', '2026-08-02', '2026-08-08', '', false)).not.toEqual(
      key,
    );
    expect(calendarPostsQueryKey(...WEEK_KEY, true)).not.toEqual(key);
  });
});

describe('useCalendarPostedContent', () => {
  beforeEach(() => {
    window.localStorage.clear();
    fetchMock = mock(() => Promise.resolve(okResponse(['a'])));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('loads the visible week without external posts and caches it under the query key', async () => {
    const { result, queryClient } = renderPostedContent();

    await waitFor(() => expect(result.current.posts.map((p) => p.id)).toEqual(['a']));

    expect(requestBody(0)).toMatchObject({
      brandId: 'brand-1',
      start: '2026-08-02',
      end: '2026-08-08',
      includeExternal: false,
    });
    expect(queryClient.getQueryData(calendarPostsQueryKey(...WEEK_KEY, false))).toEqual(
      result.current.posts,
    );
  });

  it('forces an external fetch and serves it from the external query', async () => {
    fetchMock.mockImplementation((_input, init) => respondByScope(init));
    const { result, queryClient } = renderPostedContent();
    await waitFor(() => expect(result.current.posts).toHaveLength(1));

    await act(() => result.current.fetchExternalPosts());

    expect(result.current.posts.map((p) => p.id)).toEqual(['a', 'tiktok-b']);
    expect(requestBody(1)).toMatchObject({ includeExternal: true, forceRefreshExternal: true });
    expect(queryClient.getQueryData(calendarPostsQueryKey(...WEEK_KEY, true))).toEqual(
      result.current.posts,
    );
    expect(result.current.isFetchingExternal).toBe(false);
    // The data was in place before the key switched, so no second external request ran.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the external posts through a retry and a refetch of every active query', async () => {
    fetchMock.mockImplementation((_input, init) => respondByScope(init));
    const { result, queryClient } = renderPostedContent();
    await waitFor(() => expect(result.current.posts).toHaveLength(1));
    await act(() => result.current.fetchExternalPosts());

    act(() => result.current.retry());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    // Reconnect and window focus refetch the active queries the same way.
    await act(() => queryClient.refetchQueries({ type: 'active' }));

    expect(fetchMock).toHaveBeenCalledTimes(4);
    // A background refetch reads the platforms' cached answers rather than forcing them.
    expect(requestBody(2)).toMatchObject({ includeExternal: true, forceRefreshExternal: false });
    expect(requestBody(3)).toMatchObject({ includeExternal: true, forceRefreshExternal: false });
    expect(result.current.posts.map((p) => p.id)).toEqual(['a', 'tiktok-b']);
  });

  it('cancels an older refetch so it cannot overwrite the forced external answer', async () => {
    fetchMock.mockImplementation((_input, init) => respondByScope(init));
    const { result, queryClient } = renderPostedContent();
    await waitFor(() => expect(result.current.posts).toHaveLength(1));
    await act(() => result.current.fetchExternalPosts());

    const olderRefetch = deferredResponse();
    const forcedFetch = deferredResponse();
    fetchMock
      .mockImplementationOnce(() => olderRefetch.promise)
      .mockImplementationOnce(() => forcedFetch.promise);

    act(() => result.current.retry());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    let forced: Promise<void> = Promise.resolve();
    act(() => {
      forced = result.current.fetchExternalPosts();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));

    await act(async () => {
      forcedFetch.resolve(okResponse(['a', 'tiktok-fresh']));
      await forced;
    });
    await act(async () => {
      olderRefetch.resolve(okResponse(['a', 'tiktok-stale']));
      await olderRefetch.promise;
    });
    // Settled means the older response has parsed and either landed or been discarded.
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));

    expect(result.current.posts.map((p) => p.id)).toEqual(['a', 'tiktok-fresh']);
  });

  it('reports loading only until the first answer, not during a background refetch', async () => {
    const { result } = renderPostedContent();
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.posts).toHaveLength(1));
    expect(result.current.isLoading).toBe(false);

    const backgroundRefetch = deferredResponse();
    fetchMock.mockImplementationOnce(() => backgroundRefetch.promise);
    act(() => result.current.retry());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(result.current.isLoading).toBe(false);
    await act(async () => {
      backgroundRefetch.resolve(okResponse(['a']));
      await backgroundRefetch.promise;
    });
  });

  it('never reports loading while there is no brand to load for', () => {
    const { result } = renderPostedContent({});

    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a failed load and recovers on retry', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('nope', { status: 502 })));
    const { result } = renderPostedContent();

    await waitFor(() => expect(result.current.error).toBe('Unable to load posted content.'));

    fetchMock.mockImplementation(() => Promise.resolve(okResponse(['a'])));
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.posts).toHaveLength(1));
    expect(result.current.error).toBeNull();
  });
});
