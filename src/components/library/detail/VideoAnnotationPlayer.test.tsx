import { afterEach, describe, expect, it } from 'bun:test';
import type { LibraryPlayback } from '@continuum/contracts';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { clearLibraryPlaybackCache } from '@/lib/library/libraryPlayback';
import { activeStageVideo } from '@/lib/library/videoPoster';
import { VideoAnnotationPlayer } from './VideoAnnotationPlayer';

const BRAND_ID = '4b1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a10';
const ASSET_ID = '9a1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a22';
const VERSION_ID = '1c1bb67e-5c2a-4c0f-9f26-3f9b2f9a9a33';
const ORIGINAL = 'https://storage.test/brand/asset/hero.mov';

const PLAYBACK: LibraryPlayback = {
  assetId: ASSET_ID,
  assetVersionId: VERSION_ID,
  rungs: [
    {
      role: 'proxy_1080',
      label: '1080p',
      width: 1920,
      height: 1080,
      sizeBytes: null,
      mimeType: 'video/mp4',
      hdr: false,
      signedUrl: 'https://storage.test/proxy_1080.mp4',
    },
    {
      role: 'preview_video',
      label: '720p',
      width: 1280,
      height: 720,
      sizeBytes: null,
      mimeType: 'video/mp4',
      hdr: false,
      signedUrl: 'https://storage.test/preview_video.mp4',
    },
  ],
  sprite: {
    signedUrl: 'https://storage.test/scrub_sprite.jpg',
    width: 1600,
    height: 900,
    durationMs: 10_000,
  },
  audioProxy: null,
};

const realFetch = globalThis.fetch;
const playbackRequests: string[] = [];

// The playback route answers; everything else (the frame-rate probe) is a miss.
function stubFetch(playback: LibraryPlayback | null) {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    if (url.startsWith('/api/library/playback')) {
      playbackRequests.push(url);
      if (playback) return Response.json(playback);
    }
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
}

afterEach(() => {
  cleanup();
  clearLibraryPlaybackCache();
  playbackRequests.length = 0;
  globalThis.fetch = realFetch;
});

function mount(props: { withAsset?: boolean } = {}) {
  const withAsset = props.withAsset ?? true;
  return render(
    <VideoAnnotationPlayer
      src={ORIGINAL}
      durationMsHint={10_000}
      markers={[]}
      onSelectMarker={() => {}}
      posting={false}
      brandId={BRAND_ID}
      onPostAtTime={() => {}}
      registerSeek={() => {}}
      {...(withAsset ? { assetId: ASSET_ID, assetVersionId: VERSION_ID } : {})}
    />,
  );
}

const root = () => screen.getByTestId('video-annotation-player');
const video = () => root().querySelector('video') as HTMLVideoElement;

describe('VideoAnnotationPlayer — without an asset', () => {
  it('plays the stage src untouched and never asks for playback', async () => {
    stubFetch(PLAYBACK);
    mount({ withAsset: false });

    expect(video().getAttribute('src')).toBe(ORIGINAL);
    expect(root().dataset.playingRole).toBe('original');
    expect(screen.queryByTestId('player-quality')).toBeNull();
    // Speed and loop need no renditions.
    expect(screen.getByTestId('player-speed')).toBeDefined();
    expect(screen.getByTestId('player-loop')).toBeDefined();
    await act(async () => {});
    expect(playbackRequests).toEqual([]);
  });
});

describe('VideoAnnotationPlayer — quality', () => {
  it('lists Auto, every rung, and Original, and Auto swaps in while nothing has played', async () => {
    stubFetch(PLAYBACK);
    mount();

    await waitFor(() => expect(screen.queryByTestId('player-quality')).not.toBeNull());
    const options = [...screen.getByTestId('player-quality').querySelectorAll('option')];
    expect(options.map((option) => option.textContent)).toEqual([
      'Auto',
      '1080p',
      '720p',
      'Original',
    ]);
    expect(playbackRequests[0]).toContain(`versionId=${VERSION_ID}`);
    // A stage with no measured size needs no more than the smallest rung.
    expect(root().dataset.playingRole).toBe('preview_video');
    expect(root().dataset.quality).toBe('auto');
    expect(video().getAttribute('src')).toBe('https://storage.test/preview_video.mp4');
  });

  it('keeps the current source when playback arrives after the reviewer has started', async () => {
    let answer: (value: Response) => void = () => {};
    globalThis.fetch = (async (input: unknown) =>
      String(input).startsWith('/api/library/playback')
        ? new Promise<Response>((resolve) => {
            answer = resolve;
          })
        : new Response(null, { status: 404 })) as unknown as typeof fetch;
    mount();
    video().currentTime = 3;

    await act(async () => answer(Response.json(PLAYBACK)));
    await waitFor(() => expect(screen.queryByTestId('player-quality')).not.toBeNull());
    expect(root().dataset.playingRole).toBe('original');
    expect(video().getAttribute('src')).toBe(ORIGINAL);
  });

  it('switches source on a pick and resumes at the same moment, still playing', async () => {
    stubFetch(PLAYBACK);
    mount();
    await waitFor(() => expect(root().dataset.playingRole).toBe('preview_video'));

    const element = video();
    let plays = 0;
    element.play = async () => {
      plays += 1;
    };
    Object.defineProperty(element, 'paused', { configurable: true, get: () => false });
    element.currentTime = 4.2;

    fireEvent.change(screen.getByTestId('player-quality'), { target: { value: 'proxy_1080' } });
    expect(root().dataset.quality).toBe('proxy_1080');
    expect(root().dataset.playingRole).toBe('proxy_1080');
    expect(element.getAttribute('src')).toBe('https://storage.test/proxy_1080.mp4');

    // Loading new bytes resets the element; its metadata is where the swap picks back up.
    element.currentTime = 0;
    fireEvent.loadedMetadata(element);
    expect(element.currentTime).toBeCloseTo(4.2);
    expect(plays).toBe(1);

    fireEvent.change(screen.getByTestId('player-quality'), { target: { value: 'original' } });
    expect(root().dataset.playingRole).toBe('original');
    expect(element.getAttribute('src')).toBe(ORIGINAL);
  });

  it('falls back to the original when a proxy will not play', async () => {
    stubFetch(PLAYBACK);
    mount();
    await waitFor(() => expect(root().dataset.playingRole).toBe('preview_video'));

    fireEvent.error(video());
    expect(root().dataset.playingRole).toBe('original');
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('VideoAnnotationPlayer — speed and loop', () => {
  it('applies the chosen speed, and stopping a shuttle returns to it rather than 1×', () => {
    stubFetch(null);
    mount({ withAsset: false });
    const element = video();
    element.play = async () => {};

    fireEvent.change(screen.getByTestId('player-speed'), { target: { value: '0.5' } });
    expect(root().dataset.playbackRate).toBe('0.5');
    expect(element.playbackRate).toBe(0.5);

    fireEvent.keyDown(window, { key: 'l' });
    fireEvent.keyDown(window, { key: 'l' });
    expect(element.playbackRate).toBe(2);
    fireEvent.keyDown(window, { key: 'k' });
    expect(element.playbackRate).toBe(0.5);
  });

  it('toggles looping on the element', () => {
    stubFetch(null);
    mount({ withAsset: false });
    const toggle = screen.getByTestId('player-loop');

    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(video().loop).toBe(true);
  });
});

describe('VideoAnnotationPlayer — timeline hover thumbnail', () => {
  it('shows the sprite tile under the pointer and hides on leave', async () => {
    stubFetch(PLAYBACK);
    mount();
    await waitFor(() => expect(screen.queryByTestId('player-quality')).not.toBeNull());

    const lane = screen.getByRole('slider', { name: 'Seek' }).parentElement as HTMLElement;
    lane.getBoundingClientRect = () => ({ left: 100, width: 200, top: 0, height: 20 }) as DOMRect;

    fireEvent.pointerMove(lane, { clientX: 210 });
    const thumb = screen.getByTestId('timeline-hover-thumb');
    expect(thumb.dataset.tileIndex).toBe('55');

    fireEvent.pointerLeave(lane);
    expect(screen.queryByTestId('timeline-hover-thumb')).toBeNull();
  });

  it('shows nothing without a sprite', async () => {
    stubFetch({ ...PLAYBACK, sprite: null });
    mount();
    await waitFor(() => expect(screen.queryByTestId('player-quality')).not.toBeNull());

    const lane = screen.getByRole('slider', { name: 'Seek' }).parentElement as HTMLElement;
    lane.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, height: 20 }) as DOMRect;
    fireEvent.pointerMove(lane, { clientX: 50 });
    expect(screen.queryByTestId('timeline-hover-thumb')).toBeNull();
  });
});

describe('VideoAnnotationPlayer — stills', () => {
  it('registers its video for the download menu, and clears it on unmount', () => {
    stubFetch(null);
    const { unmount } = mount({ withAsset: false });

    expect(activeStageVideo()).toBe(video());
    expect(screen.getByTestId('player-download-still')).toBeDefined();
    expect(video().crossOrigin).toBe('anonymous');

    unmount();
    expect(activeStageVideo()).toBeNull();
  });
});
