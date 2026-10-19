import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import {
  CHAT_MEDIA_SIGN_ROUTE,
  type ChatMediaItem,
  type ChatMediaSignRequest,
  chatMediaRefKey,
} from '@continuum/contracts';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

// happy-dom's IntersectionObserver never reports; a strip in these tests is on screen.
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
let hold: Promise<void> | null = null;
const requestMock = mock(async (args: { path: string; body?: unknown }) => {
  if (hold) await hold;
  round += 1;
  const { refs } = args.body as ChatMediaSignRequest;
  return {
    items: refs.map((ref) => {
      const key = chatMediaRefKey(ref);
      return {
        key,
        thumbUrl: ref.type === 'competitor' ? null : `https://storage.test/${key}?v=${round}`,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      };
    }),
  };
});
mock.module('@/lib/api/http', () => ({ request: requestMock, http: { request: requestMock } }));

const { MEDIA_STRIP_TILE_HEIGHT, MediaStrip, mediaStripTileWidth } = await import('./MediaStrip');
const { resetChatMediaSignCache } = await import('@/lib/media/chatMediaRefs');

const items: ChatMediaItem[] = [
  { ref: { type: 'draft', draftId: 'd1' }, kind: 'image', w: 1080, h: 1080, label: 'Square post' },
  {
    ref: { type: 'platform', platform: 'instagram', mediaId: '1789' },
    kind: 'video',
    w: null,
    h: null,
    durationMs: 15_000,
    permalink: 'https://www.instagram.com/reel/abc/',
    label: 'Launch reel',
  },
  { ref: { type: 'draft', draftId: 'd2', slide: 1 }, kind: 'carousel', w: null, h: null },
  {
    ref: { type: 'competitor', source: 'instagram', id: 'gone' },
    kind: 'image',
    w: 1920,
    h: 1080,
    permalink: 'https://www.instagram.com/p/gone/',
  },
];

const signCalls = () =>
  requestMock.mock.calls.filter(([args]) => args.path === CHAT_MEDIA_SIGN_ROUTE);
const tile = (container: HTMLElement, key: string) =>
  container.querySelector(`[data-media-key="${key}"]`) as HTMLElement;

// Module mocks and globals are process-wide in bun: hand the next spec the real ones back.
afterAll(() => {
  mock.restore();
  globalThis.IntersectionObserver = realIntersectionObserver;
});

describe('MediaStrip', () => {
  beforeEach(() => {
    resetChatMediaSignCache();
    requestMock.mockClear();
    round = 0;
    hold = null;
  });
  afterEach(() => cleanup());

  it('sizes every tile before a byte arrives: its own aspect, else the kind', () => {
    expect(mediaStripTileWidth(items[0]!)).toBe(MEDIA_STRIP_TILE_HEIGHT);
    expect(mediaStripTileWidth(items[1]!)).toBe(Math.round((MEDIA_STRIP_TILE_HEIGHT * 9) / 16));
    expect(mediaStripTileWidth(items[2]!)).toBe(Math.round((MEDIA_STRIP_TILE_HEIGHT * 4) / 5));
    expect(mediaStripTileWidth(items[3]!)).toBe(Math.round((MEDIA_STRIP_TILE_HEIGHT * 16) / 9));

    let release: () => void = () => {};
    hold = new Promise((resolve) => {
      release = resolve;
    });
    const { container } = render(<MediaStrip brandId="brand-1" items={items} total={4} />);
    const first = tile(container, 'draft:d1');
    expect(first.dataset.tileState).toBe('pending');
    expect(first.style.width).toBe(`${MEDIA_STRIP_TILE_HEIGHT}px`);
    expect(first.style.height).toBe(`${MEDIA_STRIP_TILE_HEIGHT}px`);
    release();
  });

  it('signs the whole strip in one POST, keyed by ref, and shows only stills', async () => {
    const { container } = render(
      <MediaStrip brandId="brand-1" items={items} total={4} label="Recent media" />,
    );
    await waitFor(() => expect(tile(container, 'draft:d1').dataset.tileState).toBe('ready'));
    expect(signCalls()).toHaveLength(1);
    expect((signCalls()[0]?.[0].body as ChatMediaSignRequest).refs).toEqual(
      items.map((item) => item.ref),
    );
    expect(
      [...container.querySelectorAll('[data-media-key]')].map((li) =>
        li.getAttribute('data-media-key'),
      ),
    ).toEqual(items.map((item) => chatMediaRefKey(item.ref)));
    // A video tile is its poster still with a play mark: zero video bytes before play.
    expect(container.querySelector('video')).toBeNull();
    const reel = tile(container, 'platform:instagram:1789');
    expect(reel.querySelector('img')?.getAttribute('src')).toBe(
      'https://storage.test/platform:instagram:1789?v=1',
    );
    expect(reel.textContent).toContain('0:15');
  });

  it('a ref with nothing to show is a placeholder linked to its permalink, not a retry', async () => {
    const { container } = render(<MediaStrip brandId="brand-1" items={items} />);
    const gone = () => tile(container, 'competitor:instagram:gone');
    await waitFor(() => expect(gone().dataset.tileState).toBe('empty'));
    expect(gone().querySelector('img')).toBeNull();
    expect(gone().querySelector('a')?.getAttribute('href')).toBe(
      'https://www.instagram.com/p/gone/',
    );
    expect(signCalls()).toHaveLength(1);
  });

  it('a tile that fails to load is re-signed past the cache and retried', async () => {
    const { container } = render(<MediaStrip brandId="brand-1" items={items} />);
    await waitFor(() => expect(tile(container, 'draft:d1').dataset.tileState).toBe('ready'));
    const img = tile(container, 'draft:d1').querySelector('img') as HTMLImageElement;
    fireEvent.error(img);
    await waitFor(() =>
      expect(tile(container, 'draft:d1').querySelector('img')?.getAttribute('src')).toBe(
        'https://storage.test/draft:d1?v=2',
      ),
    );
    expect(signCalls()).toHaveLength(2);
    expect((signCalls()[1]?.[0].body as ChatMediaSignRequest).refs).toEqual([items[0]!.ref]);
  });

  it("shows an Unsplash photographer's credit on the tile", () => {
    const { getByText } = render(
      <MediaStrip
        brandId="brand-1"
        items={[
          {
            ref: { type: 'platform', platform: 'unsplash', mediaId: 'abc' },
            kind: 'image',
            w: 1200,
            h: 800,
            label: 'Photo by Ada Lens on Unsplash',
          },
        ]}
      />,
    );
    expect(getByText('Photo by Ada Lens on Unsplash')).toBeTruthy();
  });

  it('names every tile and the group, and says how many the strip left out', async () => {
    const { container, getByRole, getByText } = render(
      <MediaStrip brandId="brand-1" items={items} total={31} label="Recent media" />,
    );
    expect(container.querySelector('figure')?.getAttribute('aria-label')).toBe(
      'Recent media: 4 of 31',
    );
    expect(getByText('+27 more')).toBeTruthy();
    expect(getByRole('link', { name: 'Launch reel (opens in a new tab)' })).toBeTruthy();
    expect(getByRole('img', { name: 'Carousel 3 of 4' })).toBeTruthy();
  });
});
