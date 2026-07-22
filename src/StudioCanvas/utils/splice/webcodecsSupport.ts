export type WebCodecsSupport = { ok: true } | { ok: false; reason: string };

const H264_BASELINE_CONFIG = {
  codec: 'avc1.42E01F',
  width: 640,
  height: 360,
  bitrate: 1_000_000,
  framerate: 30,
} as const;

let cached: WebCodecsSupport | null = null;

export function resetWebcodecsSupportCache(): void {
  cached = null;
}

export async function checkSpliceSupport(): Promise<WebCodecsSupport> {
  if (cached) return cached;

  const globalScope = globalThis as unknown as {
    VideoEncoder?: {
      isConfigSupported: (config: VideoEncoderConfig) => Promise<{ supported?: boolean }>;
    };
    VideoDecoder?: unknown;
    AudioEncoder?: unknown;
    AudioDecoder?: unknown;
    OffscreenCanvas?: unknown;
  };

  if (
    typeof globalScope.VideoEncoder === 'undefined' ||
    typeof globalScope.VideoDecoder === 'undefined' ||
    typeof globalScope.AudioEncoder === 'undefined' ||
    typeof globalScope.AudioDecoder === 'undefined'
  ) {
    cached = { ok: false, reason: 'WebCodecs is unavailable in this browser' };
    return cached;
  }

  if (typeof globalScope.OffscreenCanvas === 'undefined') {
    cached = { ok: false, reason: 'OffscreenCanvas is unavailable in this browser' };
    return cached;
  }

  try {
    const probe = await globalScope.VideoEncoder.isConfigSupported(H264_BASELINE_CONFIG);
    if (!probe.supported) {
      cached = { ok: false, reason: 'H.264 video encoding is not supported on this device' };
      return cached;
    }
  } catch (error) {
    cached = {
      ok: false,
      reason: error instanceof Error ? error.message : 'WebCodecs probe failed',
    };
    return cached;
  }

  cached = { ok: true };
  return cached;
}
