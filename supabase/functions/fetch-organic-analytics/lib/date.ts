import type { DateRange, RequestBody } from "./types.ts";

export function toYmd(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function parseDateRange(range: RequestBody["range"]): DateRange {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  let since: Date;
  let until: Date;

  switch (range.preset) {
    case "yesterday": {
      since = addDays(today, -1);
      until = addDays(today, -1);
      break;
    }
    case "previous_day": {
      since = addDays(today, -2);
      until = addDays(today, -2);
      break;
    }
    case "last_14d": {
      since = addDays(today, -14);
      until = addDays(today, -1);
      break;
    }
    case "last_30d": {
      since = addDays(today, -30);
      until = addDays(today, -1);
      break;
    }
    case "last_month": {
      const firstDayThisMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      since = new Date(Date.UTC(firstDayThisMonth.getUTCFullYear(), firstDayThisMonth.getUTCMonth() - 1, 1));
      until = addDays(firstDayThisMonth, -1);
      break;
    }
    case "custom": {
      if (!range.custom?.from || !range.custom?.to) {
        throw new Error("Custom range requires from and to");
      }
      since = new Date(`${range.custom.from}T00:00:00.000Z`);
      until = new Date(`${range.custom.to}T00:00:00.000Z`);
      break;
    }
    case "last_7d":
    default: {
      since = addDays(today, -7);
      until = addDays(today, -1);
      break;
    }
  }

  return {
    preset: range.preset,
    since: toYmd(since),
    until: toYmd(until),
    untilExclusive: toYmd(addDays(until, 1)),
  };
}
