'use client';

// Stage for audio assets: the browser's own <audio> player under a waveform
// decoded in the browser with Mediabunny. Clicking the waveform seeks; a playhead
// line follows playback. The transcript panel follows the same playhead through
// onTimeChange and seeks it through registerSeek, exactly as it does for video.

import { AudioLines } from 'lucide-react';
import { type MouseEvent, useEffect, useRef, useState } from 'react';
import { addChunkToPeaks, createPeaks, type WaveformPeaks } from './waveformPeaks';

// ponytail: the waveform decodes at most the first 30 minutes and leaves the rest of
// the canvas blank; a long-form podcast would want a server-written peaks rendition.
const MAX_DECODE_SEC = 30 * 60;
const PLANE = { planeIndex: 0, format: 'f32-planar' } as const;

// Ranged reads through UrlSource, so the decode streams the signed URL instead of
// downloading the whole file first. Only the first channel is drawn.
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

type Props = {
  src: string | null;
  label: string;
  registerSeek?: (seek: (ms: number) => void) => void;
  onTimeChange?: (timeMs: number) => void;
};

export function AudioStage({ src, label, registerSeek, onTimeChange }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peakCount, setPeakCount] = useState<number | null>(null);
  const [waveformFailed, setWaveformFailed] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    registerSeek?.((ms) => {
      if (audioRef.current) audioRef.current.currentTime = ms / 1000;
    });
  }, [registerSeek]);

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
        console.warn('[AudioStage] waveform decode failed', error);
        setWaveformFailed(true);
      });
    return () => controller.abort();
  }, [src]);

  const followPlayhead = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setProgress(audio.duration > 0 ? audio.currentTime / audio.duration : 0);
    onTimeChange?.(Math.floor(audio.currentTime * 1000));
  };

  const seekFromWaveform = (event: MouseEvent<HTMLButtonElement>) => {
    const audio = audioRef.current;
    if (!audio || !(audio.duration > 0)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = fraction * audio.duration;
    followPlayhead();
  };

  if (!src) {
    return (
      <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
        This audio file has no playable URL.
      </div>
    );
  }

  return (
    <div
      data-testid="audio-stage"
      className="flex size-full flex-col items-center justify-center gap-4 p-8"
    >
      <p className="flex max-w-full items-center gap-2 truncate text-sm font-medium">
        <AudioLines className="size-4 shrink-0 text-muted-foreground" />
        {label}
      </p>
      <button
        type="button"
        aria-label="Seek in waveform"
        onClick={seekFromWaveform}
        className="relative h-32 w-full max-w-3xl rounded-md bg-background/60 text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <canvas
          ref={canvasRef}
          data-testid="audio-waveform"
          data-peaks={peakCount ?? undefined}
          className="size-full"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px bg-primary"
          style={{ left: `${progress * 100}%` }}
        />
      </button>
      {waveformFailed ? (
        <p className="text-xs text-muted-foreground">Waveform unavailable for this file.</p>
      ) : null}
      {/* biome-ignore lint/a11y/useMediaCaption: the transcript panel is this audio's text track */}
      <audio
        ref={audioRef}
        data-testid="audio-player"
        src={src}
        controls
        preload="metadata"
        className="w-full max-w-3xl"
        onTimeUpdate={followPlayhead}
        onSeeked={followPlayhead}
      />
    </div>
  );
}
