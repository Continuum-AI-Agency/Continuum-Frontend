import { describe, expect, it } from 'bun:test';
import { formatDecimal } from './decimal';

describe('localized decimals', () => {
  it('retains existing rounding and trailing precision in all launch locales', () => {
    expect(formatDecimal(1.005, 2, 'en')).toBe('1.00');
    expect(formatDecimal(1.005, 2, 'pt-BR')).toBe('1,00');
    expect(formatDecimal(-12.345, 2, 'es')).toBe('-12,35');
    expect(formatDecimal(1234.5, 2, 'pt-BR')).toBe('1234,50');
    expect(formatDecimal(1.2, 0, 'en')).toBe('1');
  });
});
