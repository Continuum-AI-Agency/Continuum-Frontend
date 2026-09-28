// A reference clip's duration and audio waveform, decoded in the browser with
// Mediabunny. Works on audio files and on a video's audio track alike; a video with no
// audio track still reports its duration, with no peaks. Any failure — CORS, an
// unreadable container, a codec WebCodecs lacks — yields nothing: the waveform is
// decoration and must never break the node.

import { type RefObject, useEffect, useState } from 'react';
import { addChunkToPeaks, createPeaks } from '@/components/library/detail/audio/waveformPeaks';
import { normalizePeaks } from './mediaTrim';

export type MediaWaveform = {
  durationMs: number;
  /** 0..1 bar heights, one per column; null when the media has no audio track. */
  peaks: number[] | null;
};

// ponytail: decodes at most the first 10 minutes and leaves the rest of the strip flat;
// long-form media would want a server-written peaks rendition.
const MAX_DECODE_SEC = 10 * 60;
const PLANE = { planeIndex: 0, format: 'f32-planar' } as const;
const MIN_COLUMNS = 16;

// A canvas node remounts every time it is panned back into view, and a full audio
// decode is far too expensive to repeat for a clip that cannot change. data: URLs are
// left out: they are the transient preview of an upload in flight, and keeping one
// here would pin megabytes of base64 for the session.
const decodedBySrc = new Map<string, MediaWaveform>();

async function openSource(src: string) {
  const { BlobSource, UrlSource } = await import('mediabunny');
  if (src.startsWith('data:')) return new BlobSource(await (await fetch(src)).blob());
  // The default retries forever; an expired signed URL should fail once and go quiet.
  return new UrlSource(src, { getRetryDelay: () => null });
}

async function decodeMedia(
  src: string,
  columns: number,
  signal: AbortSignal,
): Promise<MediaWaveform | null> {
  const { Input, ALL_FORMATS, AudioSampleSink } = await import('mediabunny');
  const input = new Input({ source: await openSource(src), formats: ALL_FORMATS });
  // Disposing cancels the ranged fetches still in flight, not just the loop below.
  const dispose = () => input.dispose();
  signal.addEventListener('abort', dispose, { once: true });
  try {
    if (signal.aborted) return null;
    const durationSec = (await input.getDurationFromMetadata()) ?? (await input.computeDuration());
    if (!(durationSec > 0)) return null;
    const durationMs = durationSec * 1000;
    const track = await input.getPrimaryAudioTrack();
    if (!track) return { durationMs, peaks: null };

    const spanSec = Math.min(durationSec, MAX_DECODE_SEC);
    const peaks = createPeaks(Math.max(1, Math.round((columns * spanSec) / durationSec)));
    for await (const sample of new AudioSampleSink(track).samples(0, spanSec)) {
      try {
        if (signal.aborted) return null;
        const channel = new Float32Array(sample.allocationSize(PLANE) / 4);
        sample.copyTo(channel, PLANE);
        addChunkToPeaks(peaks, channel, sample.timestamp, sample.sampleRate, spanSec);
      } finally {
        sample.close();
      }
    }
    return { durationMs, peaks: normalizePeaks(peaks) };
  } finally {
    signal.removeEventListener('abort', dispose);
    input.dispose();
  }
}

/** Columns come from `measureRef`'s width at decode time — one bar per 2 px. */
export function useMediaWaveform(
  src: string | undefined,
  measureRef: RefObject<HTMLElement | null>,
): MediaWaveform | null {
  // Tagged with its src, so a result for the previous clip is simply not read — no
  // reset-on-change render.
  const [landed, setLanded] = useState<{ src: string; result: MediaWaveform } | null>(null);

  useEffect(() => {
    if (!src || decodedBySrc.has(src)) return;
    const controller = new AbortController();
    const columns = Math.max(MIN_COLUMNS, Math.round((measureRef.current?.clientWidth ?? 0) / 2));
    decodeMedia(src, columns, controller.signal)
      .then((result) => {
        if (!result || controller.signal.aborted) return;
        if (!src.startsWith('data:')) decodedBySrc.set(src, result);
        setLanded({ src, result });
      })
      .catch(() => {
        // Fail soft by design (see the file header); an aborted decode lands here too.
      });
    return () => controller.abort();
  }, [src, measureRef]);

  if (!src) return null;
  return decodedBySrc.get(src) ?? (landed?.src === src ? landed.result : null);
}
