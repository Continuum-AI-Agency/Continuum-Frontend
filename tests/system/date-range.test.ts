import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_DATE_RANGE_DAYS, getDateRangeFromDays } from '@/lib/dco/dateRange';

// The DCO action log opened on 7 days until `feat(dco): enrich action log details`
// (bacccac5) widened the default window to 30 — a week of actions was too thin a slice
// to read a trend from. 7 is still a valid `DateRangeDays`, just no longer the default.
test('DEFAULT_DATE_RANGE_DAYS is 30', () => {
  assert.equal(DEFAULT_DATE_RANGE_DAYS, 30);
});

test('getDateRangeFromDays returns ISO dates based on provided days', () => {
  const now = new Date('2024-01-08T00:00:00.000Z');
  const result = getDateRangeFromDays(7, now);

  assert.equal(result.dateTo, '2024-01-08T00:00:00.000Z');
  assert.equal(result.dateFrom, '2024-01-01T00:00:00.000Z');
});

test('getDateRangeFromDays handles 30 day ranges', () => {
  const now = new Date('2024-02-15T12:00:00.000Z');
  const result = getDateRangeFromDays(30, now);

  assert.equal(result.dateTo, '2024-02-15T12:00:00.000Z');
  assert.equal(result.dateFrom, '2024-01-16T12:00:00.000Z');
});
