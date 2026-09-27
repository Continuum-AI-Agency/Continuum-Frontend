import { describe, expect, it } from 'bun:test';
import { DEFAULT_FPS, diffMask, estimateFps, followerCorrection } from './compareMath';

const frameSec = 1 / 30;

describe('followerCorrection', () => {
  it('hard-seeks a follower that is somewhere else', () => {
    expect(followerCorrection({ drift: 0.3, frameSec })).toEqual({ seek: true });
    expect(followerCorrection({ drift: -0.3, frameSec })).toEqual({ seek: true });
  });

  it('runs at normal speed inside the quarter-frame dead band', () => {
    expect(followerCorrection({ drift: 0.005, frameSec })).toEqual({ playbackRate: 1 });
  });

  it('slows a follower that is ahead and speeds one that is behind, proportionally', () => {
    expect(followerCorrection({ drift: 0.01, frameSec })).toEqual({ playbackRate: 0.96 });
    expect(followerCorrection({ drift: -0.01, frameSec })).toEqual({ playbackRate: 1.04 });
  });

  it('clamps the nudge to ±10 %', () => {
    expect(followerCorrection({ drift: 0.2, frameSec })).toEqual({ playbackRate: 0.9 });
    expect(followerCorrection({ drift: -0.2, frameSec })).toEqual({ playbackRate: 1.1 });
  });
});

describe('estimateFps', () => {
  it('reads the source rate from the smallest step, ignoring dropped frames', () => {
    const step = 1001 / 30000;
    expect(estimateFps([0, step, 3 * step, 4 * step, 6 * step])).toBe(29.97);
  });

  it('falls back to the default without two frames', () => {
    expect(estimateFps([1.5])).toBe(DEFAULT_FPS);
    expect(estimateFps([2, 2])).toBe(DEFAULT_FPS);
  });
});

describe('diffMask', () => {
  it('marks pixels whose largest channel change beats the threshold', () => {
    const a = new Uint8ClampedArray([0, 0, 0, 255, 100, 100, 100, 255]);
    const b = new Uint8ClampedArray([10, 0, 0, 255, 100, 200, 100, 255]);
    const { mask, changedRatio } = diffMask(a, b, 32);
    expect(changedRatio).toBe(0.5);
    expect([...mask.slice(0, 4)]).toEqual([0, 0, 0, 0]);
    expect(mask[7]).toBeGreaterThan(0);
  });

  it('counts nothing when the threshold is above every change', () => {
    const a = new Uint8ClampedArray([0, 0, 0, 255]);
    const b = new Uint8ClampedArray([255, 255, 255, 255]);
    expect(diffMask(a, b, 255).changedRatio).toBe(0);
  });
});
