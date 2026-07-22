import { describe, expect, it } from 'bun:test';

import { hookRateTextColor } from './hook-rate-color';

describe('hookRateTextColor', () => {
  it('is neutral (undefined) in the 31-49% band', () => {
    expect(hookRateTextColor(31)).toBeUndefined();
    expect(hookRateTextColor(40)).toBeUndefined();
    expect(hookRateTextColor(49)).toBeUndefined();
  });

  it('renders pure yellow at the 30% ceiling', () => {
    expect(hookRateTextColor(30)).toBe('rgb(250, 204, 21)');
  });

  it('renders pure red at 10% and clamps below it', () => {
    expect(hookRateTextColor(10)).toBe('rgb(239, 68, 68)');
    expect(hookRateTextColor(0)).toBe('rgb(239, 68, 68)');
  });

  it('interpolates between red and yellow inside the low band', () => {
    expect(hookRateTextColor(20)).toBe('rgb(245, 136, 45)');
  });

  it('renders pure lime at the 50% floor', () => {
    expect(hookRateTextColor(50)).toBe('rgb(132, 204, 22)');
  });

  it('renders pure pine green at 80% and clamps above it', () => {
    expect(hookRateTextColor(80)).toBe('rgb(21, 128, 61)');
    expect(hookRateTextColor(100)).toBe('rgb(21, 128, 61)');
  });

  it('interpolates between lime and pine inside the high band', () => {
    expect(hookRateTextColor(65)).toBe('rgb(77, 166, 42)');
  });
});
