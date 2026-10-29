/*
 * A `datetime-local` input speaks wall-clock time with no zone ("2026-11-01T09:00"); the
 * scaffold stores ISO-8601 WITH an offset, because Meta reads a bare time in the ad account's
 * zone, not the person's. So the input shows the stored instant in the browser's zone, and a
 * commit sends the browser's offset AT THAT DATE (DST moves it), never "Z" and never none.
 */

const pad = (value: number): string => String(Math.abs(value)).padStart(2, '0');

/** A stored ISO instant as the input's local wall-clock value; '' when unset or unreadable. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** The input's wall-clock value as ISO-8601 with the browser's offset; null when blank or invalid. */
export function localInputToIso(local: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local.trim());
  if (!match) return null;
  const date = new Date(local.trim());
  if (Number.isNaN(date.getTime())) return null;
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const [, year, month, day, hours, minutes] = match;
  return `${year}-${month}-${day}T${hours}:${minutes}:00${sign}${pad(Math.trunc(offset / 60))}:${pad(
    offset % 60,
  )}`;
}
