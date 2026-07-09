import { describe, expect, test } from 'bun:test';
import { metaCurrencyOffset, toMinorUnits } from './currency';

describe('metaCurrencyOffset', () => {
  test('zero-decimal Meta currencies have no sub-unit', () => {
    for (const currency of ['JPY', 'KRW', 'VND', 'CLP', 'HUF']) {
      expect(metaCurrencyOffset(currency)).toBe(1);
    }
  });

  test('everything else is 100, including the Gulf dinars Meta does NOT treat as 3-decimal', () => {
    for (const currency of ['USD', 'EUR', 'GBP', 'BHD', 'KWD', 'TND']) {
      expect(metaCurrencyOffset(currency)).toBe(100);
    }
  });

  test('is case-insensitive', () => {
    expect(metaCurrencyOffset('jpy')).toBe(1);
    expect(metaCurrencyOffset('usd')).toBe(100);
  });

  test('an unknown or absent currency falls back to 100, never 1', () => {
    // Falling back to 1 would UNDER-state a USD budget by 100x in the ledger; falling back
    // to 100 keeps the common case correct and any error loud rather than silent.
    expect(metaCurrencyOffset(null)).toBe(100);
    expect(metaCurrencyOffset(undefined)).toBe(100);
    expect(metaCurrencyOffset('')).toBe(100);
    expect(metaCurrencyOffset('XXX')).toBe(100);
  });
});

describe('toMinorUnits', () => {
  test('scales by the account currency, not a hardcoded 100', () => {
    expect(toMinorUnits(60, 'USD')).toBe(6000);
    expect(toMinorUnits(60, 'JPY')).toBe(60);
  });

  test('rounds once at the boundary', () => {
    expect(toMinorUnits(12.345, 'USD')).toBe(1235);
    expect(toMinorUnits(0.005, 'USD')).toBe(1);
    expect(toMinorUnits(1234.6, 'KRW')).toBe(1235);
  });
});
