import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { act, renderHook, waitFor } from '@testing-library/react';

const showMock = vi.fn();
const updateDraftMock = vi.fn();

vi.mock('@/lib/auth/getBrowserAccessToken', () => ({
  getBrowserAccessToken: async () => 'test-token',
}));

vi.mock('@/components/ui/ToastProvider', () => ({
  useToast: () => ({ show: showMock }),
}));

vi.mock('@/lib/organic/store', () => ({
  useCalendarStore: (selector: (state: unknown) => unknown) =>
    selector({
      updateDraft: updateDraftMock,
      accountContext: {
        accountIds: {
          instagram: '17841400008460056',
          linkedin: 'urn:li:organization:2414183',
        },
        brandId: '32841a24-9e31-480c-8a3a-7ebc3cde0569',
      },
    }),
}));

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
