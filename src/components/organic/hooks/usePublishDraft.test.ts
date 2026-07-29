import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { act, renderHook, waitFor } from '@testing-library/react';

import { createCalendarStoreStub } from '@/lib/organic/testing/calendarStoreStub';

const showMock = vi.fn();
const updateDraftMock = vi.fn();

vi.mock('@/lib/auth/getBrowserAccessToken', () => ({
  getBrowserAccessToken: async () => 'test-token',
}));

vi.mock('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: showMock }),
}));

// mock.module/vi.mock is process-wide: the shared stub answers keys this file does not
// name with a no-op, so sibling specs' hooks never receive `undefined` for a selector.
vi.mock('@/lib/organic/store', () =>
  createCalendarStoreStub({
    updateDraft: updateDraftMock,
    accountContext: {
      accountIds: {
        instagram: '17841400008460056',
        linkedin: 'urn:li:organization:2414183',
      },
      brandId: '32841a24-9e31-480c-8a3a-7ebc3cde0569',
    },
  }),
);

import { usePublishDraft } from './usePublishDraft';

const API_BASE = 'https://api.trycontinuum.ai';

function sseStream(frames: Array<{ event: string; data: unknown }>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const { event, data } of frames) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }
      controller.close();
    },
  });
}

const draft = {
  id: 'placement-1',
  backendDraftId: 'draft-1',
  platforms: ['instagram'],
  format: 'Post',
  captionPreview: 'Hello world',
  hashtags: { high: [], medium: [], low: [] },
  publishingAssets: [
    { role: 'primary', kind: 'image', storageUrl: 'https://cdn.example/image.jpg' },
  ],
} as never;

describe('usePublishDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_API_URL = API_BASE;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Regression guard: these routes exist only on the Fastify backend and next.config.ts has
  // no rewrite for /api/organic/*. A relative fetch here 404s on Vercel, which meant the
  // planner's Publish button never worked in production.
  it('publishes against the absolute backend origin, not the Next.js origin', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      body: sseStream([
        { event: 'started', data: { type: 'started', platform: 'instagram', format: 'POST' } },
        {
          event: 'published',
          data: {
            type: 'published',
            platform: 'instagram',
            postId: 'post-1',
            format: 'POST',
            accountId: '17841400008460056',
          },
        },
      ]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePublishDraft());
    await act(async () => {
      await result.current.publish(draft);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toBe(`${API_BASE}/api/organic/calendar/drafts/draft-1/publish`);
    expect(calledUrl.startsWith('/api/')).toBe(false);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
  });

  it('sends the draft platform and its matching account id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true, body: sseStream([]) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePublishDraft());
    await act(async () => {
      await result.current.publish({ ...draft, platforms: ['linkedin'] } as never);
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.platform).toBe('linkedin');
    expect(body.accountId).toBe('urn:li:organization:2414183');
    expect(body.igAccountId).toBeUndefined();
  });

  // platform_post_id is what the backend actually persists; instagram_post_id is the legacy
  // mirror it dual-writes for Instagram ONLY. Stamping the mirror on every platform put a
  // Facebook post id behind the "View on Instagram" instagram.com/p/ permalink.
  const publishedFrames = (platform: string, postId: string) => [
    { event: 'started', data: { type: 'started', platform, format: 'POST' } },
    {
      event: 'published',
      data: { type: 'published', platform, postId, format: 'POST', accountId: 'acct-1' },
    },
  ];

  it('mirrors the post id into instagram_post_id for an Instagram publish', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        body: sseStream(publishedFrames('instagram', 'ig-post-1')),
      }),
    );

    const { result } = renderHook(() => usePublishDraft());
    await act(async () => {
      await result.current.publish(draft);
    });

    await waitFor(() => expect(updateDraftMock).toHaveBeenCalled());
    const patch = updateDraftMock.mock.calls[0][1]({});
    expect(patch.platform_post_id).toBe('ig-post-1');
    expect(patch.instagram_post_id).toBe('ig-post-1');
  });

  it('never writes instagram_post_id for a Facebook publish', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        body: sseStream(publishedFrames('facebook', 'fb-post-1')),
      }),
    );

    const { result } = renderHook(() => usePublishDraft());
    await act(async () => {
      await result.current.publish({ ...draft, platforms: ['facebook'] } as never);
    });

    await waitFor(() => expect(updateDraftMock).toHaveBeenCalled());
    const patch = updateDraftMock.mock.calls[0][1]({});
    expect(patch.platform_post_id).toBe('fb-post-1');
    expect(patch.status).toBe('published');
    // A Facebook id here renders a dead instagram.com/p/<fb-id> link.
    expect(patch.instagram_post_id).toBeUndefined();
  });

  it('names the publishing platform in the success toast', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        body: sseStream([
          {
            event: 'published',
            data: {
              type: 'published',
              platform: 'linkedin',
              postId: 'urn:li:share:7301',
              format: 'POST',
              accountId: 'urn:li:organization:2414183',
            },
          },
        ]),
      }),
    );

    const { result } = renderHook(() => usePublishDraft());
    await act(async () => {
      await result.current.publish(draft);
    });

    await waitFor(() => expect(showMock).toHaveBeenCalled());
    expect(showMock.mock.calls[0][0].description).toContain('LinkedIn');
  });

  // THE regression lock. On 2026-07-14 one click on Publish put three identical posts on
  // Instagram. The backend stripped CORS from the hijacked publish stream, so the browser
  // rejected a response the server had already acted on; `fetch` threw "Failed to fetch";
  // this hook classified that as retryable and replayed the POST twice on a 2s/4s backoff.
  // Every replay published for real.
  //
  // A publish is not idempotent, and a network error tells us NOTHING about whether the post
  // went out — the request may have succeeded and only the response been lost. So: never retry
  // it automatically. Ever.
  it('does NOT retry a failed publish — a network error may mean the post already went out', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePublishDraft());
    await act(async () => {
      await result.current.publish(draft);
    });

    // Wait past the old backoff schedule (2s + 4s). If a timer were still armed, the second and
    // third publishes would land in this window — as they did on the real account.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 7000));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.isPublishing).toBe(false);
    expect(result.current.error).toBeTruthy();
  }, 15000);

  it('retries only when the user explicitly asks', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePublishDraft());
    await act(async () => {
      await result.current.publish(draft);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.retryPublish();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('registers an unpersisted draft against the backend origin first', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'new-draft' }) })
      .mockResolvedValueOnce({ status: 200, ok: true, body: sseStream([]) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePublishDraft());
    await act(async () => {
      await result.current.publish({ ...draft, backendDraftId: undefined } as never);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/api/organic/calendar/drafts`);
    expect(fetchMock.mock.calls[1][0]).toBe(
      `${API_BASE}/api/organic/calendar/drafts/new-draft/publish`,
    );
  });
});
