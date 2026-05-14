import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { checkSpliceSupport, resetWebcodecsSupportCache } from './webcodecsSupport';

type GlobalShape = Record<string, unknown>;

function makeStubEncoder(supported: boolean) {
  return {
    isConfigSupported: async () => ({ supported }),
  };
}

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

    const result = await checkSpliceSupport();
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

    const result = await checkSpliceSupport();
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

    const result = await checkSpliceSupport();
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

    const result = await checkSpliceSupport();
    expect(result.ok).toBe(true);
  });

  it('memoizes the result across calls', async () => {
    let probeCalls = 0;
    scope.VideoEncoder = {
      isConfigSupported: async () => {
        probeCalls += 1;
        return { supported: true };
      },
    };
    scope.VideoDecoder = {};
    scope.AudioEncoder = {};
    scope.AudioDecoder = {};
    scope.OffscreenCanvas = class {};

    await checkSpliceSupport();
    await checkSpliceSupport();
    expect(probeCalls).toBe(1);
  });
});
