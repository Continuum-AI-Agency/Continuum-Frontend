import { describe, expect, it } from 'bun:test';
import { clockTime, dayLabel, groupByDay } from './feedTimeline';

const NOW = new Date(2026, 9, 9, 15, 30);
const at = (month: number, day: number, hour = 8, minute = 0, year = 2026) =>
  new Date(year, month, day, hour, minute).toISOString();

describe('the feed timeline', () => {
  it('names today and yesterday, and dates the rest', () => {
    expect(dayLabel(at(9, 9, 0, 5), NOW)).toBe('Today');
    expect(dayLabel(at(9, 8, 23, 59), NOW)).toBe('Yesterday');
    expect(dayLabel(at(9, 3), NOW)).toBe('Oct 3');
    expect(dayLabel(at(11, 30, 8, 0, 2025), NOW)).toBe('Dec 30, 2025');
    expect(dayLabel('not a date', NOW)).toBe('Undated');
  });

  it('prints a 24-hour clock time', () => {
    expect(clockTime(at(9, 9, 8, 0))).toBe('08:00');
    expect(clockTime(at(9, 9, 21, 13))).toBe('21:13');
    expect(clockTime(at(9, 9, 0, 7))).toBe('00:07');
  });

  it('groups consecutive events by day without reordering them', () => {
    const rows = [at(9, 9, 8), at(9, 9, 7), at(9, 8, 21), at(9, 3, 18)];
    const groups = groupByDay(rows, (ts) => ts, NOW);
    expect(groups.map((group) => [group.label, group.items.length])).toEqual([
      ['Today', 2],
      ['Yesterday', 1],
      ['Oct 3', 1],
    ]);
  });
});
