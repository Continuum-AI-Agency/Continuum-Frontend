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

// The confirmation is a real await inside the hook, so the spec drives its answer rather
// than the dialog's DOM. `confirmationRequests` proves the gate is reached (or not).
type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  details?: unknown;
  confirmDisabled?: boolean;
};
let confirmationAnswer = true;
let confirmationRequests: ConfirmationOptions[] = [];

vi.mock('@/components/organic/primitives/DestructiveConfirmation', () => ({
  useDestructiveConfirmation: () => ({
    requestDestructiveConfirmation: (options: ConfirmationOptions) => {
      confirmationRequests.push(options);
      return Promise.resolve(confirmationAnswer);
    },
  }),
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

const INTENT_HASH = 'sha256:test-intent-hash';

/**
 * Publishing is now two requests: /publish-intent tells the user what will actually be sent and
 * returns the hash their confirmation is bound to, then /publish carries that hash. These helpers
 * serve the preflight so each test only has to describe the publish response it cares about.
 */
function intentResponse(overrides: Record<string, unknown> = {}) {
  return {
    status: 200,
    ok: true,
    json: async () => ({
      publishable: true,
      blockers: [],
      platform: 'instagram',
      format: 'POST',
      account: { id: 'acct-1', source: 'slot_data' },
      caption: { present: true, length: 11, preview: 'Hello world' },
      media: { count: 1, required: 1, source: 'publishing_assets' },
      intent_hash: INTENT_HASH,
      expected_updated_at: null,
      ...overrides,
    }),
  };
}

function routedFetch(publishResponse: () => unknown, intent: () => unknown = intentResponse) {
  return vi.fn((url: string) =>
    Promise.resolve(String(url).includes('/publish-intent') ? intent() : publishResponse()),
  );
}

/** The publish request itself, skipping the intent preflight. */
function publishCall(fetchMock: { mock: { calls: unknown[][] } }) {
  return fetchMock.mock.calls.find(([url]) => String(url).endsWith('/publish')) as
    | [string, { headers: Record<string, string>; body: string }]
    | undefined;
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
    confirmationAnswer = true;
    confirmationRequests = [];
    process.env.NEXT_PUBLIC_API_URL = API_BASE;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Regression guard: these routes exist only on the Fastify backend and next.config.ts has
  // no rewrite for /api/organic/*. A relative fetch here 404s on Vercel, which meant the
  // planner's Publish button never worked in production.
  it('publishes against the absolute backend origin, not the Next.js origin', async () => {
    const fetchMock = routedFetch(() => ({
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
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePublishDraft());
    await act(async () => {
      await result.current.publish(draft);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const call = publishCall(fetchMock);
    expect(call).toBeDefined();
    const calledUrl = call?.[0] as string;
    expect(calledUrl).toBe(`${API_BASE}/api/organic/calendar/drafts/draft-1/publish`);
    expect(calledUrl.startsWith('/api/')).toBe(false);
    expect(call?.[1].headers.Authorization).toBe('Bearer test-token');
    // The confirmation the user gave is carried to the publish, bound to what they were shown.
    expect(JSON.parse(call?.[1].body ?? '{}').confirmationHash).toBe(INTENT_HASH);
  });

  it('sends the draft platform and its matching account id', async () => {
    const fetchMock = routedFetch(() => ({ status: 200, ok: true, body: sseStream([]) }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePublishDraft());
    await act(async () => {
      await result.current.publish({ ...draft, platforms: ['linkedin'] } as never);
    });

    const body = JSON.parse(publishCall(fetchMock)?.[1].body ?? '{}');
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
      routedFetch(() => ({
        status: 200,
        ok: true,
        body: sseStream(publishedFrames('instagram', 'ig-post-1')),
      })),
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
      routedFetch(() => ({
        status: 200,
        ok: true,
        body: sseStream(publishedFrames('facebook', 'fb-post-1')),
      })),
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
      routedFetch(() => ({
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
      })),
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
    // The preflight succeeds and the PUBLISH is what fails: that is the shape of the real
    // incident, where the server had already published and only the response was lost.
    const fetchMock = routedFetch(() => Promise.reject(new TypeError('Failed to fetch')));
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

    // Exactly one PUBLISH. The preflight is a separate, idempotent GET-shaped read.
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/publish'))).toHaveLength(
      1,
    );
    expect(result.current.isPublishing).toBe(false);
    expect(result.current.error).toBeTruthy();
  }, 15000);

  it('retries only when the user explicitly asks', async () => {
    const fetchMock = routedFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('fetch', fetchMock);
    const publishCalls = () =>
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/publish')).length;

    const { result } = renderHook(() => usePublishDraft());
    await act(async () => {
      await result.current.publish(draft);
    });
    expect(publishCalls()).toBe(1);

    await act(async () => {
      result.current.retryPublish();
    });

    await waitFor(() => expect(publishCalls()).toBe(2));
  });

  // BUG M-16: three of the four publish surfaces called this hook with no readiness check
  // and no confirmation, so "Publish to Instagram" was live on a draft with NEEDS SETUP and
  // no media. The invariant now lives here, ahead of every network call.
  describe('publish gate', () => {
    const notReadyDraft = { ...draft, captionPreview: '', publishingAssets: [] } as never;

    it('makes NO network call for a draft that is not ready', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => usePublishDraft());
      await act(async () => {
        await result.current.publish(notReadyDraft);
      });

      expect(fetchMock).not.toHaveBeenCalled();
      // It does not even reach the confirmation — there is nothing to confirm.
      expect(confirmationRequests).toHaveLength(0);
      expect(result.current.error).toContain('caption');
      expect(showMock.mock.calls[0][0].variant).toBe('error');
    });

    it('does not publish when the confirmation is declined', async () => {
      confirmationAnswer = false;
      const fetchMock = routedFetch(() => ({ status: 200, ok: true, body: sseStream([]) }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => usePublishDraft());
      await act(async () => {
        await result.current.publish(draft);
      });

      expect(confirmationRequests).toHaveLength(1);
      // The preflight ran (that is how the dialog got its caption), but nothing was published.
      expect(publishCall(fetchMock)).toBeUndefined();
      expect(result.current.isPublishing).toBe(false);
    });

    it('publishes exactly once when the confirmation is accepted', async () => {
      const fetchMock = routedFetch(() => ({ status: 200, ok: true, body: sseStream([]) }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => usePublishDraft());
      await act(async () => {
        await result.current.publish(draft);
      });

      expect(confirmationRequests).toHaveLength(1);
      expect(confirmationRequests[0].title).toContain('Instagram');
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/publish')),
      ).toHaveLength(1);
    });

    // The dialog must show the real caption and account, not a generic warning. That is the whole
    // point of the hash: the user approves specific content, and the backend refuses anything else.
    it('shows the resolved caption and account in the confirmation', async () => {
      const fetchMock = routedFetch(() => ({ status: 200, ok: true, body: sseStream([]) }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => usePublishDraft());
      await act(async () => {
        await result.current.publish(draft);
      });

      expect(confirmationRequests[0].details).toBeDefined();
    });

    // An unpublishable draft must not offer a usable confirm button, even if the client-side
    // readiness check passed — the server is the authority on publishability.
    it('disables the confirm button when the server reports the post is not publishable', async () => {
      const fetchMock = routedFetch(
        () => ({ status: 200, ok: true, body: sseStream([]) }),
        () =>
          intentResponse({
            publishable: false,
            intent_hash: null,
            blockers: [{ reason: 'media_missing', message: 'No postable media artifact' }],
          }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => usePublishDraft());
      await act(async () => {
        await result.current.publish(draft);
      });

      expect(confirmationRequests[0].confirmDisabled).toBe(true);
    });
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
