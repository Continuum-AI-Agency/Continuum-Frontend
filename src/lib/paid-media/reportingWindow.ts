// The window a paid-media figure is asked for.
//
// The reporting edge resolves a rolling preset on the clock — `last_7d` is [now − 7 days, now]
// in UTC: eight calendar days, and the eighth is today, still being written. A figure over that
// span cannot be held against anything: the truth calculator, Meta's own `last_7d`, and the
// Optimizer's engine windows all mean the seven COMPLETE days ending yesterday. So the
// Dashboard and the Home never send the preset; they send the complete days as an explicit
// range, which every hop (the /api/paid-metrics route, paid-media-reporting, the Meta, Google
// and LinkedIn handlers, the campaign cache key) already accepts verbatim.
//
// "Yesterday" is a calendar day in a zone, not a clock offset — this is the same arithmetic the
// truth calculator uses. The ad account's own zone (Meta dates every row in it) is not carried
// to the browser today, so the caller's default is the viewer's calendar.

import type { PaidMetricsRange } from '@/lib/schemas/paidMetrics';

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The calendar day `now` falls on in `timeZone` (the runtime's zone when omitted). */
export function calendarDayIn(now: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Shift a `YYYY-MM-DD` day by `days` as pure calendar arithmetic (no clock, no DST). */
export function shiftDay(day: string, days: number): string {
  const match = DAY_RE.exec(day);
  if (!match) throw new Error(`shiftDay: not a day: ${day}`);
  const [, y, m, d] = match;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + days)).toISOString().slice(0, 10);
}

/** The `days` complete days ending yesterday, inclusive on both ends. */
export function completeDaysEndingYesterday(
  days: number,
  now: Date = new Date(),
  timeZone?: string,
): { since: string; until: string } {
  const until = shiftDay(calendarDayIn(now, timeZone), -1);
  return { since: shiftDay(until, -(days - 1)), until };
}

/** The same window in the shape the reporting edge is asked with. */
export function lastCompleteDays(
  days: number,
  now: Date = new Date(),
  timeZone?: string,
): Extract<PaidMetricsRange, { preset: 'custom' }> {
  return { preset: 'custom', ...completeDaysEndingYesterday(days, now, timeZone) };
}
