import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import {
  CHAT_MEDIA_SIGN_ROUTE,
  type ChatMediaSignRequest,
  chatMediaRefKey,
} from '@continuum/contracts';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { AgentMentionReference } from '@/lib/agent-references';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

// A chip in history must not show the URL it was saved with (an original, and an hour later a
// broken image): a Library chip is signed like a strip tile, and any chip whose URL lapsed is
// its glyph.
// happy-dom's IntersectionObserver never reports; a message in these tests is on screen.
const realIntersectionObserver = globalThis.IntersectionObserver;
globalThis.IntersectionObserver = class {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;

let round = 0;
const requestMock = mock(async (args: { path: string; body?: unknown }) => {
  round += 1;
  const { refs } = args.body as ChatMediaSignRequest;
  return {
    items: refs.map((ref) => ({
      key: chatMediaRefKey(ref),
      thumbUrl: `https://storage.test/${chatMediaRefKey(ref)}?v=${round}`,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    })),
  };
});
mock.module('@/lib/api/http', () => ({ request: requestMock, http: { request: requestMock } }));

const { MentionifiedText } = await import('./mentionified-text');
const { resetChatMediaSignCache } = await import('@/lib/media/chatMediaRefs');

const ASSET_A = '11111111-1111-4111-8111-111111111111';
const ASSET_B = '22222222-2222-4222-8222-222222222222';
const libraryMention = (id: string, label: string, kind = 'image'): AgentMentionReference => ({
  id,
  type: 'media_asset',
  label,
  source: 'organic',
  metadata: { assetId: id, kind, previewUrl: `https://storage.test/original-${id}.png` },
});

const signCalls = () =>
  requestMock.mock.calls.filter(([args]) => args.path === CHAT_MEDIA_SIGN_ROUTE);

afterAll(() => {
  mock.restore();
  globalThis.IntersectionObserver = realIntersectionObserver;
});

describe('mention chips', () => {
  beforeEach(() => {
    resetChatMediaSignCache();
    requestMock.mockClear();
    round = 0;
  });
  afterEach(() => cleanup());

  it("a Library chip shows a freshly signed still, never the original it was saved with, one POST for the message's chips", async () => {
    const { container } = render(
      <MentionifiedText
        brandId="brand-1"
        text="Pair @Hero shot with @Launch reel"
        references={[
          libraryMention(ASSET_A, 'Hero shot'),
          libraryMention(ASSET_B, 'Launch reel', 'video'),
        ]}
      />,
    );
    await waitFor(() => expect(container.querySelectorAll('img')).toHaveLength(2));
    expect(signCalls()).toHaveLength(1);
    const srcs = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(srcs).toEqual([
      `https://storage.test/library:${ASSET_A}?v=1`,
      `https://storage.test/library:${ASSET_B}?v=1`,
    ]);
    expect(container.querySelector('video')).toBeNull();
  });

  it('a Library chip whose URL lapsed is re-signed once', async () => {
    const { container } = render(
      <MentionifiedText
        brandId="brand-1"
        text="Use @Hero shot"
        references={[libraryMention(ASSET_A, 'Hero shot')]}
      />,
    );
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    await waitFor(() =>
      expect(container.querySelector('img')?.getAttribute('src')).toBe(
        `https://storage.test/library:${ASSET_A}?v=2`,
      ),
    );
  });

  it('without a brand, a chip shows its thumbnail and drops to the glyph once that lapses', () => {
    const { container } = render(
      <MentionifiedText
        text="Use @Hero shot"
        references={[
          {
            id: 'canvas-1',
            type: 'canvas_node',
            label: 'Hero shot',
            source: 'canvas',
            metadata: {
              thumbnailUrl: 'https://cdn.test/hero-thumb.jpg',
              signedUrl: 'https://cdn.test/hero-original.png',
            },
          },
        ]}
      />,
    );
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://cdn.test/hero-thumb.jpg');
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(signCalls()).toHaveLength(0);
  });
});
