import { describe, expect, it } from 'bun:test';
import {
  applyEnvelope,
  AUDIO_SAMPLE_RATE,
  clampStereo,
  mixInto,
  resampleToStereo48k,
  silentStereo,
  stereoToPlanar,
} from './audioMix';

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
