import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  checkSpliceSupport,
  resetWebcodecsSupportCache,
  type TimelineEncodingProbe,
} from './webcodecsSupport';

type GlobalShape = Record<string, unknown>;

function makeStubEncoder(supported: boolean) {
  return {
    isConfigSupported: async () => ({ supported }),
  };
}

const supportedEncoding: TimelineEncodingProbe = async () => ({ video: true, audio: true });

describe('checkSpliceSupport', () => {
  const scope = globalThis as unknown as GlobalShape;
  const originals = {
    VideoEncoder: scope.VideoEncoder,
    VideoDecoder: scope.VideoDecoder,
    AudioEncoder: scope.AudioEncoder,
    AudioDecoder: scope.AudioDecoder,
    OffscreenCanvas: scope.OffscreenCanvas,
  };

  beforeEach(() => {
    resetWebcodecsSupportCache();
  });

  afterEach(() => {
    resetWebcodecsSupportCache();
    scope.VideoEncoder = originals.VideoEncoder;
    scope.VideoDecoder = originals.VideoDecoder;
    scope.AudioEncoder = originals.AudioEncoder;
    scope.AudioDecoder = originals.AudioDecoder;
    scope.OffscreenCanvas = originals.OffscreenCanvas;
  });

  it('reports unavailable when VideoEncoder is missing', async () => {
    scope.VideoEncoder = undefined;
    scope.VideoDecoder = {};
    scope.AudioEncoder = {};
    scope.AudioDecoder = {};
    scope.OffscreenCanvas = class {};

    const result = await checkSpliceSupport(supportedEncoding);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/webcodecs/i);
    }
  });

  it('reports unavailable when OffscreenCanvas is missing', async () => {
    scope.VideoEncoder = makeStubEncoder(true);
    scope.VideoDecoder = {};
    scope.AudioEncoder = {};
    scope.AudioDecoder = {};
    scope.OffscreenCanvas = undefined;

    const result = await checkSpliceSupport(supportedEncoding);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/offscreencanvas/i);
    }
  });

  it('reports unavailable when H.264 config is unsupported', async () => {
    scope.VideoEncoder = makeStubEncoder(false);
    scope.VideoDecoder = {};
    scope.AudioEncoder = {};
    scope.AudioDecoder = {};
    scope.OffscreenCanvas = class {};

    const result = await checkSpliceSupport(supportedEncoding);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/h\.?264/i);
    }
  });

  it('reports support when all WebCodecs APIs are present and H.264 is supported', async () => {
    scope.VideoEncoder = makeStubEncoder(true);
    scope.VideoDecoder = {};
    scope.AudioEncoder = {};
    scope.AudioDecoder = {};
    scope.OffscreenCanvas = class {};

    const result = await checkSpliceSupport(supportedEncoding);
    expect(result.ok).toBe(true);
  });

  it('rejects unsupported H.264 or AAC at the actual media-pipeline boundary', async () => {
    scope.VideoEncoder = makeStubEncoder(true);
    scope.VideoDecoder = {};
    scope.AudioEncoder = {};
    scope.AudioDecoder = {};
    scope.OffscreenCanvas = class {};

    const noVideo = await checkSpliceSupport(async () => ({ video: false, audio: true }));
    const noAudio = await checkSpliceSupport(async () => ({ video: true, audio: false }));

    expect(noVideo.ok).toBe(false);
    expect(noAudio.ok).toBe(false);
    if (!noVideo.ok) expect(noVideo.reason).toMatch(/h\.?264/i);
    if (!noAudio.ok) expect(noAudio.reason).toMatch(/aac/i);
  });
});
