// The two pure halves of the long-exposure blend: WHICH frames get sampled, and HOW
// each one is drawn onto the accumulator.
//
// The running-average alpha is the part worth pinning. A constant 1/n needs n up
// front, which means decoding the clip twice; 1/(k+1) per frame gives the same mean in
// one pass, and getting it wrong produces a still that is simply the LAST frame at
// slightly reduced opacity — which still looks like a photograph, so nothing else
// would catch it. The blend itself is a bench assertion (the output must differ from
// every single source frame).

import { describe, expect, it } from 'bun:test';
import { accumulationStep, baseFillFor, sampleTimestamps } from './longExposure';

describe('sampleTimestamps', () => {
  it('samples on the requested cadence, starting at zero', () => {
    expect(sampleTimestamps(1, 4)).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it('never samples at or past the clip’s end', () => {
    for (const timestamp of sampleTimestamps(2.5, 12)) {
      expect(timestamp).toBeLessThan(2.5);
    }
  });

  it('is strictly increasing, so the decoder can read each packet once', () => {
    const timestamps = sampleTimestamps(7, 9);
    for (let i = 1; i < timestamps.length; i += 1) {
      expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
    }
  });

  it('spreads a capped sample ACROSS a long clip instead of crowding its head', () => {
    // 20 minutes at 60fps would be 72,000 decodes for one still.
    const timestamps = sampleTimestamps(1200, 60);
    expect(timestamps.length).toBe(600);
    expect(timestamps[timestamps.length - 1]).toBeGreaterThan(1000);
  });

  it('degrades to a single frame rather than dividing by zero', () => {
    expect(sampleTimestamps(0, 12)).toEqual([0]);
    expect(sampleTimestamps(1, 0)).toEqual(sampleTimestamps(1, 12));
  });
});

describe('accumulationStep', () => {
  it('draws the first averaged frame at full alpha — it IS the base', () => {
    expect(accumulationStep('average', 0)).toEqual({
      globalAlpha: 1,
      composite: 'source-over',
    });
  });

  it('is the running mean: frame k lands at 1/k over the mean of the previous k−1', () => {
    // Verified numerically on a single channel: after N steps the accumulator holds
    // the arithmetic mean of the N values, which a constant alpha never would.
    const values = [40, 200, 90, 10, 255];
    let accumulator = 0;
    values.forEach((value, index) => {
      const { globalAlpha } = accumulationStep('average', index);
      accumulator = accumulator * (1 - globalAlpha) + value * globalAlpha;
    });
    expect(accumulator).toBeCloseTo(values.reduce((a, b) => a + b, 0) / values.length, 6);
  });

  it('uses the canvas blend modes for lighten and darken, at full alpha', () => {
    expect(accumulationStep('lighten', 7)).toEqual({ globalAlpha: 1, composite: 'lighten' });
    expect(accumulationStep('darken', 7)).toEqual({ globalAlpha: 1, composite: 'darken' });
  });
});

describe('baseFillFor', () => {
  it('gives lighten and darken something to beat', () => {
    expect(baseFillFor('lighten')).toBe('#000000');
    expect(baseFillFor('darken')).toBe('#ffffff');
  });

  it('leaves the average with no base — a black plate would halve the first frame', () => {
    expect(baseFillFor('average')).toBeNull();
  });
});
