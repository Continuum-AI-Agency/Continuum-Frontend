import { describe, expect, test } from 'bun:test';
import { analyzePcmBeats, buildBeatMarkers } from './beatAnalysis';

const clickTrack = (bpm: number, offsetSec = 0.2, durationSec = 8, sampleRate = 16_000) => {
  const pcm = new Float32Array(durationSec * sampleRate);
  for (let time = offsetSec; time < durationSec; time += 60 / bpm) {
    const start = Math.round(time * sampleRate);
    for (let index = 0; index < 120 && start + index < pcm.length; index += 1) {
      pcm[start + index] = 1 - index / 120;
    }
  }
  return { pcm, sampleRate };
};

describe('beat analysis', () => {
  for (const bpm of [90, 120, 150]) {
    test(`detects a ${bpm} BPM click track`, () => {
      const { pcm, sampleRate } = clickTrack(bpm);
      const result = analyzePcmBeats(pcm, sampleRate);
      expect(Math.abs(result.bpm - bpm)).toBeLessThanOrEqual(3);
      expect(Math.abs(result.offsetSec - 0.2)).toBeLessThan(0.08);
      expect(result.markers.length).toBeGreaterThan(5);
    });
  }

  test('builds a manually corrected beat grid', () => {
    const markers = buildBeatMarkers({ durationSec: 2, bpm: 120, offsetSec: 0.25 });
    expect(markers.map((marker) => marker.timeSec)).toEqual([0.25, 0.75, 1.25, 1.75]);
  });
});
