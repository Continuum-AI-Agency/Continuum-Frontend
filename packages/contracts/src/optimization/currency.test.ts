import { describe, expect, test } from 'bun:test';
import { formatMinorAmount, metaCurrencyOffset, toMinorUnits } from './currency';

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

// ICU separates a currency CODE from its number with a non-breaking space, and which
// codes render as a code rather than a symbol shifts between ICU versions. Normalizing
// keeps these assertions about the SCALE — the thing that was wrong — not typography.
const money = (value: string | null): string | null => value?.replace(/\u00a0/g, ' ') ?? null;

describe('formatMinorAmount', () => {
  test('renders on the scale the amount was RECORDED on, not the scale ICU guesses', () => {
    // HUF is zero-decimal at Meta and 2-decimal in ICU: an ICU-derived offset renders
    // 123_400 HUF as "HUF 1,234.00" — a hundredth of what the account actually moved.
    expect(money(formatMinorAmount(123_400, 'HUF'))).toBe('HUF 123,400');
    // KWD is 3-decimal in ICU and 2-decimal at Meta: ICU renders 5_000 as 5.000 KWD,
    // a tenth of the 50 KWD the ledger recorded.
    expect(money(formatMinorAmount(5_000, 'KWD'))).toBe('KWD 50.00');
  });

  test('the ordinary cases still read the ordinary way', () => {
    expect(money(formatMinorAmount(6_000, 'USD'))).toBe('$60.00');
    expect(money(formatMinorAmount(1_234, 'JPY'))).toBe('¥1,234');
  });

  test('a missing currency renders NO amount rather than a guessed one', () => {
    // Every live ad account records a null currency today. Falling back to USD is
    // invisible for an MXN account and 100x wrong for a JPY one.
    expect(formatMinorAmount(6_000, null)).toBeNull();
    expect(formatMinorAmount(6_000, undefined)).toBeNull();
    expect(formatMinorAmount(6_000, '')).toBeNull();
  });

  test('a missing or unusable amount renders nothing', () => {
    expect(formatMinorAmount(null, 'USD')).toBeNull();
    expect(formatMinorAmount(undefined, 'USD')).toBeNull();
    expect(formatMinorAmount(Number.NaN, 'USD')).toBeNull();
    expect(formatMinorAmount(6_000, 'DOLLARS')).toBeNull();
  });
});
