import { describe, expect, it } from 'bun:test';

import { deriveCpa, formatCpa, formatCurrency, humanize } from './format';

describe('formatCurrency', () => {
  it('formats whole-dollar USD', () => {
    expect(formatCurrency(4200)).toBe('$4,200');
  });
  it('returns a dash for null/NaN', () => {
    expect(formatCurrency(null)).toBe('—');
    expect(formatCurrency(Number.NaN)).toBe('—');
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

describe('humanize', () => {
  it('title-cases and de-underscores', () => {
    expect(humanize('app_install')).toBe('App install');
  });
  it('returns a dash for empty', () => {
    expect(humanize(null)).toBe('—');
  });
});
