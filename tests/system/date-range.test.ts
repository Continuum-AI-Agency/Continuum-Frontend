import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_DATE_RANGE_DAYS, getDateRangeFromDays } from "@/lib/dco/dateRange";

test("DEFAULT_DATE_RANGE_DAYS is 7", () => {
  assert.equal(DEFAULT_DATE_RANGE_DAYS, 7);
});

test("getDateRangeFromDays returns ISO dates based on provided days", () => {
  const now = new Date("2024-01-08T00:00:00.000Z");
  const result = getDateRangeFromDays(7, now);

  assert.equal(result.dateTo, "2024-01-08T00:00:00.000Z");
  assert.equal(result.dateFrom, "2024-01-01T00:00:00.000Z");
});

test("getDateRangeFromDays handles 30 day ranges", () => {
  const now = new Date("2024-02-15T12:00:00.000Z");
  const result = getDateRangeFromDays(30, now);

  assert.equal(result.dateTo, "2024-02-15T12:00:00.000Z");
  assert.equal(result.dateFrom, "2024-01-16T12:00:00.000Z");
});
