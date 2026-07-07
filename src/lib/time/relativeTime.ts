// One canonical "time ago" formatter for the whole app. Replaces the ~8
// hand-rolled formatRelativeTime/formatRelativeDate copies. Pure and now-injectable
// so it is trivially testable and safe in Server Components. (The Kibo
// relative-time component is a live multi-timezone clock — a different job — and
// stays reserved for scheduling / "best time to post" surfaces.)

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function toEpochMs(input: string | number | Date): number {
  if (input instanceof Date) return input.getTime();
  if (typeof input === 'number') return input;
  return new Date(input).getTime();
}

/**
 * Compact relative time: "just now", "5m ago", "3h ago", "2d ago", "3w ago",
 * "in 10m" for the future, and an absolute short date once older than ~4 weeks
 * (year shown only when it differs from the reference year).
 */
export function formatRelativeTime(
  input: string | number | Date,
  now: number = Date.now(),
): string {
  const then = toEpochMs(input);
  if (!Number.isFinite(then)) return 'unknown';

  const diff = now - then;
  const past = diff >= 0;
  const abs = Math.abs(diff);

  if (abs < MINUTE) return 'just now';

  const label = (value: number, unit: string) =>
    past ? `${value}${unit} ago` : `in ${value}${unit}`;

  if (abs < HOUR) return label(Math.round(abs / MINUTE), 'm');
  if (abs < DAY) return label(Math.round(abs / HOUR), 'h');
  if (abs < WEEK) return label(Math.round(abs / DAY), 'd');
  if (abs < 4 * WEEK) return label(Math.round(abs / WEEK), 'w');

  const sameYear = new Date(then).getFullYear() === new Date(now).getFullYear();
  return new Date(then).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
}
