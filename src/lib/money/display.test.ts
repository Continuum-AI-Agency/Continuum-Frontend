import { describe, expect, it } from 'bun:test';
import {
  currencyGlyph,
  joinMoney,
  joinMoneyInColumn,
  moneyParts,
  normalizeCurrency,
  splitMoney,
} from './display';

describe('M1 — the symbol before the figure, the code after it', () => {
  it('spells MXN and USD with one shape', () => {
    expect(joinMoney(moneyParts(false, '85.47', 'MXN'))).toBe('$85.47 MXN');
    expect(joinMoney(moneyParts(false, '85.47', 'USD'))).toBe('$85.47 USD');
  });
  it('uses each currency’s own symbol, and the code alone when it has none', () => {
    expect(joinMoney(moneyParts(false, '85.47', 'EUR'))).toBe('€85.47 EUR');
    expect(joinMoney(moneyParts(false, '85.47', 'BRL'))).toBe('R$85.47 BRL');
    expect(joinMoney(moneyParts(false, '85.47', 'CHF'))).toBe('85.47 CHF');
  });
  it('prints an unknown currency bare, never as dollars', () => {
    expect(joinMoney(moneyParts(false, '324', null))).toBe('324');
    expect(joinMoney(moneyParts(false, '324', 'pesos'))).toBe('324');
  });
  it('keeps the sign outside the symbol', () => {
    expect(joinMoney(moneyParts(true, '25.54', 'MXN'))).toBe('-$25.54 MXN');
  });
  it('moves the code to the column header for a table cell', () => {
    expect(joinMoneyInColumn(moneyParts(false, '99.57', 'MXN'))).toBe('$99.57');
    expect(joinMoneyInColumn(moneyParts(false, '99.57', null))).toBe('99.57');
  });
});

describe('splitMoney — the inverse, for a large figure that dims its units', () => {
  it('round-trips what joinMoney wrote', () => {
    for (const text of ['$85.47 MXN', '-$25.54 USD', '€1,200 EUR', '85.47 CHF', '$30.5K MXN']) {
      const parts = splitMoney(text);
      expect(parts).not.toBeNull();
      expect(joinMoney(parts as NonNullable<typeof parts>)).toBe(text);
    }
  });
  it('is null for text that is not money', () => {
    expect(splitMoney('27')).toBeNull();
    expect(splitMoney('22%')).toBeNull();
    expect(splitMoney('—')).toBeNull();
    expect(splitMoney('3/5')).toBeNull();
  });
});

describe('normalizeCurrency and currencyGlyph', () => {
  it('accepts a 3-letter code in any case and nothing else', () => {
    expect(normalizeCurrency(' mxn ')).toBe('MXN');
    expect(normalizeCurrency('')).toBeNull();
    expect(normalizeCurrency(undefined)).toBeNull();
  });
  it('answers the narrow symbol, or null', () => {
    expect(currencyGlyph('MXN')).toBe('$');
    expect(currencyGlyph('USD')).toBe('$');
    expect(currencyGlyph('CHF')).toBeNull();
  });
});
