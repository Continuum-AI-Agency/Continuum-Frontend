import { expect, test } from 'bun:test';
import { analyzePcmBeats } from './beat-analysis';

function clicks(times: number[], durationSec = 8) {
  const sampleRate = 22_050;
  const pcm = new Float32Array(sampleRate * durationSec);
  for (const time of times) {
    const start = Math.round(time * sampleRate);
    for (let sample = 0; sample < 180 && start + sample < pcm.length; sample++) {
      pcm[start + sample] = 0.8 * (1 - sample / 180);
    }
  }
  return { pcm, sampleRate };
}

test('detected markers follow changing tempo rather than inventing a uniform grid', () => {
  const hits = [0.2, 0.7, 1.22, 1.76, 2.32, 2.9, 3.5, 4.12, 4.76, 5.42, 6.1, 6.8, 7.52];
  const { pcm, sampleRate } = clicks(hits);
  const { markers } = analyzePcmBeats(pcm, sampleRate);
  expect(markers.length).toBe(hits.length);
  for (let index = 0; index < hits.length; index++) {
    expect(Math.abs(markers[index]!.timeSec - hits[index]!)).toBeLessThan(1 / 60);
  }
});

test('a missing musical hit does not produce a fabricated marker', () => {
  const hits = [0.2, 0.7, 1.2, 2.2, 2.7, 3.2, 3.7, 4.2, 4.7, 5.2, 5.7, 6.2, 6.7, 7.2];
  const { pcm, sampleRate } = clicks(hits);
  const { markers } = analyzePcmBeats(pcm, sampleRate);
  expect(markers.length).toBe(hits.length);
  expect(
    markers.every((marker) => hits.some((hit) => Math.abs(hit - marker.timeSec) < 1 / 60)),
  ).toBe(true);
});

test('silence has no detected beat markers or confidence', () => {
  const result = analyzePcmBeats(new Float32Array(22_050 * 8), 22_050);
  expect(result.markers).toEqual([]);
  expect(result.confidence).toBe(0);
});

test('off-grid rhythmic accents retain their measured timing', () => {
  const hits = [0.2, 0.7, 1.15, 1.7, 2.2, 2.75, 3.2, 3.7, 4.15, 4.7, 5.2, 5.75, 6.2, 6.7, 7.15];
  const { pcm, sampleRate } = clicks(hits);
  const { markers } = analyzePcmBeats(pcm, sampleRate);
  expect(markers.length).toBe(hits.length);
  expect(
    markers.every((marker) => hits.some((hit) => Math.abs(hit - marker.timeSec) < 1 / 60)),
  ).toBe(true);
});
