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
  details?: { props: { intents: Array<{ platform: string; account: { id: string } }> } };
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
// The toolbar default here deliberately differs from every draft's stamp: publish must
// never send it (A1).
vi.mock('@/lib/organic/store', () =>
  createCalendarStoreStub({
    updateDraft: updateDraftMock,
    accountContext: {
      accountIds: {
        instagram: 'toolbar-default-ig',
        linkedin: 'toolbar-default-li',
      },
      brandId: '32841a24-9e31-480c-8a3a-7ebc3cde0569',
    },
  }),
);

import { usePublishDraft } from './usePublishDraft';

const API_BASE = 'https://api.trycontinuum.ai';
const BULK_URL = `${API_BASE}/api/organic/calendar/drafts/bulk-publish`;

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

const ACCOUNTS: Record<string, { id: string; handle: string }> = {
  instagram: { id: 'acct-ig', handle: 'acme_a' },
  facebook: { id: 'acct-fb', handle: 'acme_fb' },
  linkedin: { id: 'acct-li', handle: 'acme_li' },
};

/** Each member row's /publish-intent: its own account, caption and hash. */
function intentFor(rowId: string, overrides: Record<string, unknown> = {}) {
  const platform = rowId.replace('draft-', '') as keyof typeof ACCOUNTS;
  const account = ACCOUNTS[platform] ?? ACCOUNTS.instagram;
  return {
    publishable: true,
    blockers: [],
    warnings: [],
    platform: ACCOUNTS[platform] ? platform : 'instagram',
    format: 'POST',
    account: { ...account, source: 'draft_column', displayName: null, avatarUrl: null },
    caption: { present: true, length: 11, preview: 'Hello world' },
    media: { count: 1, required: 1, source: 'publishing_assets' },
    intent_hash: `sha256:${rowId}`,
    ...overrides,
  };
}

function routedFetch(
  publishResponse: () => unknown,
  intent: (rowId: string) => unknown = (rowId) => intentFor(rowId),
) {
  return vi.fn((url: string) => {
    const match = /\/drafts\/([^/]+)\/publish-intent$/.exec(String(url));
    return Promise.resolve(
      match ? { ok: true, status: 200, json: async () => intent(match[1]) } : publishResponse(),
    );
  });
}

function bulkCalls(fetchMock: { mock: { calls: unknown[][] } }) {
  return fetchMock.mock.calls.filter(([url]) => url === BULK_URL) as Array<
    [string, { headers: Record<string, string>; body: string }]
  >;
}

function bulkItems(fetchMock: { mock: { calls: unknown[][] } }) {
  const [call] = bulkCalls(fetchMock);
  return (JSON.parse(call?.[1].body ?? '{"items":[]}') as { items: Record<string, unknown>[] })
    .items;
}

const published = (id: string, platform: string, postId: string) => ({
  event: 'published',
  data: { id, type: 'published', platform, postId, format: 'POST', accountId: 'acct' },
});

function complete(results: Array<Record<string, unknown>>) {
  const succeeded = results.filter((result) => result.status === 'published').length;
  return {
    event: 'complete',
    data: {
      type: 'complete',
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
      groupStatus:
        succeeded === results.length ? 'published' : succeeded === 0 ? 'failed' : 'partial',
      results,
    },
  };
}

const ok = (id: string, platform: string, postId: string) => ({
  id,
  status: 'published',
  postId,
  platform,
  format: 'POST',
  accountId: 'acct',
});

const streamOf = (frames: Array<{ event: string; data: unknown }>) => () => ({
  status: 200,
  ok: true,
  body: sseStream(frames),
});

const base = {
  format: 'Post',
  captionPreview: 'Hello world',
  status: 'draft',
  hashtags: { high: [], medium: [], low: [] },
  publishingAssets: [
    { role: 'primary', kind: 'image', storageUrl: 'https://cdn.example/image.jpg' },
  ],
};

// A lone draft is a group of one: its own row and nothing else.
const draft = {
  ...base,
  id: 'placement-1',
  backendDraftId: 'draft-instagram',
  platforms: ['instagram'],
  targetAccountId: 'acct-ig',
  groupMembers: [
    {
      backendDraftId: 'draft-instagram',
      platform: 'instagram',
      status: 'draft',
      accountId: 'acct-ig',
    },
  ],
} as never;

const member = (platform: string, status = 'draft') => ({
  backendDraftId: `draft-${platform}`,
  platform,
  status,
  accountId: ACCOUNTS[platform].id,
  draft: {
    ...base,
    status,
    id: `placement-1::${platform}`,
    backendDraftId: `draft-${platform}`,
    platforms: [platform],
    targetAccountId: ACCOUNTS[platform].id,
  },
});

const group = (statuses: Record<string, string> = {}) =>
  ({
    ...base,
    id: 'placement-1',
    backendDraftId: 'draft-instagram',
    platforms: ['instagram', 'facebook', 'linkedin'],
    targetAccountId: 'acct-ig',
    groupId: 'group-1',
    groupMembers: [
      {
        backendDraftId: 'draft-instagram',
        platform: 'instagram',
        status: 'draft',
        accountId: 'acct-ig',
      },
      member('facebook', statuses.facebook),
      member('linkedin', statuses.linkedin),
    ],
  }) as never;

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
  // no rewrite for /api/organic/*. A relative fetch here 404s on Vercel.
  it('publishes against the absolute backend origin with the confirmation hash', async () => {
    const fetchMock = routedFetch(
      streamOf([
        published('draft-instagram', 'instagram', 'post-1'),
        complete([ok('draft-instagram', 'instagram', 'post-1')]),
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePublishDraft());
    await act(async () => {
      await result.current.publish(draft);
    });

    const [call] = bulkCalls(fetchMock);
    expect(call).toBeDefined();
    expect(call[1].headers.Authorization).toBe('Bearer test-token');
    expect(bulkItems(fetchMock)).toEqual([
      expect.objectContaining({
        id: 'draft-instagram',
        platform: 'instagram',
        confirmationHash: 'sha256:draft-instagram',
      }),
    ]);
  });

  // A1: the toolbar switcher's id used to ride on the publish body and override the draft's
  // own stamp, while the confirm showed the stamp. The body carries no account at all.
  it('never sends an account override, even when the toolbar default differs from the stamp', async () => {
    const fetchMock = routedFetch(streamOf([complete([])]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePublishDraft());
    await act(async () => {
      await result.current.publish(draft);
    });

    const [item] = bulkItems(fetchMock);
    expect(item.accountId).toBeUndefined();
    expect(item.igAccountId).toBeUndefined();
    expect(JSON.stringify(item)).not.toContain('toolbar-default');
  });

  it('mirrors the post id into instagram_post_id for an Instagram member only', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch(
        streamOf([
          published('draft-instagram', 'instagram', 'ig-post-1'),
          published('draft-facebook', 'facebook', 'fb-post-1'),
          complete([ok('draft-instagram', 'instagram', 'ig-post-1')]),
        ]),
      ),
    );

    const { result } = renderHook(() => usePublishDraft());
    await act(async () => {
      await result.current.publish(group());
    });

    const patches = new Map(
      updateDraftMock.mock.calls.map(([id, updater]) => [id, updater({})] as const),
    );
    expect(patches.get('placement-1')).toMatchObject({
      status: 'published',
      platform_post_id: 'ig-post-1',
      instagram_post_id: 'ig-post-1',
    });
    // A Facebook id behind instagram_post_id renders a dead instagram.com/p/<fb-id> link.
    expect(patches.get('placement-1::facebook')).toEqual({
      status: 'published',
      platform_post_id: 'fb-post-1',
    });
  });

  it('names every platform and its account in the result toast', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetch(
        streamOf([
          complete([
            ok('draft-instagram', 'instagram', 'p1'),
            ok('draft-facebook', 'facebook', 'p2'),
            {
              id: 'draft-linkedin',
              status: 'failed',
              platform: 'linkedin',
              error: 'boom',
              code: 'rate_limited',
            },
          ]),
        ]),
      ),
    );

    const { result } = renderHook(() => usePublishDraft());
    await act(async () => {
      await result.current.publish(group());
    });

    const toast = showMock.mock.calls.at(-1)?.[0];
    expect(toast.title).toBe('Partly published');
    expect(toast.description).toBe(
      'Published to Instagram (@acme_a), Facebook (@acme_fb); LinkedIn (@acme_li) failed: The platform is temporarily rate-limiting requests. Wait a few minutes and try again..',
    );
    expect(result.current.error).toContain('LinkedIn (@acme_li) failed');
  });

  // A stream that ends without its summary may have published some members. "Failed" would
  // invite the click that posts them twice.
  it('reports an unknown outcome when the stream ends without its summary', async () => {
    vi.stubGlobal('fetch', routedFetch(streamOf([published('draft-instagram', 'instagram', 'p')])));

    const { result } = renderHook(() => usePublishDraft());
    await act(async () => {
      await result.current.publish(draft);
    });

    expect(showMock.mock.calls.at(-1)?.[0].title).toBe('Publishing status unknown');
  });

  // THE regression lock. On 2026-07-14 one click on Publish put three identical posts on
  // Instagram: `fetch` threw "Failed to fetch" on a response the server had already acted on,
  // and this hook replayed the POST twice on a 2s/4s backoff. Never retry automatically.
  it('does NOT retry a failed publish — a network error may mean the post already went out', async () => {
    const fetchMock = routedFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePublishDraft());
    await act(async () => {
      await result.current.publish(draft);
    });

    // Wait past the old backoff schedule (2s + 4s).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 7000));
    });

    expect(bulkCalls(fetchMock)).toHaveLength(1);
    expect(result.current.isPublishing).toBe(false);
    expect(result.current.error).toBeTruthy();
  }, 15000);

  it('retries only when the user explicitly asks', async () => {
    const fetchMock = routedFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePublishDraft());
    await act(async () => {
      await result.current.publish(draft);
    });
    expect(bulkCalls(fetchMock)).toHaveLength(1);

    await act(async () => {
      result.current.retryPublish();
    });

    await waitFor(() => expect(bulkCalls(fetchMock)).toHaveLength(2));
  });

  describe('group publish (C1)', () => {
    it('publishes a group of 3 with ONE confirm and ONE bulk-publish of 3 items', async () => {
      const fetchMock = routedFetch(streamOf([complete([])]));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => usePublishDraft());
      await act(async () => {
        await result.current.publish(group());
      });

      expect(confirmationRequests).toHaveLength(1);
      expect(confirmationRequests[0].title).toBe('Publish to 3 platforms?');
      expect(confirmationRequests[0].confirmLabel).toBe('Publish to 3 platforms');
      expect(
        confirmationRequests[0].details?.props.intents.map((intent) => [
          intent.platform,
          intent.account.id,
        ]),
      ).toEqual([
        ['instagram', 'acct-ig'],
        ['facebook', 'acct-fb'],
        ['linkedin', 'acct-li'],
      ]);
      expect(bulkCalls(fetchMock)).toHaveLength(1);
      expect(
        bulkItems(fetchMock).map((item) => [item.id, item.platform, item.confirmationHash]),
      ).toEqual([
        ['draft-instagram', 'instagram', 'sha256:draft-instagram'],
        ['draft-facebook', 'facebook', 'sha256:draft-facebook'],
        ['draft-linkedin', 'linkedin', 'sha256:draft-linkedin'],
      ]);
    });

    it('never re-posts a member that is already live', async () => {
      const fetchMock = routedFetch(streamOf([complete([])]));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => usePublishDraft());
      await act(async () => {
        await result.current.publish(group({ facebook: 'published' }));
      });

      expect(bulkItems(fetchMock).map((item) => item.id)).toEqual([
        'draft-instagram',
        'draft-linkedin',
      ]);
      expect(confirmationRequests[0].title).toBe('Publish to 2 platforms?');
    });

    it('disables the confirm when any member is not publishable', async () => {
      vi.stubGlobal(
        'fetch',
        routedFetch(streamOf([complete([])]), (rowId) =>
          rowId === 'draft-linkedin'
            ? intentFor(rowId, {
                publishable: false,
                intent_hash: null,
                blockers: [{ reason: 'account_missing', message: 'Choose a LinkedIn account' }],
              })
            : intentFor(rowId),
        ),
      );

      const { result } = renderHook(() => usePublishDraft());
      await act(async () => {
        await result.current.publish(group());
      });

      expect(confirmationRequests[0].confirmDisabled).toBe(true);
    });
  });

  // BUG M-16: three of the four publish surfaces called this hook with no readiness check
  // and no confirmation. The invariant lives here, ahead of every network call.
  describe('publish gate', () => {
    const notReadyDraft = {
      ...(draft as object),
      captionPreview: '',
      publishingAssets: [],
    } as never;

    it('makes NO network call for a draft that is not ready', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => usePublishDraft());
      await act(async () => {
        await result.current.publish(notReadyDraft);
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(confirmationRequests).toHaveLength(0);
      expect(result.current.error).toContain('caption');
      expect(showMock.mock.calls[0][0].variant).toBe('error');
    });

    it('refuses a draft the autosave has not saved yet, with no network call', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => usePublishDraft());
      await act(async () => {
        await result.current.publish({
          ...(draft as object),
          backendDraftId: undefined,
          groupMembers: undefined,
        } as never);
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(showMock.mock.calls[0][0].title).toBe('Not saved yet');
    });

    it('does not publish when the confirmation is declined', async () => {
      confirmationAnswer = false;
      const fetchMock = routedFetch(streamOf([complete([])]));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => usePublishDraft());
      await act(async () => {
        await result.current.publish(draft);
      });

      expect(confirmationRequests).toHaveLength(1);
      expect(bulkCalls(fetchMock)).toHaveLength(0);
      expect(result.current.isPublishing).toBe(false);
    });

    it('names the one platform in the confirm of a lone draft', async () => {
      vi.stubGlobal('fetch', routedFetch(streamOf([complete([])])));

      const { result } = renderHook(() => usePublishDraft());
      await act(async () => {
        await result.current.publish(draft);
      });

      expect(confirmationRequests[0].title).toBe('Publish to Instagram?');
      expect(confirmationRequests[0].confirmLabel).toBe('Publish to Instagram');
    });
  });
});
