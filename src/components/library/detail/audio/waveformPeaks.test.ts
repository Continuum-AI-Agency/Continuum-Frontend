import { describe, expect, it } from 'bun:test';
import { addChunkToPeaks, createPeaks } from './waveformPeaks';

describe('addChunkToPeaks', () => {
  it('keeps the min and max amplitude of each pixel column', () => {
    const peaks = createPeaks(2);
    // 4 frames at 4 Hz over a 1 s span: two frames per column.
    addChunkToPeaks(peaks, new Float32Array([0.5, -0.25, -0.75, 0.125]), 0, 4, 1);
    expect([...peaks.max]).toEqual([0.5, 0.125]);
    expect([...peaks.min]).toEqual([-0.25, -0.75]);
  });

  it('places a later chunk by its timestamp and merges into existing columns', () => {
    const peaks = createPeaks(4);
    addChunkToPeaks(peaks, new Float32Array([0.25]), 0, 4, 1);
    addChunkToPeaks(peaks, new Float32Array([0.5, -0.5]), 0.5, 4, 1);
    expect([...peaks.max]).toEqual([0.25, 0, 0.5, 0]);
    expect([...peaks.min]).toEqual([0, 0, 0, -0.5]);
  });

  it('drops frames past the decode span', () => {
    const peaks = createPeaks(2);
    addChunkToPeaks(peaks, new Float32Array([0.125, 0.25, 0.875, 0.875]), 0.5, 2, 1);
    expect([...peaks.max]).toEqual([0, 0.125]);
  });

  it('is a no-op for zero columns or an empty span', () => {
    const none = createPeaks(0);
    addChunkToPeaks(none, new Float32Array([1]), 0, 1, 1);
    expect(none.max.length).toBe(0);

    const flat = createPeaks(2);
    addChunkToPeaks(flat, new Float32Array([1]), 0, 1, 0);
    expect([...flat.max]).toEqual([0, 0]);
  });
});
