// Pure math behind the in/out trim and waveform on the canvas media reference nodes.
// Column bucketing itself is the Library waveform's streaming fold (waveformPeaks);
// this module only turns its min/max columns into bar heights and keeps a trim valid.

import type { WaveformPeaks } from '@/components/library/detail/audio/waveformPeaks';

export type TrimRange = { startMs: number; endMs: number };

// Spread into every write that swaps a node's media: a trim only means something
// against the clip it was set on.
export const CLEARED_TRIM = { trimStartMs: undefined, trimEndMs: undefined } as const;

// The handles may never meet: a zero-length trim would make the playback guard seek
// to the in-point forever.
export const MIN_TRIM_SPAN_MS = 100;

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

// Any stored or dragged trim, forced inside [0, durationMs] with the minimum span. The
// out-point is settled first, so an in-point dragged past it is the one that yields.
export function clampTrim(trim: Partial<TrimRange>, durationMs: number): TrimRange {
  const duration = Math.max(0, finiteOr(durationMs, 0));
  const span = Math.min(MIN_TRIM_SPAN_MS, duration);
  const endMs = Math.min(duration, Math.max(span, finiteOr(trim.endMs, duration)));
  const startMs = Math.min(endMs - span, Math.max(0, finiteOr(trim.startMs, 0)));
  return { startMs: Math.round(startMs), endMs: Math.round(endMs) };
}

export function msToFraction(ms: number, durationMs: number): number {
  if (!(durationMs > 0)) return 0;
  return Math.min(1, Math.max(0, ms / durationMs));
}

// m:ss.t — tenths are as fine as a label in a 28 px strip can usefully show.
export function formatTrimTime(ms: number): string {
  const tenths = Math.max(0, Math.round(finiteOr(ms, 0) / 100));
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths % 10}`;
}

// Max |amplitude| per column, scaled so the loudest column fills the strip. Silence
// stays all zeros instead of dividing by zero.
export function normalizePeaks(peaks: WaveformPeaks): number[] {
  const columns = Array.from(peaks.max, (max, index) =>
    Math.max(Math.abs(max), Math.abs(peaks.min[index] ?? 0)),
  );
  const loudest = Math.max(0, ...columns);
  return loudest > 0 ? columns.map((value) => value / loudest) : columns.map(() => 0);
}
