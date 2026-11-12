import { formatAutomationWallClock } from './wall-clock';
// Schedule helpers for the Automations UI: preset -> cron canonicalization,
// human-readable schedule sentences, next-fire-time previews, and cron
// validation. croner owns occurrence math (IANA timezone + DST aware) so the
// client preview matches the backend scheduler exactly.

import type { AutomationSchedule } from '@continuum/contracts';
import { Cron } from 'croner';
import type { useTranslations } from 'next-intl';

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const FALLBACK_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
];

export function scheduleToCronExpression(schedule: AutomationSchedule): string {
  if (schedule.kind === 'cron') return schedule.expr;
  const [hour, minute] = schedule.time.split(':').map(Number);
  if (schedule.kind === 'daily') return `${minute} ${hour} * * *`;
  if (schedule.kind === 'weekly') return `${minute} ${hour} * * ${schedule.dayOfWeek}`;
  return `${minute} ${hour} ${schedule.dayOfMonth} * *`;
}

export function validateCron(expression: string): { ok: true } | { ok: false; reason: string } {
  try {
    new Cron(expression);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'Invalid cron expression' };
  }
}

export function nextRunTimes(schedule: AutomationSchedule, count = 3): Date[] {
  try {
    const cron = new Cron(scheduleToCronExpression(schedule), { timezone: schedule.timezone });
    return cron.nextRuns(count);
  } catch {
    return [];
  }
}

function formatClockTime(time: string): string {
  const [hourRaw, minute] = time.split(':');
  const hour = Number(hourRaw);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${minute} ${suffix}`;
}

export function describeSchedule(
  schedule: AutomationSchedule,
  locale = 'en',
  translate?: ReturnType<typeof useTranslations<'automations'>>,
): string {
  if (translate) {
    if (schedule.kind === 'cron')
      return translate('scheduleCron', { expression: schedule.expr, timezone: schedule.timezone });
    const time = formatAutomationWallClock(schedule.time, locale);
    const values = { time, timezone: schedule.timezone };
    if (schedule.kind === 'daily') return translate('scheduleDaily', values);
    if (schedule.kind === 'monthly')
      return translate('scheduleMonthly', { ...values, day: schedule.dayOfMonth });
    const day = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2024, 0, 7 + schedule.dayOfWeek)),
    );
    return translate('scheduleWeekly', { ...values, day });
  }
  switch (schedule.kind) {
    case 'daily':
      return `Daily at ${formatClockTime(schedule.time)} (${schedule.timezone})`;
    case 'weekly':
      return `Weekly on ${DAY_NAMES[schedule.dayOfWeek]} at ${formatClockTime(schedule.time)} (${schedule.timezone})`;
    case 'monthly':
      return `Monthly on day ${schedule.dayOfMonth} at ${formatClockTime(schedule.time)} (${schedule.timezone})`;
    case 'cron':
      return `Custom cron "${schedule.expr}" (${schedule.timezone})`;
  }
}

export function formatInTimezone(date: Date, timeZone: string, locale?: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString(locale);
  }
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

let cachedTimezones: string[] | null = null;

export function listTimezones(): string[] {
  if (cachedTimezones) return cachedTimezones;
  cachedTimezones =
    typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : FALLBACK_TIMEZONES;
  return cachedTimezones;
}
