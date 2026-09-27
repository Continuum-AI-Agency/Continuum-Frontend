import { describe, expect, it } from 'bun:test';
import { LIBRARY_PLAYBACK_PROXY_MIN_BYTES, needsPlaybackProxy } from './library-preview-proxy';

const big = LIBRARY_PLAYBACK_PROXY_MIN_BYTES + 1;

describe('needsPlaybackProxy', () => {
  it('skips files at or under the size threshold', () => {
    expect(
      needsPlaybackProxy({
        sizeBytes: LIBRARY_PLAYBACK_PROXY_MIN_BYTES,
        width: 3840,
        height: 2160,
      }),
    ).toBe(false);
    expect(needsPlaybackProxy({ sizeBytes: null, width: null, height: null })).toBe(false);
  });

  it('proxies a large source above 720p in either orientation', () => {
    expect(needsPlaybackProxy({ sizeBytes: big, width: 1080, height: 1920 })).toBe(true);
    expect(needsPlaybackProxy({ sizeBytes: big, width: 1920, height: 1080 })).toBe(true);
  });

  it('skips a large source that is already 720p or smaller', () => {
    expect(needsPlaybackProxy({ sizeBytes: big, width: 720, height: 1280 })).toBe(false);
  });

  it('proxies a large source whose dimensions were never measured', () => {
    expect(needsPlaybackProxy({ sizeBytes: big, width: null, height: null })).toBe(true);
  });
});
