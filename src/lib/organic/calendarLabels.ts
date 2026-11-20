/**
 * Calendar weekday and month labels in the reader's locale.
 *
 * The planner hard-coded 'en-US' and printed "WED" / "SAT" as plain text, so Chrome's page
 * translation read them as English words: Wed (marry) became "CASARSE", Sat (sat down)
 * "SESENTÓ". Labels now come from Intl in the browser's own locale, and every render site
 * marks them `translate="no"`, so a translated page still shows the real day name.
 */
import * as React from 'react';

/** The server has no reader; it renders en-US and the client corrects after hydration. */
const SERVER_LOCALE = 'en-US';
const subscribeNever = () => () => {};

export function usePlannerLocale(): string {
  return React.useSyncExternalStore(
    subscribeNever,
    () => navigator.language || SERVER_LOCALE,
    () => SERVER_LOCALE,
  );
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** A `YYYY-MM-DD` day id is read at local noon, so no zone offset moves it to another day. */
export function formatCalendarDate(
  day: string | Date,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, formatter);
  }
  return formatter.format(typeof day === 'string' ? new Date(`${day}T12:00:00`) : day);
}

/** Seven weekday names, Sunday first (`firstDay` 0) or Monday first (1). */
export function weekdayLabels(
  locale: string,
  firstDay: 0 | 1 = 0,
  width: 'short' | 'long' = 'short',
): string[] {
  // 2026-01-04 is a Sunday.
  return Array.from({ length: 7 }, (_, index) =>
    formatCalendarDate(new Date(2026, 0, 4 + index + firstDay, 12), locale, { weekday: width }),
  );
}
