import { describe, expect, it } from 'bun:test';
import { buildTemporalMetrics, changedPixels, isShownCopy } from './review';

const shown = { display: 'block', visibility: 'visible', opacity: '1' };
const box = { width: 400, height: 80 };

describe('isShownCopy', () => {
  it('measures copy the viewer can see', () => {
    expect(isShownCopy([shown, shown], box)).toBe(true);
  });

  it('skips copy in a scene that is off its window, however the scene hides it', () => {
    expect(isShownCopy([shown, { ...shown, opacity: '0' }], box)).toBe(false);
    expect(isShownCopy([shown, { ...shown, visibility: 'hidden' }], box)).toBe(false);
    expect(isShownCopy([shown, { ...shown, display: 'none' }], box)).toBe(false);
    expect(isShownCopy([{ ...shown, opacity: '0.6' }, { ...shown, opacity: '0.6' }], box)).toBe(
      false,
    );
    expect(isShownCopy([shown], { width: 0, height: 0 })).toBe(false);
  });
});

describe('buildTemporalMetrics motion', () => {
  // 21 samples at 10 fps: 2 s of a 32x18 sample that never changes on average.
  const still = Array.from({ length: 21 }, () => new Uint8Array(32 * 18).fill(20));
  const scenes = [{ id: 'hook', start_seconds: 0, duration_seconds: 2 }];

  it('counts a small moving element as motion, however little it moves the frame mean', () => {
    const barFilling = Array.from({ length: 20 }, () => 8);
    const metrics = buildTemporalMetrics(still, 10, scenes, barFilling);
    expect(metrics.frozenIntervals).toEqual([]);
    expect(metrics.entranceMotionSceneIds).toEqual(['hook']);
  });

  it('still finds a hold where no pixel changes', () => {
    const holds = [...Array.from({ length: 5 }, () => 40), ...Array.from({ length: 15 }, () => 0)];
    const metrics = buildTemporalMetrics(still, 10, scenes, holds);
    expect(metrics.frozenIntervals).toEqual([{ startSeconds: 0.5, durationSeconds: 1.5 }]);
  });

  it('falls back to the frame mean when no motion counts are given', () => {
    expect(buildTemporalMetrics(still, 10, scenes).frozenIntervals).toEqual([
      { startSeconds: 0, durationSeconds: 2 },
    ]);
  });
});

describe('changedPixels', () => {
  it('counts pixels that moved past the noise floor', () => {
    const before = new Uint8Array([10, 10, 10, 10]);
    expect(changedPixels(before, new Uint8Array([10, 12, 60, 0]))).toBe(2);
  });
});
