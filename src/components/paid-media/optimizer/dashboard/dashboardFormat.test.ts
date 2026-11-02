import { describe, expect, it } from 'bun:test';
import {
  axisMonthLabels,
  formatDay,
  formatMonth,
  formatMultiple,
  formatMxn,
  formatNumber,
  formatPct,
  formatTimestamp,
} from './dashboardFormat';

describe('dashboard number formatting', () => {
  it('groups digits for the locale and keeps pesos as pesos in both languages', () => {
    expect(formatNumber(2060, 'es')).toBe('2,060');
    expect(formatMxn(350000, 'es')).toBe('$350,000');
    expect(formatMxn(350000, 'en')).toBe('$350,000');
    expect(formatMxn(956.6, 'es')).toBe('$957');
  });

  it('writes a dash for a missing value instead of $0 or NaN', () => {
    expect(formatNumber(null, 'es')).toBe('—');
    expect(formatMxn(undefined, 'es')).toBe('—');
    expect(formatPct(Number.NaN, 'es')).toBe('—');
    expect(formatMultiple(null, 'es')).toBe('—');
  });

  it('formats percentages and multiples', () => {
    expect(formatPct(10.84, 'es')).toBe('10.8%');
    expect(formatPct(17, 'es', 0)).toBe('17%');
    expect(formatMultiple(4.43, 'en')).toBe('4.4x');
  });
});

describe('dashboard month and date formatting', () => {
  it('names a month in the dashboard language, with the year when asked', () => {
    expect(formatMonth('2026-01', 'es')).toBe('Ene');
    expect(formatMonth('2026-01', 'en')).toBe('Jan');
    expect(formatMonth('2025-11', 'es', { withYear: true })).toBe('Nov 25');
    expect(formatMonth('2026-11', 'es', { long: true })).toBe('Noviembre');
    expect(formatMonth('not-a-month', 'es')).toBe('not-a-month');
  });

  it('puts the year on the first label, every January and any repeated month name', () => {
    expect(axisMonthLabels(['2025-11', '2025-12', '2026-01', '2026-02'], 'es')).toEqual([
      'Nov 25',
      'Dic',
      'Ene 26',
      'Feb',
    ]);
    expect(axisMonthLabels(['2025-11', '2025-12', '2026-11', '2026-12'], 'es')).toEqual([
      'Nov 25',
      'Dic 25',
      'Nov 26',
      'Dic 26',
    ]);
  });

  it('writes a source day and the update stamp in Mexico City time', () => {
    expect(formatDay('2026-11-01', 'es')).toBe('1 nov');
    expect(formatDay('2026-11-01', 'en')).toBe('Nov 1');
    expect(formatTimestamp('2026-11-01T13:40:00Z', 'es', 'America/Mexico_City')).toContain('07:40');
  });
});
