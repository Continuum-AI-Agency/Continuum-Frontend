import { describe, expect, it } from 'bun:test';
import { addWaveformChunk, computePeaks } from './mediaThumbs';

it('clips decoded chunks to the source window and preserves gaps and exclusive ends', () => {
  const peaks = [0, 0, 0, 0];
  addWaveformChunk(peaks, new Float32Array([9, 0.2, -0.4]), 2, 0, 0.5, 2.5);
  addWaveformChunk(peaks, new Float32Array([-0.8, 9]), 2, 2, 0.5, 2.5);
  expect(peaks[0]).toBeCloseTo(0.2);
  expect(peaks[1]).toBeCloseTo(0.4);
  expect(peaks[2]).toBe(0);
  expect(peaks[3]).toBeCloseTo(0.8);
  addWaveformChunk(peaks, new Float32Array([1]), 0, 0, 0.5, 2.5);
  expect(peaks[0]).toBeCloseTo(0.2);
});

describe('computePeaks', () => {
  it('returns the max absolute amplitude per bucket, clamped to 0..1', () => {
    const channel = new Float32Array([0, 0.5, -0.9, 0.1, -1.4, 0.2]);
    const peaks = computePeaks(channel, 3);
    expect(peaks).toHaveLength(3);
    expect(peaks[0]).toBeCloseTo(0.5, 5); // max(|0|, |0.5|)
    expect(peaks[1]).toBeCloseTo(0.9, 5); // max(|-0.9|, |0.1|)
    expect(peaks[2]).toBe(1); // |-1.4| clamped
  });

  it('handles empty input and non-positive bucket counts', () => {
    expect(computePeaks(new Float32Array(0), 8)).toEqual([]);
    expect(computePeaks(new Float32Array([0.5]), 0)).toEqual([]);
  });

  it('produces the requested number of buckets even when longer than the data', () => {
    expect(computePeaks(new Float32Array([1, 1]), 5)).toHaveLength(5);
  });
});
