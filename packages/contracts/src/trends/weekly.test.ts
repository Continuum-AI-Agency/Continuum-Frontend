import { describe, expect, it } from 'bun:test';
import { currentWeekStartDateUtc, currentWeekStartUtc } from './weekly';

// 2024-01-01 is a Monday, so its week runs Mon 2024-01-01 .. Sun 2024-01-07.
describe('currentWeekStartUtc', () => {
  it('returns the same Monday for every day in the week', () => {
    const cases: Array<[string, string]> = [
      ['2024-01-01T00:00:00Z', '2024-01-01'], // Monday
      ['2024-01-03T12:34:56Z', '2024-01-01'], // Wednesday
      ['2024-01-07T23:59:59Z', '2024-01-01'], // Sunday (end of week)
      ['2024-01-08T00:00:00Z', '2024-01-08'], // next Monday rolls over
    ];
    for (const [input, expected] of cases) {
      expect(currentWeekStartDateUtc(new Date(input))).toBe(expected);
    }
  });

  it('anchors to 00:00:00 UTC', () => {
    const monday = currentWeekStartUtc(new Date('2024-01-03T12:34:56Z'));
    expect(monday.toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });
});
