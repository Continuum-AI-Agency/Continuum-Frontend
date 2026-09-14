import type { EditorMarker } from '@continuum/contracts';

export type BeatAnalysis = {
  bpm: number;
  offsetSec: number;
  confidence: number;
  markers: EditorMarker[];
};

export function buildBeatMarkers(input: {
  durationSec: number;
  bpm: number;
  offsetSec?: number;
  limit?: number;
}): EditorMarker[] {
  const interval = 60 / Math.max(30, Math.min(300, input.bpm));
  const offset = Math.max(0, input.offsetSec ?? 0);
  const limit = input.limit ?? 2_000;
  const markers: EditorMarker[] = [];
  for (
    let timeSec = offset, beatIndex = 0;
    timeSec <= input.durationSec && beatIndex < limit;
    timeSec += interval, beatIndex += 1
  ) {
    markers.push({
      id: `beat:${beatIndex}:${Math.round(timeSec * 1_000)}`,
      kind: 'beat',
      timeSec,
      label: beatIndex % 4 === 0 ? `Bar ${Math.floor(beatIndex / 4) + 1}` : `Beat ${beatIndex + 1}`,
      beatIndex,
      barIndex: Math.floor(beatIndex / 4),
    });
  }
  return markers;
}

export function analyzePcmBeats(
  samples: Float32Array,
  sampleRate: number,
  options: { minBpm?: number; maxBpm?: number } = {},
): BeatAnalysis {
  if (sampleRate <= 0 || samples.length === 0) throw new Error('PCM audio is required');
  const hop = 128;
  const frame = 256;
  const envelope = new Float32Array(Math.max(1, Math.floor((samples.length - frame) / hop) + 1));
  let previous = 0;
  for (let index = 0; index < envelope.length; index += 1) {
    let energy = 0;
    const start = index * hop;
    for (let cursor = start; cursor < Math.min(samples.length, start + frame); cursor += 1) {
      energy += samples[cursor] * samples[cursor];
    }
    envelope[index] = Math.max(0, energy - previous);
    previous = energy;
  }
  const minBpm = options.minBpm ?? 60;
  const maxBpm = options.maxBpm ?? 200;
  const framesPerSecond = sampleRate / hop;
  const minLag = Math.max(1, Math.floor((60 * framesPerSecond) / maxBpm));
  const maxLag = Math.min(envelope.length - 1, Math.ceil((60 * framesPerSecond) / minBpm));
  let bestLag = minLag;
  let best = 0;
  let total = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let score = 0;
    for (let index = lag; index < envelope.length; index += 1) {
      score += envelope[index] * envelope[index - lag];
    }
    total += score;
    if (score > best) {
      best = score;
      bestLag = lag;
    }
  }
  const detectedBpm = Math.round((60 * framesPerSecond) / bestLag);
  const bpm = detectedBpm < 90 && detectedBpm * 2 <= maxBpm ? detectedBpm * 2 : detectedBpm;
  let onsetIndex = 0;
  for (let index = 1; index < Math.min(envelope.length, bestLag); index += 1) {
    if (envelope[index] > envelope[onsetIndex]) onsetIndex = index;
  }
  const offsetSec = (onsetIndex * hop) / sampleRate;
  const confidence =
    best <= 0
      ? 0
      : Math.max(
          0,
          Math.min(1, best / Math.max(best, total / Math.max(1, maxLag - minLag + 1)) - 0.5),
        );
  const durationSec = samples.length / sampleRate;
  return { bpm, offsetSec, confidence, markers: buildBeatMarkers({ durationSec, bpm, offsetSec }) };
}
