import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

// The hook opens a realtime channel and reads the signed-in user; neither is
// what this spec is about, so both are stubbed down to the surface it touches.
const mockChannel = {
  on: mock(() => mockChannel),
  subscribe: mock(() => mockChannel),
};
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'jane@test.dev' } } }) },
    channel: () => mockChannel,
    removeChannel: () => {},
  }),
}));
mock.module('@/lib/library/creativeOperations', () => ({
  createAssetCommentOperation: async (...args: unknown[]) => {
    const input = args[1] as Record<string, unknown>;
    const body = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
    const now = '2026-07-06T00:00:00.000Z';
    calls.push({ url: '/api/library/comments', method: 'POST', body });
    return {
      id: 'comment-created',
      brandId: body.brandId,
      assetId: body.assetId,
      versionId: body.versionId ?? null,
      parentCommentId: body.parentCommentId ?? null,
      body: body.body,
      annotation: body.annotation ?? null,
      resolvedAt: null,
      resolvedBy: null,
      createdBy: 'user-1',
      createdAt: now,
      updatedAt: now,
    };
  },
  updateAssetCommentOperation: async () => {
    throw new Error('not used in this spec');
  },
  deleteAssetCommentOperation: async () => undefined,
}));

import { useAssetComments } from './useAssetComments';

type FetchCall = { url: string; method: string; body: Record<string, unknown> | null };

let calls: FetchCall[] = [];
const originalFetch = globalThis.fetch;

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ url, method, body });

    if (url.startsWith('/api/library/comments') && method === 'GET') {
      return jsonResponse({ comments: [] });
    }
    if (url === '/api/library/comments' && method === 'POST') {
      const now = '2026-07-06T00:00:00.000Z';
      return jsonResponse({
        id: 'comment-created',
        brandId: 'brand-1',
        assetId: 'asset-1',
        versionId: body?.versionId ?? null,
        parentCommentId: null,
        body: body?.body ?? '',
        annotation: null,
        resolvedAt: null,
        resolvedBy: null,
        createdBy: 'user-1',
        createdAt: now,
        updatedAt: now,
      });
    }
    throw new Error(`Unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
});

function lastPost(): FetchCall | undefined {
  return calls.filter((call) => call.method === 'POST').at(-1);
}

describe('useAssetComments — posting pins to the version being viewed', () => {
  it('sends the viewed version id, so a comment on v1 stays on v1', async () => {
    const { result } = renderHook(() => useAssetComments('brand-1', 'asset-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.postComment({ body: 'Logo is cropped', versionId: 'version-1' });
    });

    expect(lastPost()?.body).toMatchObject({
      brandId: 'brand-1',
      assetId: 'asset-1',
      body: 'Logo is cropped',
      versionId: 'version-1',
    });
  });

  it('pins the optimistic row too, so it never flashes into the wrong bucket', async () => {
    const { result } = renderHook(() => useAssetComments('brand-1', 'asset-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let inFlight: Promise<unknown> | null = null;
    act(() => {
      inFlight = result.current.postComment({ body: 'On the old cut', versionId: 'version-1' });
    });

    // Before the server answers, the optimistic comment already carries the pin —
    // otherwise it would anchor to the head and jump out of the current list.
    const optimistic = result.current.comments.find((c) => c.id.startsWith('optimistic-'));
    expect(optimistic?.versionId).toBe('version-1');

    await act(async () => {
      await inFlight;
    });
    expect(result.current.comments.some((c) => c.id === 'comment-created')).toBe(true);
  });

  it('omits the version when the asset has no version rows yet', async () => {
    const { result } = renderHook(() => useAssetComments('brand-1', 'asset-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.postComment({ body: 'First note' });
    });

    // The API materializes v1 and pins there; sending null would be a claim we
    // cannot make from the client.
    expect(lastPost()?.body).not.toHaveProperty('versionId');
  });
});
