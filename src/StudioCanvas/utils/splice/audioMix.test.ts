import { describe, expect, it } from 'bun:test';
import { DUCKING, duckingKeyframes } from '@continuum/contracts';
import {
  AUDIO_SAMPLE_RATE,
  applyEnvelope,
  clampStereo,
  decodeClipPcm,
  mixInto,
  resampleToStereo48k,
  silentStereo,
  stereoToPlanar,
} from './audioMix';

it('decodes the exact source span, retains timestamp gaps, and closes trimmed samples', async () => {
  const samples = [0, 72].map((at) => ({
    timestamp: at / AUDIO_SAMPLE_RATE,
    sampleRate: AUDIO_SAMPLE_RATE,
    numberOfChannels: 2,
    numberOfFrames: 48,
    closed: false,
    copyTo(
      dest: Float32Array,
      options: { frameOffset?: number; frameCount?: number; planeIndex: number },
    ) {
      for (let i = 0; i < (options.frameCount ?? 48); i++)
        dest[i] = at + (options.frameOffset ?? 0) + i + options.planeIndex * 1_000;
    },
    close() {
      this.closed = true;
    },
  }));
  const mb = {
    AudioSampleSink: class {
      async *samples() {
        yield* samples;
      }
    },
  } as unknown as typeof import('mediabunny');
  const input = {
    getPrimaryAudioTrack: async () => ({}),
  } as unknown as InstanceType<typeof import('mediabunny')['Input']>;
  const decoded = await decodeClipPcm(mb, input, 12 / AUDIO_SAMPLE_RATE, 108 / AUDIO_SAMPLE_RATE);
  expect(decoded?.channels[0].length).toBe(96);
  expect(decoded?.channels[0][0]).toBe(12);
  expect(Array.from(decoded?.channels[0].slice(36, 60) ?? [])).toEqual(Array(24).fill(0));
  expect(decoded?.channels[0][60]).toBe(72);
  expect(decoded?.channels[0][95]).toBe(107);
  expect(decoded?.channels[1][0]).toBe(1_012);
  expect(decoded?.channels[1][60]).toBe(1_072);
  expect(decoded?.channels[1][95]).toBe(1_107);
  expect(samples.every((sample) => sample.closed)).toBe(true);
});

describe('silentStereo', () => {
  it('allocates zeroed channels of the requested length', () => {
    const s = silentStereo(4);
    expect(s.left.length).toBe(4);
    expect(s.right.length).toBe(4);
    expect(Array.from(s.left)).toEqual([0, 0, 0, 0]);
  });
});

describe('resampleToStereo48k', () => {
  it('duplicates a mono channel to both stereo channels at native rate', () => {
    const mono = new Float32Array(AUDIO_SAMPLE_RATE); // 1s @ 48k
    mono.fill(0.5);
    const out = resampleToStereo48k([mono], AUDIO_SAMPLE_RATE, 1);
    expect(out.left.length).toBe(AUDIO_SAMPLE_RATE);
    expect(out.right.length).toBe(AUDIO_SAMPLE_RATE);
    expect(out.left[100]).toBeCloseTo(0.5, 5);
    expect(out.right[100]).toBeCloseTo(0.5, 5);
  });

  it('downsamples 96k → 48k to half the frames', () => {
    const ch = new Float32Array(96_000); // 1s @ 96k
    const out = resampleToStereo48k([ch, ch], 96_000, 1);
    expect(out.left.length).toBe(AUDIO_SAMPLE_RATE);
  });

  it('compresses time by speed (2× → half output frames)', () => {
    const ch = new Float32Array(AUDIO_SAMPLE_RATE); // 1s @ 48k
    const out = resampleToStereo48k([ch], AUDIO_SAMPLE_RATE, 2);
    expect(out.left.length).toBe(AUDIO_SAMPLE_RATE / 2);
  });

  it('linearly interpolates between source samples', () => {
    // Two source frames [0, 1] at 48k, upsampled ×2 (speed 0.5) → midpoint ≈ 0.5.
    const ch = new Float32Array([0, 1]);
    const out = resampleToStereo48k([ch], AUDIO_SAMPLE_RATE, 0.5);
    expect(out.left.length).toBe(4);
    // Output frame 1 → source pos 0.5 → lerp(0,1,0.5) = 0.5.
    expect(out.left[1]).toBeCloseTo(0.5, 5);
  });
});

describe('applyEnvelope', () => {
  it('scales by constant gain', () => {
    const pcm = { left: new Float32Array([1, 1, 1, 1]), right: new Float32Array([1, 1, 1, 1]) };
    applyEnvelope(pcm, { gain: 0.5 });
    expect(Array.from(pcm.left)).toEqual([0.5, 0.5, 0.5, 0.5]);
  });

  it('ramps a fade-in from 0 and a fade-out toward 0', () => {
    const n = AUDIO_SAMPLE_RATE; // 1s
    const pcm = { left: new Float32Array(n).fill(1), right: new Float32Array(n).fill(1) };
    applyEnvelope(pcm, { fadeInSec: 0.1, fadeOutSec: 0.1 });
    expect(pcm.left[0]).toBe(0); // fade-in starts at silence
    expect(pcm.left[Math.floor(n / 2)]).toBeCloseTo(1, 5); // middle unaffected
    expect(pcm.left[n - 1]).toBeLessThan(0.05); // fade-out ends near silence
  });
});

describe('applyEnvelope with audio.volume keyframes', () => {
  const ones = (sec: number) => {
    const n = Math.round(sec * AUDIO_SAMPLE_RATE);
    return { left: new Float32Array(n).fill(1), right: new Float32Array(n).fill(1) };
  };
  const at = (pcm: { left: Float32Array }, sec: number) =>
    pcm.left[Math.round(sec * AUDIO_SAMPLE_RATE)] ?? Number.NaN;

  it('ducks a bed to duckTo × volume under speech and recovers after it', () => {
    const volume = 0.8;
    const keys = duckingKeyframes({
      clipStartSec: 1,
      clipDurationSec: 6,
      volume,
      speech: [{ startSec: 3, endSec: 4 }],
      idPrefix: 'duck',
    });
    const pcm = ones(6);
    applyEnvelope(pcm, { gain: volume, volumeKeyframes: keys });
    expect(at(pcm, 0.5)).toBeCloseTo(volume, 4); // before the first key: the clip volume
    expect(at(pcm, 2.5)).toBeCloseTo(volume * DUCKING.duckTo, 4); // under speech (clip-local)
    expect(at(pcm, 2 - DUCKING.attackSec / 2)).toBeCloseTo(
      (volume + volume * DUCKING.duckTo) / 2,
      2,
    ); // halfway down the attack ramp
    expect(at(pcm, 3 + DUCKING.releaseSec + 0.1)).toBeCloseTo(volume, 4);
  });

  it('keeps fades on top of the keyed gain, and clamps negative keys to silence', () => {
    const pcm = ones(1);
    applyEnvelope(pcm, {
      gain: 1,
      fadeOutSec: 0.5,
      volumeKeyframes: [
        { timeSec: 0, value: 0.5, interpolation: 'linear' },
        { timeSec: 1, value: 0.5, interpolation: 'linear' },
      ],
    });
    expect(at(pcm, 0.25)).toBeCloseTo(0.5, 4);
    expect(at(pcm, 0.75)).toBeLessThan(0.3);
    const negative = ones(0.1);
    applyEnvelope(negative, {
      volumeKeyframes: [{ timeSec: 0, value: -1, interpolation: 'linear' }],
    });
    expect(Math.max(...negative.left)).toBe(0);
  });

  it('without keyframes the constant-gain path is sample-identical to before', () => {
    const keyed = ones(0.2);
    const plain = ones(0.2);
    applyEnvelope(plain, { gain: 0.7, fadeInSec: 0.05 });
    applyEnvelope(keyed, { gain: 0.7, fadeInSec: 0.05, volumeKeyframes: [] });
    expect(Array.from(keyed.left)).toEqual(Array.from(plain.left));
    const n = plain.left.length;
    const fade = Math.round(0.05 * AUDIO_SAMPLE_RATE);
    for (const i of [0, 100, fade - 1, fade, n - 1]) {
      expect(plain.left[i]).toBeCloseTo(0.7 * (i < fade ? i / fade : 1), 6);
    }
  });
});

describe('mixInto', () => {
  it('sums a source into the master at an offset and clamps to bounds', () => {
    const master = silentStereo(6);
    const src = { left: new Float32Array([1, 1, 1]), right: new Float32Array([2, 2, 2]) };
    mixInto(master, src, 2);
    expect(Array.from(master.left)).toEqual([0, 0, 1, 1, 1, 0]);
    expect(Array.from(master.right)).toEqual([0, 0, 2, 2, 2, 0]);
  });

  it('accumulates overlapping sources (the basis of the crossfade)', () => {
    const master = silentStereo(4);
    mixInto(master, { left: new Float32Array([0.5, 0.5]), right: new Float32Array([0.5, 0.5]) }, 0);
    mixInto(master, { left: new Float32Array([0.5, 0.5]), right: new Float32Array([0.5, 0.5]) }, 1);
    expect(Array.from(master.left)).toEqual([0.5, 1, 0.5, 0]);
  });

  it('drops samples that fall outside the master buffer', () => {
    const master = silentStereo(2);
    mixInto(master, { left: new Float32Array([1, 1, 1]), right: new Float32Array([1, 1, 1]) }, 1);
    expect(Array.from(master.left)).toEqual([0, 1]);
  });
});

describe('clampStereo', () => {
  it('hard-clamps summed peaks to [-1, 1] and passes through in-range samples', () => {
    const pcm = { left: new Float32Array([1.8, -2, 0.4]), right: new Float32Array([-1.5, 0.2, 3]) };
    clampStereo(pcm);
    expect(pcm.left[0]).toBe(1);
    expect(pcm.left[1]).toBe(-1);
    expect(pcm.left[2]).toBeCloseTo(0.4, 5);
    expect(pcm.right[0]).toBe(-1);
    expect(pcm.right[1]).toBeCloseTo(0.2, 5);
    expect(pcm.right[2]).toBe(1);
  });
});

describe('stereoToPlanar', () => {
  it('lays out the L block followed by the R block', () => {
    const pcm = { left: new Float32Array([1, 2, 3]), right: new Float32Array([4, 5, 6]) };
    expect(Array.from(stereoToPlanar(pcm))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('slices a chunk by start + count', () => {
    const pcm = { left: new Float32Array([1, 2, 3, 4]), right: new Float32Array([5, 6, 7, 8]) };
    expect(Array.from(stereoToPlanar(pcm, 1, 2))).toEqual([2, 3, 6, 7]);
  });
});

it('retained fade PCM matches the original window while transition fades keep local time', () => {
  const ones = (sec: number) => ({
    left: new Float32Array(sec * AUDIO_SAMPLE_RATE).fill(1),
    right: new Float32Array(sec * AUDIO_SAMPLE_RATE).fill(1),
  });
  const original = ones(10),
    retained = ones(2),
    transitioned = ones(2);
  applyEnvelope(original, { fadeInSec: 8, fadeOutSec: 7 });
  const options = {
    fadeInSec: 8,
    fadeOutSec: 7,
    audioFadeClock: { offsetSec: 4, durationSec: 10 },
  };
  applyEnvelope(retained, options);
  applyEnvelope(transitioned, { ...options, transitionFadeInSec: 1, transitionFadeOutSec: 0.5 });
  for (const local of [0, 0.25, 0.75, 1, 1.75]) {
    const frame = Math.round(local * AUDIO_SAMPLE_RATE);
    expect(retained.left[frame]).toBeCloseTo(original.left[4 * AUDIO_SAMPLE_RATE + frame]!, 6);
    const manualIn = (4 + local) / 8,
      manualOut = (6 - local - 1 / AUDIO_SAMPLE_RATE) / 7;
    const expected =
      Math.min(manualIn, local) *
      Math.min(manualOut, Math.max(0, Math.min(1, (2 - local - 1 / AUDIO_SAMPLE_RATE) / 0.5)));
    expect(transitioned.left[frame]).toBeCloseTo(expected, 6);
  }
});
