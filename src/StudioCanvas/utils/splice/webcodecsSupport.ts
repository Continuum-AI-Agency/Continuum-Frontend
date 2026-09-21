export type WebCodecsSupport = { ok: true } | { ok: false; reason: string };

const H264_BASELINE_CONFIG = {
  codec: 'avc1.42E01F',
  width: 640,
  height: 360,
  bitrate: 1_000_000,
  framerate: 30,
} as const;

export interface TimelineEncodingSupport {
  video: boolean;
  audio: boolean;
}

export type TimelineEncodingProbe = () => Promise<TimelineEncodingSupport>;

let cached: WebCodecsSupport | null = null;
let aacEncoderReady: Promise<void> | null = null;

/**
 * Mediabunny with an AAC encoder guaranteed. Chrome on Linux — the headless browser inside
 * the Continuum Render service — and Firefox ship no native AAC encoder, so every stitch with
 * sound failed there; the WASM encoder is registered, and downloaded, only where it is missing.
 */
export async function loadMediabunny(): Promise<typeof import('mediabunny')> {
  const mb = await import('mediabunny');
  aacEncoderReady ??= mb
    .canEncodeAudio('aac')
    .catch(() => false)
    .then(async (native) => {
      if (!native) (await import('@mediabunny/aac-encoder')).registerAacEncoder();
    });
  await aacEncoderReady;
  return mb;
}

export function resetWebcodecsSupportCache(): void {
  cached = null;
}

async function probeTimelineEncoding(): Promise<TimelineEncodingSupport> {
  const { canEncodeAudio, canEncodeVideo } = await loadMediabunny();
  const [video, audio] = await Promise.all([
    canEncodeVideo('avc', {
      width: H264_BASELINE_CONFIG.width,
      height: H264_BASELINE_CONFIG.height,
      bitrate: H264_BASELINE_CONFIG.bitrate,
    }),
    canEncodeAudio('aac', {
      numberOfChannels: 2,
      sampleRate: 48_000,
      bitrate: 192_000,
    }),
  ]);
  return { video, audio };
}

export async function checkSpliceSupport(
  encodingProbe: TimelineEncodingProbe = probeTimelineEncoding,
): Promise<WebCodecsSupport> {
  const usesDefaultProbe = encodingProbe === probeTimelineEncoding;
  if (usesDefaultProbe && cached) return cached;

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
    const result = { ok: false, reason: 'WebCodecs is unavailable in this browser' } as const;
    if (usesDefaultProbe) cached = result;
    return result;
  }

  if (typeof globalScope.OffscreenCanvas === 'undefined') {
    const result = {
      ok: false,
      reason: 'OffscreenCanvas is unavailable in this browser',
    } as const;
    if (usesDefaultProbe) cached = result;
    return result;
  }

  try {
    const probe = await globalScope.VideoEncoder.isConfigSupported(H264_BASELINE_CONFIG);
    if (!probe.supported) {
      const result = {
        ok: false,
        reason: 'H.264 video encoding is not supported on this device',
      } as const;
      if (usesDefaultProbe) cached = result;
      return result;
    }

    const encoding = await encodingProbe();
    if (!encoding.video) {
      const result = {
        ok: false,
        reason: 'The editor cannot encode H.264 video with its current media pipeline',
      } as const;
      if (usesDefaultProbe) cached = result;
      return result;
    }
    if (!encoding.audio) {
      const result = {
        ok: false,
        reason: 'The editor cannot encode AAC audio with its current media pipeline',
      } as const;
      if (usesDefaultProbe) cached = result;
      return result;
    }
  } catch (error) {
    const result = {
      ok: false,
      reason: error instanceof Error ? error.message : 'Media encoding capability probe failed',
    } as const;
    if (usesDefaultProbe) cached = result;
    return result;
  }

  const result = { ok: true } as const;
  if (usesDefaultProbe) cached = result;
  return result;
}
