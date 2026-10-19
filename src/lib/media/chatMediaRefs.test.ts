import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import {
  CHAT_MEDIA_SIGN_ROUTE,
  type ChatMediaRef,
  type ChatMediaSignRequest,
  chatMediaRefKey,
} from '@continuum/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';

// The HTTP client is the seam: every sign is one POST through it, so the test counts exactly
// what a strip costs.
let expiresInMs = 3_600_000;
let failNext = false;
let round = 0;
const requestMock = mock(async (args: { path: string; body?: unknown }) => {
  if (failNext) {
    failNext = false;
    throw new Error('sign failed');
  }
  round += 1;
  const { refs } = args.body as ChatMediaSignRequest;
  return {
    items: refs.map((ref) => {
      const key = chatMediaRefKey(ref);
      return {
        key,
        // Provider stills come back relative to the API; storage stills absolute.
        thumbUrl:
          ref.type === 'platform'
            ? `/api/organic/agent/media/thumb?t=${key}-${round}`
            : ref.type === 'competitor'
              ? null
              : `https://storage.test/${key}?v=${round}`,
        expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
      };
    }),
  };
});
mock.module('@/lib/api/http', () => ({ request: requestMock, http: { request: requestMock } }));

const {
  CHAT_MEDIA_MAX_RECOVERIES_PER_TILE,
  CHAT_MEDIA_RECOVER_COALESCE_MS,
  CHAT_MEDIA_REFRESH_MARGIN_MS,
  CHAT_MEDIA_SIGN_RETRY_MS,
  resetChatMediaSignCache,
  signChatMediaRefs,
  useChatMediaTiles,
} = await import('./chatMediaRefs');
const { getApiBaseUrl } = await import('@/lib/api/config');

const draftRefs = (count: number, prefix = 'd'): ChatMediaRef[] =>
  Array.from({ length: count }, (_, i) => ({ type: 'draft', draftId: `${prefix}${i}` }));

const signCalls = () =>
  requestMock.mock.calls.filter(([args]) => args.path === CHAT_MEDIA_SIGN_ROUTE);

// Module mocks are process-wide in bun: hand the next spec the real modules back.
afterAll(() => mock.restore());

describe('signChatMediaRefs', () => {
  beforeEach(() => {
    resetChatMediaSignCache();
    requestMock.mockClear();
    expiresInMs = 3_600_000;
    failNext = false;
    round = 0;
  });

  it('signs a whole strip in one POST and serves it from cache after', async () => {
    const refs = draftRefs(8);
    const first = await signChatMediaRefs('brand-1', refs);
    expect(first.size).toBe(8);
    expect(signCalls()).toHaveLength(1);
    expect((signCalls()[0]?.[0].body as ChatMediaSignRequest).refs).toEqual(refs);

    await signChatMediaRefs('brand-1', refs);
    expect(signCalls()).toHaveLength(1);
  });

  it('batches past the 48-ref cap and never repeats a ref', async () => {
    await signChatMediaRefs('brand-1', [...draftRefs(60), ...draftRefs(5)]);
    expect(signCalls().map(([args]) => (args.body as ChatMediaSignRequest).refs.length)).toEqual([
      48, 12,
    ]);
  });

  it('resolves a provider still against the API base', async () => {
    const ref: ChatMediaRef = { type: 'platform', platform: 'instagram', mediaId: '1789' };
    const tiles = await signChatMediaRefs('brand-1', [ref]);
    expect(tiles.get(chatMediaRefKey(ref))?.thumbUrl).toBe(
      `${getApiBaseUrl()}/api/organic/agent/media/thumb?t=platform:instagram:1789-1`,
    );
  });

  it('keeps a null still null: nothing to show is not a URL to retry', async () => {
    const ref: ChatMediaRef = { type: 'competitor', source: 'instagram', id: 'x' };
    const tiles = await signChatMediaRefs('brand-1', [ref]);
    expect(tiles.get(chatMediaRefKey(ref))?.thumbUrl).toBeNull();
  });

  it('re-signs a ref whose URL is inside the refresh margin of its expiry', async () => {
    expiresInMs = CHAT_MEDIA_REFRESH_MARGIN_MS - 1_000;
    await signChatMediaRefs('brand-1', draftRefs(2));
    await signChatMediaRefs('brand-1', draftRefs(2));
    expect(signCalls()).toHaveLength(2);
  });

  it('shares a sign already in flight, so a double mount costs one POST', async () => {
    const refs = draftRefs(4);
    const [a, b] = await Promise.all([
      signChatMediaRefs('brand-1', refs),
      signChatMediaRefs('brand-1', refs),
    ]);
    expect(signCalls()).toHaveLength(1);
    expect([...b.values()]).toEqual([...a.values()]);
  });

  it('force skips the cache: a tile that failed is re-signed though its URL looked fresh', async () => {
    const refs = draftRefs(1);
    const before = await signChatMediaRefs('brand-1', refs);
    const after = await signChatMediaRefs('brand-1', refs, { force: true });
    expect(signCalls()).toHaveLength(2);
    expect(after.get('draft:d0')?.thumbUrl).not.toBe(before.get('draft:d0')?.thumbUrl);
  });

  it('a failed sign caches nothing, so the next view asks again', async () => {
    failNext = true;
    expect((await signChatMediaRefs('brand-1', draftRefs(2))).size).toBe(0);
    expect((await signChatMediaRefs('brand-1', draftRefs(2))).size).toBe(2);
  });

  it('scopes the cache by brand', async () => {
    await signChatMediaRefs('brand-1', draftRefs(1));
    await signChatMediaRefs('brand-2', draftRefs(1));
    expect(signCalls()).toHaveLength(2);
  });
});

describe('useChatMediaTiles', () => {
  beforeEach(() => {
    resetChatMediaSignCache();
    requestMock.mockClear();
    expiresInMs = 3_600_000;
    failNext = false;
    round = 0;
  });

  it('strips that come into view together share one POST', async () => {
    const a = draftRefs(8, 'a');
    const b = draftRefs(8, 'b');
    const first = renderHook(() => useChatMediaTiles('brand-1', a));
    const second = renderHook(() => useChatMediaTiles('brand-1', b));
    await waitFor(() =>
      expect(first.result.current.settled && second.result.current.settled).toBe(true),
    );
    expect(signCalls()).toHaveLength(1);
    expect((signCalls()[0]?.[0].body as ChatMediaSignRequest).refs).toHaveLength(16);
  });

  it('holds the sign while the strip is off screen, then signs on view', async () => {
    const refs = draftRefs(4);
    const { result, rerender } = renderHook(
      ({ enabled }) => useChatMediaTiles('brand-1', refs, { enabled }),
      { initialProps: { enabled: false } },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(signCalls()).toHaveLength(0);
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(signCalls()).toHaveLength(1);
  });

  it('a sign that failed outright is asked once more instead of settling into placeholders', async () => {
    failNext = true;
    const refs = draftRefs(2);
    const { result } = renderHook(() => useChatMediaTiles('brand-1', refs));
    await waitFor(() => expect(result.current.settled).toBe(true), {
      timeout: CHAT_MEDIA_SIGN_RETRY_MS + 1_000,
    });
    expect(signCalls()).toHaveLength(2);
    expect(result.current.tiles.get('draft:d1')?.thumbUrl).toBe(
      'https://storage.test/draft:d1?v=1',
    );
  });

  it('settles after one sign and re-signs failed tiles together, in one forced POST', async () => {
    const refs = draftRefs(8);
    const { result } = renderHook(() => useChatMediaTiles('brand-1', refs));
    expect(result.current.settled).toBe(false);
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(signCalls()).toHaveLength(1);

    act(() => {
      for (const ref of refs) result.current.recover(chatMediaRefKey(ref));
    });
    await waitFor(() => expect(signCalls()).toHaveLength(2), {
      timeout: CHAT_MEDIA_RECOVER_COALESCE_MS + 1_000,
    });
    expect((signCalls()[1]?.[0].body as ChatMediaSignRequest).refs).toHaveLength(8);
    await waitFor(() =>
      expect(result.current.tiles.get('draft:d0')?.thumbUrl).toBe(
        'https://storage.test/draft:d0?v=2',
      ),
    );
  });

  it('a re-sign whose call failed is asked once more', async () => {
    const refs = draftRefs(1);
    const { result } = renderHook(() => useChatMediaTiles('brand-1', refs));
    await waitFor(() => expect(result.current.settled).toBe(true));
    failNext = true;
    act(() => result.current.recover('draft:d0'));
    await waitFor(
      () =>
        expect(result.current.tiles.get('draft:d0')?.thumbUrl).toBe(
          'https://storage.test/draft:d0?v=2',
        ),
      { timeout: CHAT_MEDIA_RECOVER_COALESCE_MS + CHAT_MEDIA_SIGN_RETRY_MS + 1_000 },
    );
    expect(signCalls()).toHaveLength(3);
  });

  it('stops asking about a tile whose fresh URLs keep failing', async () => {
    const refs = draftRefs(1);
    const { result } = renderHook(() => useChatMediaTiles('brand-1', refs));
    await waitFor(() => expect(result.current.settled).toBe(true));
    for (let i = 0; i < CHAT_MEDIA_MAX_RECOVERIES_PER_TILE + 2; i++) {
      act(() => result.current.recover('draft:d0'));
      await new Promise((resolve) => setTimeout(resolve, CHAT_MEDIA_RECOVER_COALESCE_MS + 30));
    }
    expect(signCalls()).toHaveLength(1 + CHAT_MEDIA_MAX_RECOVERIES_PER_TILE);
  });

  it('a strip already signed this session mounts settled, with zero round trips', async () => {
    const refs = draftRefs(3);
    await signChatMediaRefs('brand-1', refs);
    requestMock.mockClear();
    const { result } = renderHook(() => useChatMediaTiles('brand-1', refs));
    expect(result.current.settled).toBe(true);
    expect(result.current.tiles.size).toBe(3);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(signCalls()).toHaveLength(0);
  });
});
