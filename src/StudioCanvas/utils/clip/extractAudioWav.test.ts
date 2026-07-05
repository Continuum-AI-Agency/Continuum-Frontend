import { describe, expect, it } from 'bun:test';

import {
  concatFloat32,
  concatInt16,
  downmixToMono,
  encodeWav,
  floatToInt16,
  resampleLinear,
} from './extractAudioWav';

describe('downmixToMono', () => {
  it('passes a single channel through unchanged', () => {
    const ch = new Float32Array([0.1, 0.2, 0.3]);
    expect(Array.from(downmixToMono([ch]))).toEqual([0.1, 0.2, 0.3].map((n) => Math.fround(n)));
  });
  it('averages multiple channels frame-by-frame', () => {
    const left = new Float32Array([1, 0, -1]);
    const right = new Float32Array([0, 0, 1]);
    expect(Array.from(downmixToMono([left, right]))).toEqual([0.5, 0, 0]);
  });
  it('returns an empty array for no channels', () => {
    expect(downmixToMono([]).length).toBe(0);
  });
});

describe('concatFloat32', () => {
  it('concatenates chunks in order', () => {
    const out = concatFloat32([
      new Float32Array([1, 2]),
      new Float32Array([3]),
      new Float32Array([4, 5]),
    ]);
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('concatInt16', () => {
  it('concatenates target-rate PCM chunks in order', () => {
    const out = concatInt16([new Int16Array([1, 2]), new Int16Array([3]), new Int16Array([4, 5])]);
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('resampleLinear', () => {
  it('passes through when input and target rates match', () => {
    const input = new Float32Array([0, 1, 2]);
    expect(resampleLinear(input, 16000, 16000)).toBe(input);
  });
  it('downsamples to the expected length', () => {
    const input = new Float32Array([0, 1, 2, 3]);
    const out = resampleLinear(input, 32000, 16000);
    expect(out.length).toBe(2);
    expect(Array.from(out)).toEqual([0, 2]);
  });
  it('linearly interpolates when upsampling', () => {
    const out = resampleLinear(new Float32Array([0, 1]), 2, 4);
    expect(out.length).toBe(4);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(0.5, 5);
    expect(out[2]).toBeCloseTo(1, 5);
  });
});

describe('floatToInt16', () => {
  it('maps the full range and clamps out-of-bounds values', () => {
    const out = floatToInt16(new Float32Array([0, 1, -1, 2, -2]));
    expect(Array.from(out)).toEqual([0, 32767, -32768, 32767, -32768]);
  });
});

describe('encodeWav', () => {
  it('writes a 44-byte LINEAR16 header with the sample rate and PCM payload', async () => {
    const pcm = new Int16Array([0, 100, -100]);
    const blob = encodeWav(pcm, 16000);
    expect(blob.type).toBe('audio/wav');
    const view = new DataView(await blob.arrayBuffer());
    const tag = (offset: number) =>
      String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3),
      );
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(tag(36)).toBe('data');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000); // sample rate
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(view.getUint32(40, true)).toBe(pcm.length * 2); // data size
    expect(blob.size).toBe(44 + pcm.length * 2);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(100);
    expect(view.getInt16(48, true)).toBe(-100);
  });
});
