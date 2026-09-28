'use client';

// An audio file's waveform, decoded in the browser with Mediabunny and drawn into
// the returned canvas at its own pixel width. Ranged reads through UrlSource, so
// the decode streams the signed URL instead of downloading the whole file first.
// Only the first channel is drawn.

import { useEffect, useRef, useState } from 'react';
import { addChunkToPeaks, createPeaks, type WaveformPeaks } from './waveformPeaks';

// ponytail: the waveform decodes at most the first 30 minutes and leaves the rest of
// the canvas blank; a long-form podcast would want a server-written peaks rendition.
const MAX_DECODE_SEC = 30 * 60;
const PLANE = { planeIndex: 0, format: 'f32-planar' } as const;

async function decodeWaveform(
  src: string,
  widthPx: number,
  signal: AbortSignal,
): Promise<WaveformPeaks | null> {
  const { Input, UrlSource, ALL_FORMATS, AudioSampleSink } = await import('mediabunny');
  const input = new Input({ source: new UrlSource(src), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    const durationSec = (await input.getDurationFromMetadata()) ?? (await input.computeDuration());
    if (!(durationSec > 0)) return null;
    const spanSec = Math.min(durationSec, MAX_DECODE_SEC);
    const peaks = createPeaks(Math.max(1, Math.round((widthPx * spanSec) / durationSec)));
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
    return peaks;
  } finally {
    input.dispose();
  }
}

function drawPeaks(canvas: HTMLCanvasElement, peaks: WaveformPeaks, width: number, height: number) {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.fillStyle = getComputedStyle(canvas).color;
  const mid = height / 2;
  for (let column = 0; column < peaks.max.length; column += 1) {
    const top = mid - (peaks.max[column] ?? 0) * mid;
    const bottom = mid - (peaks.min[column] ?? 0) * mid;
    context.fillRect(column, top, 1, Math.max(1, bottom - top));
  }
}

export function useWaveform(src: string | null) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peakCount, setPeakCount] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!src || !canvas) return;
    const controller = new AbortController();
    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));
    decodeWaveform(src, width, controller.signal)
      .then((peaks) => {
        if (!peaks || controller.signal.aborted) return;
        drawPeaks(canvas, peaks, width, height);
        setPeakCount(peaks.max.length);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // The player still works without a waveform; say so rather than hide it.
        console.warn('[useWaveform] waveform decode failed', error);
        setFailed(true);
      });
    return () => controller.abort();
  }, [src]);

  return { canvasRef, peakCount, failed };
}
