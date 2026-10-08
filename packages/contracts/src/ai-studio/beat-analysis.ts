// Beat timing, shared so the browser (Sound stage, timeline ruler) and the Backend
// (`get_beats` over ffmpeg-decoded PCM) place identical beat markers.
import type { EditorMarker } from './editor-project-v2';

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
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || samples.length === 0)
    throw new Error('PCM audio is required');
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
  if (!Number.isFinite(minBpm) || !Number.isFinite(maxBpm) || minBpm <= 0 || maxBpm < minBpm)
    throw new Error('A positive BPM range is required');
  const framesPerSecond = sampleRate / hop;
  const minLag = Math.max(1, Math.ceil((60 * framesPerSecond) / maxBpm));
  const maxLag = Math.min(envelope.length - 1, Math.floor((60 * framesPerSecond) / minBpm));
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
  const bpm = Math.max(minBpm, Math.min(maxBpm, Math.round((60 * framesPerSecond) / bestLag)));
  const prefix = new Float64Array(envelope.length + 1);
  for (let index = 0; index < envelope.length; index++) {
    prefix[index + 1] = prefix[index]! + envelope[index]!;
  }
  const neighborhood = Math.max(1, Math.round(framesPerSecond * 0.15));
  const onsets: { timeSec: number; strength: number }[] = [];
  for (let index = 0; index < envelope.length; index++) {
    const strength = envelope[index]!;
    const from = Math.max(0, index - neighborhood);
    const to = Math.min(envelope.length, index + neighborhood + 1);
    const mean = (prefix[to]! - prefix[from]!) / (to - from);
    if (
      strength > 1e-8 &&
      strength > mean * 1.5 &&
      strength >= (envelope[index - 1] ?? 0) &&
      strength > (envelope[index + 1] ?? 0)
    )
      onsets.push({ timeSec: index / framesPerSecond, strength });
  }
  if (onsets.length < 2) return { bpm, offsetSec: 0, confidence: 0, markers: [] };

  let first = 0;
  for (let index = 1; index < onsets.length && onsets[index]!.timeSec < 60 / bpm; index++) {
    if (onsets[index]!.strength > onsets[first]!.strength) first = index;
  }
  const offsetSec = onsets[first]!.timeSec;
  const markers: EditorMarker[] = [];
  let interval = 60 / bpm;
  let previousTime = offsetSec;
  let expected = offsetSec;
  let cursor = first;
  let skipped = 0;
  let predictions = 0;
  // ponytail: track locally within 35% of the estimated beat period; abrupt tempo
  // changes outside this window need a segmented tempo tracker, not invented hits.
  while (expected < samples.length / sampleRate && markers.length < 2_000) {
    predictions++;
    const tolerance = interval * 0.35;
    while (cursor < onsets.length && onsets[cursor]!.timeSec < expected - tolerance) cursor++;
    let selected = -1;
    let bestScore = 0;
    for (
      let index = cursor;
      index < onsets.length && onsets[index]!.timeSec <= expected + tolerance;
      index++
    ) {
      const onset = onsets[index]!;
      const score = onset.strength * (1 - Math.abs(onset.timeSec - expected) / (tolerance * 2));
      if (score > bestScore) {
        bestScore = score;
        selected = index;
      }
    }
    if (selected >= 0) {
      const timeSec = onsets[selected]!.timeSec;
      const beatIndex = predictions - 1;
      markers.push({
        id: `beat:${beatIndex}:${Math.round(timeSec * 1_000)}`,
        kind: 'beat',
        timeSec,
        beatIndex,
        barIndex: Math.floor(beatIndex / 4),
        label:
          beatIndex % 4 === 0 ? `Bar ${Math.floor(beatIndex / 4) + 1}` : `Beat ${beatIndex + 1}`,
      });
      if (markers.length > 1) {
        const observed = (timeSec - previousTime) / (skipped + 1);
        interval = Math.max(60 / maxBpm, Math.min(60 / minBpm, (interval + observed) / 2));
      }
      previousTime = timeSec;
      expected = timeSec + interval;
      cursor = selected + 1;
      skipped = 0;
    } else {
      expected += interval;
      skipped++;
    }
  }
  const confidence =
    best <= 0
      ? 0
      : (Math.max(0, Math.min(1, (best - total / Math.max(1, maxLag - minLag + 1)) / best)) *
          markers.length) /
        predictions;
  return { bpm, offsetSec, confidence, markers };
}
