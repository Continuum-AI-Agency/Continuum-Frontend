import { describe, expect, it } from 'bun:test';

import { completeDaysEndingYesterday, lastCompleteDays } from './reportingWindow';

// PP-L3-last-7d-asks-eight-days-including-today: the edge resolves `last_7d` as
// [now − 7d, now] in UTC — eight days, today among them, still being written. The
// figure a reader can hold against anything is the seven COMPLETE days ending yesterday,
// which is what the truth calculator (scripts/perfplus/oracles/metaTruth.ts) asks for.
describe('completeDaysEndingYesterday', () => {
  // The 2026-10-09 truth fixture: generated 10:10 UTC, Mexico City; last_7d = [10-02..10-08].
  it('is the seven complete days ending yesterday in the given calendar', () => {
    expect(
      completeDaysEndingYesterday(7, new Date('2026-10-09T10:10:14.894Z'), 'America/Mexico_City'),
    ).toEqual({ since: '2026-10-02', until: '2026-10-08' });
  });

  it('reads today in the calendar it is given, not in UTC', () => {
    // 03:00 UTC on the 10th is still the evening of the 9th in Mexico City.
    const now = new Date('2026-10-10T03:00:00.000Z');
    expect(completeDaysEndingYesterday(7, now, 'America/Mexico_City')).toEqual({
      since: '2026-10-02',
      until: '2026-10-08',
    });
    expect(completeDaysEndingYesterday(7, now, 'UTC')).toEqual({
      since: '2026-10-03',
      until: '2026-10-09',
    });
  });

  it('spans exactly N days for 14 and 30, crossing a month boundary', () => {
    const now = new Date('2026-10-09T12:00:00.000Z');
    expect(completeDaysEndingYesterday(14, now, 'UTC')).toEqual({
      since: '2026-09-25',
      until: '2026-10-08',
    });
    expect(completeDaysEndingYesterday(30, now, 'UTC')).toEqual({
      since: '2026-09-09',
      until: '2026-10-08',
    });
  });

  it('is handed to the edge as an explicit custom range, never as the preset', () => {
    expect(lastCompleteDays(7, new Date('2026-10-09T12:00:00.000Z'), 'UTC')).toEqual({
      preset: 'custom',
      since: '2026-10-02',
      until: '2026-10-08',
    });
  });
});
