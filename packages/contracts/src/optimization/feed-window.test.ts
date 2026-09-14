import { describe, expect, it } from 'bun:test';
import {
  isOptimizerFeedWindowDays,
  OPTIMIZER_FEED_WINDOW_DAYS,
  optimizerFeedSinceIso,
} from './service';

describe('optimizer feed window', () => {
  it('accepts only 7, 14 and 30', () => {
    expect(OPTIMIZER_FEED_WINDOW_DAYS).toEqual([7, 14, 30]);
    expect(isOptimizerFeedWindowDays(7)).toBe(true);
    expect(isOptimizerFeedWindowDays(30)).toBe(true);
    expect(isOptimizerFeedWindowDays(8)).toBe(false);
    expect(isOptimizerFeedWindowDays('7')).toBe(false);
  });

  it('places since exactly windowDays before now', () => {
    const now = new Date('2026-09-11T12:00:00.000Z');
    expect(optimizerFeedSinceIso(7, now)).toBe('2026-09-04T12:00:00.000Z');
    expect(optimizerFeedSinceIso(14, now)).toBe('2026-08-28T12:00:00.000Z');
    expect(optimizerFeedSinceIso(30, now)).toBe('2026-08-12T12:00:00.000Z');
  });
});
