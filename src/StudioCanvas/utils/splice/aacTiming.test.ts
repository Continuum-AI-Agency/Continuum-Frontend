import { expect, test } from 'bun:test';
import { encoderDelayFrames } from './aacTiming';

test('calibration finds variable codec delay and rejects missing signal', () => {
  const reference = new Float32Array(12_000);
  let seed = 42;
  for (let i = 0; i < reference.length; i++) {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    reference[i] = seed / 2 ** 32 - 0.5;
  }
  for (const delay of [0, 1_024, 2_112, 3_079]) {
    const decoded = new Float32Array(reference.length + delay);
    for (let i = 0; i < reference.length; i++) decoded[i + delay] = reference[i] * 0.8;
    expect(encoderDelayFrames(reference, decoded)).toBe(delay);
  }
  expect(() => encoderDelayFrames(reference, new Float32Array(16_000))).toThrow('calibrate');
  expect(() => encoderDelayFrames(reference, new Float32Array(10))).toThrow('calibrate');
});
