import { describe, expect, test } from 'bun:test';
import { formatMoney, moneyProseRule, normalizeCurrencyCode } from './money';

// These cases are the Frontend's own (components/paid-media/optimizer/format.test.ts),
// repeated here on purpose: the sentence and the figure beside it must agree, and the only
// way two copies of a rule stay one rule is a test that pins both to the same strings.
describe('formatMoney mirrors the Frontend formatCurrency rule', () => {
  test('USD keeps its symbol, with the digit rule and grouping', () => {
    expect(formatMoney(4200, 'USD')).toBe('$4,200');
    expect(formatMoney(25.540000000000003, 'USD')).toBe('$25.54');
    expect(formatMoney(99.999, 'USD')).toBe('$100.00');
    expect(formatMoney(100, 'USD')).toBe('$100');
    expect(formatMoney(766.2, 'USD')).toBe('$766');
  });

  test('an unknown currency prints the bare figure, never a dollar sign', () => {
    expect(formatMoney(4200, null)).toBe('4,200');
    expect(formatMoney(4200, undefined)).toBe('4,200');
    expect(formatMoney(4200, '')).toBe('4,200');
    expect(formatMoney(4200, 'not-a-code')).toBe('4,200');
    expect(formatMoney(25.54, null)).toBe('25.54');
    expect(formatMoney(29.1, null)).not.toContain('$');
  });

  test('a known non-USD currency follows the figure with its code', () => {
    expect(formatMoney(324, 'MXN')).toBe('324 MXN');
    expect(formatMoney(4200, 'jpy')).toBe('4,200 JPY');
    expect(formatMoney(25.54, 'MXN')).toBe('25.54 MXN');
  });

  test('the sign stays outside the unit', () => {
    expect(formatMoney(-25.54, 'USD')).toBe('-$25.54');
    expect(formatMoney(-4200, 'MXN')).toBe('-4,200 MXN');
    expect(formatMoney(-4200, null)).toBe('-4,200');
  });

  test('a missing or non-finite figure prints a dash rather than a number', () => {
    expect(formatMoney(null, 'USD')).toBe('—');
    expect(formatMoney(Number.NaN, null)).toBe('—');
    expect(formatMoney(Number.POSITIVE_INFINITY, 'MXN')).toBe('—');
  });
});

describe('normalizeCurrencyCode', () => {
  test('accepts only a 3-letter ISO code, case-folded and trimmed', () => {
    expect(normalizeCurrencyCode(' mxn ')).toBe('MXN');
    expect(normalizeCurrencyCode('USD')).toBe('USD');
    expect(normalizeCurrencyCode('pesos')).toBeNull();
    expect(normalizeCurrencyCode(null)).toBeNull();
  });
});

describe('moneyProseRule — the rule a model writes under', () => {
  test('an unknown currency forbids the symbol, the code and "currency units" by name', () => {
    const rule = moneyProseRule(null);
    expect(rule).toContain('bare figure');
    expect(rule).toContain('never the words "currency units"');
    expect(rule).toContain('no currency symbol');
  });

  test('USD is written with its symbol', () => {
    expect(moneyProseRule('usd')).toContain('"$324"');
  });

  test('any other known currency is written with its code and never a symbol', () => {
    const rule = moneyProseRule('MXN');
    expect(rule).toContain('"324 MXN"');
    expect(rule).toContain('never a currency symbol');
  });
});
