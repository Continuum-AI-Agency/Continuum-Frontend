import { describe, expect, it } from 'bun:test';
import { addChunkToPeaks, createPeaks } from '@/components/library/detail/audio/waveformPeaks';
import {
  clampTrim,
  formatTrimTime,
  MIN_TRIM_SPAN_MS,
  msToFraction,
  normalizePeaks,
} from './mediaTrim';

describe('clampTrim', () => {
  it('defaults an absent trim to the whole clip', () => {
    expect(clampTrim({}, 8000)).toEqual({ startMs: 0, endMs: 8000 });
  });

  it('keeps a valid trim as stored', () => {
    expect(clampTrim({ startMs: 2100, endMs: 7800 }, 8000)).toEqual({
      startMs: 2100,
      endMs: 7800,
    });
  });

  it('pulls a trim saved against a longer clip inside the new duration', () => {
    expect(clampTrim({ startMs: -50, endMs: 12_000 }, 8000)).toEqual({ startMs: 0, endMs: 8000 });
  });

  it('never lets the handles meet or cross; the in-point yields', () => {
    expect(clampTrim({ startMs: 5000, endMs: 3000 }, 8000)).toEqual({
      startMs: 3000 - MIN_TRIM_SPAN_MS,
      endMs: 3000,
    });
    expect(clampTrim({ startMs: 0, endMs: 0 }, 8000)).toEqual({
      startMs: 0,
      endMs: MIN_TRIM_SPAN_MS,
    });
  });

  it('treats NaN and a clip shorter than the minimum span as bounds, not errors', () => {
    expect(clampTrim({ startMs: Number.NaN, endMs: Number.NaN }, 8000)).toEqual({
      startMs: 0,
      endMs: 8000,
    });
    expect(clampTrim({ startMs: 20, endMs: 30 }, 40)).toEqual({ startMs: 0, endMs: 40 });
    expect(clampTrim({ startMs: 20 }, Number.NaN)).toEqual({ startMs: 0, endMs: 0 });
  });
});

describe('msToFraction', () => {
  it('maps ms onto 0..1 of the duration and clamps outside it', () => {
    expect(msToFraction(2000, 8000)).toBe(0.25);
    expect(msToFraction(-1, 8000)).toBe(0);
    expect(msToFraction(9000, 8000)).toBe(1);
    expect(msToFraction(1000, 0)).toBe(0);
  });
});

describe('formatTrimTime', () => {
  it('prints m:ss.t', () => {
    expect(formatTrimTime(2100)).toBe('0:02.1');
    expect(formatTrimTime(7849)).toBe('0:07.8');
    expect(formatTrimTime(65_000)).toBe('1:05.0');
  });

  it('rounds 59.96 s up to the next minute rather than printing 0:60.0', () => {
    expect(formatTrimTime(59_960)).toBe('1:00.0');
  });
});

describe('normalizePeaks', () => {
  it('takes the max absolute amplitude per column and scales the loudest to 1', () => {
    const peaks = createPeaks(3);
    // 6 frames at 6 Hz over 1 s: two frames per column.
    addChunkToPeaks(peaks, new Float32Array([0.1, -0.2, 0.4, -0.05, 0, 0]), 0, 6, 1);
    expect(normalizePeaks(peaks)).toEqual([0.5, 1, 0]);
  });

  it('keeps silence at zero', () => {
    expect(normalizePeaks(createPeaks(4))).toEqual([0, 0, 0, 0]);
  });
});
