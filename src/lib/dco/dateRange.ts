export const DEFAULT_DATE_RANGE_DAYS = 7 as const;

export type DateRangeDays = 7 | 30;

export function getDateRangeFromDays(days: number, now: Date = new Date()) {
  const dateTo = now;
  const dateFrom = new Date(dateTo.getTime() - days * 24 * 60 * 60 * 1000);

  return {
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
  };
}
