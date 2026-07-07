import { describe, expect, test } from 'bun:test';
import { formatRelativeTime, toEpochMs } from './relativeTime';

const NOW = Date.UTC(2026, 6, 6, 12, 0, 0); // 2026-07-06T12:00:00Z
const ago = (ms: number) => NOW - ms;

describe('formatRelativeTime', () => {
  test("under a minute reads 'just now'", () => {
    expect(formatRelativeTime(ago(30_000), NOW)).toBe('just now');
    expect(formatRelativeTime(NOW, NOW)).toBe('just now');
  });

  test('minutes, hours, days, weeks', () => {
    expect(formatRelativeTime(ago(5 * 60_000), NOW)).toBe('5m ago');
    expect(formatRelativeTime(ago(3 * 3_600_000), NOW)).toBe('3h ago');
    expect(formatRelativeTime(ago(2 * 86_400_000), NOW)).toBe('2d ago');
    expect(formatRelativeTime(ago(2 * 7 * 86_400_000), NOW)).toBe('2w ago');
  });

  test("future times read 'in ...'", () => {
    expect(formatRelativeTime(NOW + 10 * 60_000, NOW)).toBe('in 10m');
    expect(formatRelativeTime(NOW + 2 * 3_600_000, NOW)).toBe('in 2h');
  });

  test('older than ~4 weeks falls back to an absolute date', () => {
    const label = formatRelativeTime(ago(60 * 86_400_000), NOW);
    expect(label).not.toContain('ago');
    expect(label).toMatch(/May|Apr/); // ~2 months before 2026-07-06
  });

  test("invalid input is 'unknown'", () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('unknown');
  });

  test('toEpochMs accepts string, number, Date', () => {
    const d = new Date(NOW);
    expect(toEpochMs(d)).toBe(NOW);
    expect(toEpochMs(NOW)).toBe(NOW);
    expect(toEpochMs(d.toISOString())).toBe(NOW);
  });
});
