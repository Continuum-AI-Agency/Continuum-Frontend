import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  attachVideoPoster,
  isVideoMimeType,
  persistVideoPoster,
  posterTimestampSec,
  seekVideoPreviewFrame,
  type VideoPoster,
} from './videoPoster';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function poster(): VideoPoster {
  return {
    blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }),
    mimeType: 'image/webp',
    width: 640,
    height: 360,
    timestampSec: 1,
  };
}

describe('posterTimestampSec', () => {
  it('grabs a frame one second in, past the fade-in', () => {
    expect(posterTimestampSec(30)).toBe(1);
    expect(posterTimestampSec(1.01)).toBe(1);
  });

  it('uses the midpoint of a clip shorter than the preferred offset', () => {
    expect(posterTimestampSec(0.6)).toBeCloseTo(0.3, 5);
    expect(posterTimestampSec(1)).toBe(0.5);
  });

  it('falls back to the preferred offset when the duration is unknown', () => {
    expect(posterTimestampSec(null)).toBe(1);
    expect(posterTimestampSec(undefined)).toBe(1);
    expect(posterTimestampSec(Number.POSITIVE_INFINITY)).toBe(1);
    expect(posterTimestampSec(0)).toBe(1);
    expect(posterTimestampSec(-4)).toBe(1);
  });
});

describe('seekVideoPreviewFrame', () => {
  it('seeks an un-postered video past a blank opening frame', () => {
    const video = { duration: 12, currentTime: 0 };

    expect(seekVideoPreviewFrame(video)).toBe(true);
    expect(video.currentTime).toBe(1);
  });

  it('uses the midpoint for a sub-second video and ignores an unknown duration', () => {
    const shortVideo = { duration: 0.6, currentTime: 0 };
    const stream = { duration: Number.POSITIVE_INFINITY, currentTime: 0 };

    expect(seekVideoPreviewFrame(shortVideo)).toBe(true);
    expect(shortVideo.currentTime).toBeCloseTo(0.3, 5);
    expect(seekVideoPreviewFrame(stream)).toBe(false);
    expect(stream.currentTime).toBe(0);
  });
});

describe('isVideoMimeType', () => {
  it('is true only for video mime types', () => {
    expect(isVideoMimeType('video/mp4')).toBe(true);
    expect(isVideoMimeType('video/quicktime')).toBe(true);
    expect(isVideoMimeType('image/png')).toBe(false);
    expect(isVideoMimeType('')).toBe(false);
    expect(isVideoMimeType(null)).toBe(false);
  });
});

describe('persistVideoPoster', () => {
  it('POSTs the poster as multipart and returns the persisted path', async () => {
    let seen: { url: string; body: FormData } | null = null;
    globalThis.fetch = mock(async (url: string, init: RequestInit) => {
      seen = { url, body: init.body as FormData };
      return new Response(JSON.stringify({ thumbnailPath: 'brand/asset/thumb.webp' }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const result = await persistVideoPoster({
      brandId: 'brand',
      assetId: 'asset',
      poster: poster(),
    });

    expect(result).toBe('brand/asset/thumb.webp');
    expect(seen?.url).toBe('/api/library/thumbnail');
    expect(seen?.body.get('brandId')).toBe('brand');
    expect(seen?.body.get('assetId')).toBe('asset');
    expect(seen?.body.get('poster')).toBeInstanceOf(Blob);
  });

  it('returns null (never throws) when the route rejects the poster', async () => {
    globalThis.fetch = mock(async () => new Response('nope', { status: 403 })) as typeof fetch;
    expect(
      await persistVideoPoster({ brandId: 'brand', assetId: 'asset', poster: poster() }),
    ).toBeNull();
  });

  it('returns null (never throws) when the network fails', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(
      await persistVideoPoster({ brandId: 'brand', assetId: 'asset', poster: poster() }),
    ).toBeNull();
  });
});

describe('attachVideoPoster', () => {
  it('skips non-video uploads without touching the network', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('fetch must not be called for an image');
    }) as unknown as typeof fetch;

    const result = await attachVideoPoster({
      file: new Blob([new Uint8Array([0])], { type: 'image/png' }),
      mimeType: 'image/png',
      brandId: 'brand',
      assetId: 'asset',
    });
    expect(result).toBeNull();
  });

  it('returns null instead of throwing when the bytes are not decodable video', async () => {
    // Real mediabunny, real (bogus) bytes: no video track -> no poster, no throw.
    const result = await attachVideoPoster({
      file: new Blob([new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])], { type: 'video/mp4' }),
      mimeType: 'video/mp4',
      brandId: 'brand',
      assetId: 'asset',
    });
    expect(result).toBeNull();
  });
});
