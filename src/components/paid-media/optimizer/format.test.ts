import { describe, expect, it } from 'bun:test';

import {
  currencySymbol,
  deriveCpa,
  deriveEfficiency,
  formatCpa,
  formatCurrency,
  humanize,
} from './format';

describe('formatCurrency', () => {
  it('formats whole-dollar USD', () => {
    expect(formatCurrency(4200)).toBe('$4,200');
  });
  it('returns a dash for null/NaN', () => {
    expect(formatCurrency(null)).toBe('—');
    expect(formatCurrency(Number.NaN)).toBe('—');
  });
  it('labels the account currency (a JPY account never reads as USD)', () => {
    expect(formatCurrency(4200, 'JPY')).toBe('¥4,200');
  });
  it('falls back to USD for a null/blank/malformed currency code', () => {
    expect(formatCurrency(4200, null)).toBe('$4,200');
    expect(formatCurrency(4200, '')).toBe('$4,200');
    expect(formatCurrency(4200, 'not-a-code')).toBe('$4,200');
  });
});

describe('currencySymbol', () => {
  it('returns the currency prefix for an input adornment', () => {
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('JPY')).toBe('¥');
  });
  it('falls back to the USD symbol for a missing code', () => {
    expect(currencySymbol(null)).toBe('$');
  });
});

describe('formatCpa', () => {
  it('rounds and formats', () => {
    expect(formatCpa(28.6)).toBe('$29');
  });
  it('guards non-finite', () => {
    expect(formatCpa(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatCpa(null)).toBe('—');
  });
});

describe('deriveCpa', () => {
  it('divides spend by conversions', () => {
    expect(deriveCpa(1000, 25)).toBe(40);
  });
  it('returns null when conversions are zero', () => {
    expect(deriveCpa(1000, 0)).toBeNull();
  });
});

describe('deriveEfficiency', () => {
  it('uses the denominator multiplier for CPM while preserving zero-result safety', () => {
    expect(deriveEfficiency(120, 10_000, 1_000)).toBe(12);
    expect(deriveEfficiency(120, 0, 1_000)).toBeNull();
  });
});

describe('humanize', () => {
  it('title-cases and de-underscores', () => {
    expect(humanize('app_install')).toBe('App install');
  });
  it('returns a dash for empty', () => {
    expect(humanize(null)).toBe('—');
  });
  it('labels apply-mode tiers with product copy', () => {
    expect(humanize('observe')).toBe('Observe · no writes');
    expect(humanize('recommend')).toBe('Recommend');
    expect(humanize('autopilot')).toBe('Autopilot');
  });
});
