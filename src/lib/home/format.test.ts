import { describe, expect, test } from 'bun:test';
import { formatCount, formatFigure, formatMoney, formatRatio } from './format';

describe('Home locale formatting', () => {
  test('retains currency identity and precision when separators change', () => {
    expect(formatMoney(12.34, 'MXN', 'en')).toBe('$12.34 MXN');
    expect(formatMoney(12.34, 'MXN', 'pt-BR')).toBe('$12,34 MXN');
    expect(formatMoney(-1234.5, 'USD', 'pt-BR')).toBe('-$1.235 USD');
    expect(formatMoney(12.34, null, 'pt-BR')).toBe('12,34');
    expect(formatFigure(12.34, 'currency', 'USD', 'es')).toContain('USD');
  });

  test('localizes counts and ratios without changing their stored values', () => {
    const value = 1234.5;
    expect(formatCount(value, 'en')).toBe('1,235');
    expect(formatCount(value, 'pt-BR')).toBe('1.235');
    expect(formatRatio(1.235, 'pt-BR')).toBe('1,24x');
    expect(value).toBe(1234.5);
  });
});
