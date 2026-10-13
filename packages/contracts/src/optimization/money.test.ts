import { describe, expect, test } from 'bun:test';
import { formatMoney, moneyProseRule, normalizeCurrencyCode } from './money';

// M1 (2026-10-13): these cases are the Frontend's screen rule (src/lib/money/display.ts,
// `moneyParts` / `joinMoney`), repeated here on purpose: the sentence and the figure beside it must agree, and the only
// way two copies of a rule stay one rule is a test that pins both to the same strings.
describe('formatMoney mirrors the Frontend M1 money rule', () => {
  test('USD prints its symbol before and its code after, with the digit rule and grouping', () => {
    expect(formatMoney(4200, 'USD')).toBe('$4,200 USD');
    expect(formatMoney(25.540000000000003, 'USD')).toBe('$25.54 USD');
    expect(formatMoney(99.999, 'USD')).toBe('$100.00 USD');
    expect(formatMoney(100, 'USD')).toBe('$100 USD');
    expect(formatMoney(766.2, 'USD')).toBe('$766 USD');
  });

  test('an unknown currency prints the bare figure, never a dollar sign', () => {
    expect(formatMoney(4200, null)).toBe('4,200');
    expect(formatMoney(4200, undefined)).toBe('4,200');
    expect(formatMoney(4200, '')).toBe('4,200');
    expect(formatMoney(4200, 'not-a-code')).toBe('4,200');
    expect(formatMoney(25.54, null)).toBe('25.54');
    expect(formatMoney(29.1, null)).not.toContain('$');
  });

  test('every known currency prints its own symbol before and its code after', () => {
    expect(formatMoney(324, 'MXN')).toBe('$324 MXN');
    expect(formatMoney(25.54, 'MXN')).toBe('$25.54 MXN');
    expect(formatMoney(85.47, 'EUR')).toBe('€85.47 EUR');
    expect(formatMoney(4200, 'jpy')).toBe('¥4,200 JPY');
  });

  test('a "$" on a peso figure never stands without its code', () => {
    expect(formatMoney(324, 'MXN')).not.toBe('$324');
    expect(formatMoney(324, 'MXN')).toEndWith(' MXN');
    expect(formatMoney(324, 'MXN')).not.toContain('USD');
  });

  test('a currency with no symbol of its own prints the code alone', () => {
    expect(formatMoney(85.47, 'CHF')).toBe('85.47 CHF');
  });

  test('the sign stays outside the unit', () => {
    expect(formatMoney(-25.54, 'USD')).toBe('-$25.54 USD');
    expect(formatMoney(-4200, 'MXN')).toBe('-$4,200 MXN');
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

  test('USD is written with its symbol before and its code after', () => {
    expect(moneyProseRule('usd')).toContain('"$324 USD"');
  });

  test('MXN is written the same way, and never with the symbol or the code alone', () => {
    const rule = moneyProseRule('MXN');
    expect(rule).toContain('"$324 MXN"');
    expect(rule).toContain('never the symbol without the code');
    expect(rule).not.toContain('USD');
  });

  test('the prose rule spells money exactly as formatMoney does', () => {
    for (const code of ['MXN', 'USD', 'EUR', 'CHF']) {
      expect(moneyProseRule(code)).toContain(`"${formatMoney(324, code)}"`);
      expect(moneyProseRule(code)).toContain(`"${formatMoney(25.54, code)}"`);
    }
  });

  test('a currency with no symbol is written with its code and never a symbol', () => {
    const rule = moneyProseRule('CHF');
    expect(rule).toContain('"324 CHF"');
    expect(rule).toContain('never a currency symbol');
  });
});
