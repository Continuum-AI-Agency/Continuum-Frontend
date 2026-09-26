import { describe, expect, test } from 'bun:test';

import {
  formatPostedDayId,
  formatPostedTimeLabel,
  getVisibleMonthRange,
  getWeekRange,
  shouldFetchExternalCalendarPosts,
} from '@/lib/organic/calendar-posts';

describe('organic calendar posts helpers', () => {
  test('returns the full visible month grid range', () => {
    const range = getVisibleMonthRange(new Date(2026, 3, 15));

    expect(range).toEqual({
      start: '2026-03-29',
      end: '2026-05-02',
    });
  });

  test('returns a seven day week range', () => {
    const range = getWeekRange(new Date(2026, 3, 27));

    expect(range).toEqual({
      start: '2026-04-27',
      end: '2026-05-03',
    });
  });

  test('keeps an explicitly database-only posted-content request off provider fetches', () => {
    expect(shouldFetchExternalCalendarPosts({ databaseCount: 0, includeExternal: false })).toBe(
      false,
    );
    expect(shouldFetchExternalCalendarPosts({ databaseCount: 0 })).toBe(true);
    expect(shouldFetchExternalCalendarPosts({ databaseCount: 1 })).toBe(false);
    expect(shouldFetchExternalCalendarPosts({ databaseCount: 1, includeExternal: true })).toBe(
      true,
    );
  });

  test('formats posted timestamps as time labels', () => {
    expect(formatPostedTimeLabel('2026-04-27T16:05:00.000Z')).toMatch(/\d{1,2}:05\s?(AM|PM)/);
  });

  test('uses the brand timezone across a UTC day boundary', () => {
    expect(formatPostedDayId('2026-04-28T01:05:00.000Z', 'America/Denver')).toBe('2026-04-27');
    expect(formatPostedTimeLabel('2026-04-28T01:05:00.000Z', 'America/Denver')).toBe('7:05 PM');
  });

  test('keeps the posted day through the spring daylight saving jump', () => {
    const zone = 'America/Denver';
    expect(formatPostedDayId('2026-03-08T08:59:00.000Z', zone)).toBe('2026-03-08');
    expect(formatPostedTimeLabel('2026-03-08T08:59:00.000Z', zone)).toBe('1:59 AM');
    expect(formatPostedDayId('2026-03-08T09:01:00.000Z', zone)).toBe('2026-03-08');
    expect(formatPostedTimeLabel('2026-03-08T09:01:00.000Z', zone)).toBe('3:01 AM');
  });
});
