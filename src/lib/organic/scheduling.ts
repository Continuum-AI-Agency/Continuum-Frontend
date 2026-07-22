const TIME_LABEL_PATTERN = /^(0?[1-9]|1[0-2]):([0-5]\d)\s?(AM|PM)$/i;
const LOCAL_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export type ParsedTimeLabel = {
  hour24: number;
  minute: number;
};

export function parseTimeLabel(value: string): ParsedTimeLabel | null {
  const trimmed = value.trim();
  const match = trimmed.match(TIME_LABEL_PATTERN);
  if (!match) return null;

  const hour12 = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  const meridiem = match[3].toUpperCase();

  if (!Number.isFinite(hour12) || !Number.isFinite(minute)) return null;

  let hour24 = hour12 % 12;
  if (meridiem === 'PM') hour24 += 12;

  return { hour24, minute };
}

export function isValidTimeLabel(value: string): boolean {
  return parseTimeLabel(value) !== null;
}

export function normalizeTimeLabel(value: string): string | null {
  const parsed = parseTimeLabel(value);
  if (!parsed) return null;

  const hour12 = parsed.hour24 % 12 || 12;
  const meridiem = parsed.hour24 >= 12 ? 'PM' : 'AM';
  const minutes = String(parsed.minute).padStart(2, '0');
  return `${hour12}:${minutes} ${meridiem}`;
}

export function parseLocalDateTime(value: string): Date | null {
  const trimmed = value.trim();
  if (!LOCAL_DATETIME_PATTERN.test(trimmed)) return null;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function isFutureLocalDateTime(value: string, now = new Date()): boolean {
  const parsed = parseLocalDateTime(value);
  if (!parsed) return false;
  const normalizedNow = new Date(now);
  normalizedNow.setSeconds(0, 0);
  return parsed.getTime() >= normalizedNow.getTime();
}

export function getNowLocalDateTimeInputValue(now = new Date()): string {
  const normalized = new Date(now);
  normalized.setSeconds(0, 0);

  const year = normalized.getFullYear();
  const month = String(normalized.getMonth() + 1).padStart(2, '0');
  const day = String(normalized.getDate()).padStart(2, '0');
  const hours = String(normalized.getHours()).padStart(2, '0');
  const minutes = String(normalized.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
