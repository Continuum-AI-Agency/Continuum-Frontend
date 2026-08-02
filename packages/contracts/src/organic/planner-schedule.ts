import { z } from 'zod';

/**
 * The Planner's day / time-of-day / timezone vocabulary — the ONE normalization
 * both the browser planner and the MCP `planner_manage` umbrella schedule with.
 *
 * Why it is shared rather than duplicated: a drag in the UI and a
 * `planner_manage action=reschedule_many` call must land a draft on the same
 * instant. Both must keep the chip's time-of-day, both must resolve that
 * time-of-day in the same zone, and both must floor a past target into the
 * future — `organic.organic_calendar_drafts.scheduled_date` is a full
 * timestamptz written verbatim (no server-side re-normalization), so a value in
 * the past makes the scheduled-publish poller fire the moment the row lands.
 *
 * Everything here is pure and isomorphic: no Date-parsing of loose strings, no
 * dependence on the host's local zone unless a caller omits `timeZone`.
 */

/** A past target floors to this far into the future rather than publishing instantly. */
export const PLANNER_PAST_GUARD_FLOOR_MS = 5 * 60 * 1000;

/**
 * The hour a draft lands on when nobody has chosen one.
 *
 * Every path that creates a draft has to agree on this. They previously did not:
 * manual creation used `9:00 AM`, the AI composer hardcoded noon UTC (a different
 * wall-clock hour in every zone), a trend drop used `09:00`, and the browser
 * autosave wrote a date with no time at all — which Postgres coerced to midnight
 * and the panel then rendered back as "12:00 AM", the worst possible posting time.
 */
export const PLANNER_DEFAULT_TIME_OF_DAY: PlannerTimeOfDay = '09:00';

/** The Planner's day identity: a bare calendar day, `YYYY-MM-DD`. */
export const plannerDayIdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'day must be YYYY-MM-DD');
export type PlannerDayId = z.infer<typeof plannerDayIdSchema>;

/** Canonical time-of-day on the wire: 24-hour `HH:mm`. */
export const plannerTimeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time_of_day must be HH:mm (24-hour)');
export type PlannerTimeOfDay = z.infer<typeof plannerTimeOfDaySchema>;

export function isValidPlannerTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** An IANA zone the host's Intl database actually knows. */
export const plannerTimeZoneSchema = z
  .string()
  .min(1)
  .refine(isValidPlannerTimeZone, { message: 'unknown IANA time zone' });

export interface PlannerClock {
  hour: number;
  minute: number;
}

const TWENTY_FOUR_HOUR = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const TWELVE_HOUR = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i;
const TWELVE_HOUR_NO_MINUTES = /^(0?[1-9]|1[0-2])\s*(AM|PM)$/i;

/**
 * Accepts every time shape the Planner carries: the canonical `HH:mm`, the
 * chip's display label (`5:00 PM`), and the bare-hour label (`5 PM`).
 */
export function parsePlannerTimeOfDay(value: string | null | undefined): PlannerClock | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();

  const twelve = TWELVE_HOUR.exec(trimmed);
  if (twelve) {
    const hour = Number(twelve[1]) % 12;
    return {
      hour: /pm/i.test(twelve[3] as string) ? hour + 12 : hour,
      minute: Number(twelve[2]),
    };
  }

  const bareHour = TWELVE_HOUR_NO_MINUTES.exec(trimmed);
  if (bareHour) {
    const hour = Number(bareHour[1]) % 12;
    return { hour: /pm/i.test(bareHour[2] as string) ? hour + 12 : hour, minute: 0 };
  }

  const twentyFour = TWENTY_FOUR_HOUR.exec(trimmed);
  if (twentyFour) return { hour: Number(twentyFour[1]), minute: Number(twentyFour[2]) };

  return null;
}

export function formatPlannerTimeOfDay(clock: PlannerClock): PlannerTimeOfDay {
  const hour = String(clock.hour).padStart(2, '0');
  const minute = String(clock.minute).padStart(2, '0');
  return `${hour}:${minute}`;
}

/**
 * `17:30` as the planner's display label, `5:30 PM`.
 *
 * Shared because the browser previously derived this label by slicing an ISO
 * string's literal `HH:MM` — i.e. reading a UTC wall clock — so every draft stored
 * as a `+00` timestamptz rendered in the wrong zone, and a midnight one rendered
 * as the notorious "12:00 AM".
 */
export function toPlannerTimeLabel(timeOfDay: string | null | undefined): string {
  const clock = parsePlannerTimeOfDay(timeOfDay) ?? { hour: 9, minute: 0 };
  const suffix = clock.hour >= 12 ? 'PM' : 'AM';
  const hour = clock.hour % 12 || 12;
  return `${hour}:${String(clock.minute).padStart(2, '0')} ${suffix}`;
}

interface PlannerDayParts {
  year: number;
  month: number;
  day: number;
}

export function parsePlannerDayId(dayId: string): PlannerDayParts | null {
  if (!plannerDayIdSchema.safeParse(dayId).success) return null;
  const [year, month, day] = dayId.split('-').map(Number) as [number, number, number];
  // Reject impossible civil dates (2026-02-31) that the regex lets through.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() + 1 !== month) return null;
  if (probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function resolvePlannerTimeZone(timeZone?: string | null): string {
  if (timeZone && isValidPlannerTimeZone(timeZone)) return timeZone;
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

interface ZonedFields extends PlannerDayParts, PlannerClock {
  second: number;
}

function zonedFields(instantMs: number, timeZone: string): ZonedFields {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instantMs));
  const read = (type: string): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number(found.value) : 0;
  };
  // Some ICU builds render midnight as hour 24 under hour12:false.
  const hour = read('hour') % 24;
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour,
    minute: read('minute'),
    second: read('second'),
  };
}

/** Zone offset (ms) in effect at an instant: `zoneWallClockAsUtc - instant`. */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const fields = zonedFields(instantMs, timeZone);
  const asUtc = Date.UTC(
    fields.year,
    fields.month - 1,
    fields.day,
    fields.hour,
    fields.minute,
    fields.second,
  );
  return asUtc - instantMs;
}

export interface PlannerInstantInput {
  dayId: string;
  /** `HH:mm`, a `5:00 PM` chip label, or `5 PM`. Defaults to 09:00 when absent. */
  timeOfDay?: string | null;
  /** IANA zone. Omitted → the host's resolved zone (the browser's, in the UI). */
  timeZone?: string | null;
}

/**
 * The instant a `(day, time-of-day)` pair names in a zone, as an ISO string.
 *
 * Two-pass offset resolution: guess the offset at the naive UTC reading, correct
 * with the offset actually in effect at the candidate instant. That is what makes
 * a DST boundary land on the wall-clock time the planner shows instead of an hour
 * either side of it.
 */
export function plannerInstantFromDayTime(input: PlannerInstantInput): string | null {
  const day = parsePlannerDayId(input.dayId);
  if (!day) return null;
  const clock = parsePlannerTimeOfDay(input.timeOfDay ?? '09:00') ?? { hour: 9, minute: 0 };
  const timeZone = resolvePlannerTimeZone(input.timeZone);

  const naive = Date.UTC(day.year, day.month - 1, day.day, clock.hour, clock.minute, 0, 0);
  const firstOffset = zoneOffsetMs(naive, timeZone);
  const candidate = naive - firstOffset;
  const secondOffset = zoneOffsetMs(candidate, timeZone);
  const resolved = firstOffset === secondOffset ? candidate : naive - secondOffset;
  return new Date(resolved).toISOString();
}

/**
 * The instant a day's DEFAULT posting time names in a zone, floored into the
 * future. The one composition every "create a draft on this day" path uses, so a
 * manual create, an AI-composer create and a trend drop all land on the same hour.
 */
export function plannerDefaultInstant(
  dayId: string,
  timeZone?: string | null,
  options: PlannerFutureFloorOptions = {},
): string | null {
  const composed = plannerInstantFromDayTime({
    dayId,
    timeOfDay: PLANNER_DEFAULT_TIME_OF_DAY,
    timeZone,
  });
  return composed ? applyPlannerFutureFloor(composed, options) : null;
}

/** The wall-clock `HH:mm` an instant reads as in a zone. */
export function plannerTimeOfDayInZone(
  iso: string,
  timeZone?: string | null,
): PlannerTimeOfDay | null {
  const instant = Date.parse(iso);
  if (!Number.isFinite(instant)) return null;
  const fields = zonedFields(instant, resolvePlannerTimeZone(timeZone));
  return formatPlannerTimeOfDay({ hour: fields.hour, minute: fields.minute });
}

/** The calendar day an instant falls on in a zone. */
export function plannerDayIdInZone(iso: string, timeZone?: string | null): PlannerDayId | null {
  const instant = Date.parse(iso);
  if (!Number.isFinite(instant)) return null;
  const fields = zonedFields(instant, resolvePlannerTimeZone(timeZone));
  const month = String(fields.month).padStart(2, '0');
  const day = String(fields.day).padStart(2, '0');
  return `${fields.year}-${month}-${day}`;
}

export interface PlannerFutureFloorOptions {
  nowMs?: number;
  floorMs?: number;
}

/**
 * Floor a target that lands in the past to a safe distance ahead of now. A
 * scheduled draft whose `scheduled_date` is already behind the clock is picked up
 * by the publish poller on its next tick — the user meant "move it", not
 * "publish it now".
 */
export function applyPlannerFutureFloor(
  iso: string,
  options: PlannerFutureFloorOptions = {},
): string {
  const target = Date.parse(iso);
  if (!Number.isFinite(target)) return iso;
  const now = options.nowMs ?? Date.now();
  const floor = options.floorMs ?? PLANNER_PAST_GUARD_FLOOR_MS;
  return target < now ? new Date(now + floor).toISOString() : new Date(target).toISOString();
}

export interface PlannerMoveInput {
  /** The draft's current `scheduled_date`; its time-of-day is what gets preserved. */
  fromIso?: string | null;
  targetDayId: string;
  timeZone?: string | null;
  /** Explicit override — when absent, the current time-of-day carries over. */
  timeOfDay?: string | null;
  nowMs?: number;
}

export interface PlannerMove {
  scheduledAt: string;
  timeOfDay: PlannerTimeOfDay;
  timeZone: string;
  /** true when the composed instant was in the past and got floored forward. */
  floored: boolean;
}

/**
 * Move a draft to another day keeping its time-of-day — the single operation
 * behind both a planner drag and `planner_manage action=reschedule`.
 */
export function movePlannerDraftToDay(input: PlannerMoveInput): PlannerMove | null {
  const timeZone = resolvePlannerTimeZone(input.timeZone);
  const carried =
    (input.timeOfDay ? parsePlannerTimeOfDay(input.timeOfDay) : null) ??
    (input.fromIso ? parsePlannerTimeOfDay(plannerTimeOfDayInZone(input.fromIso, timeZone)) : null);
  const clock = carried ?? { hour: 9, minute: 0 };
  const timeOfDay = formatPlannerTimeOfDay(clock);

  const composed = plannerInstantFromDayTime({
    dayId: input.targetDayId,
    timeOfDay,
    timeZone,
  });
  if (!composed) return null;

  const scheduledAt = applyPlannerFutureFloor(composed, { nowMs: input.nowMs });
  return { scheduledAt, timeOfDay, timeZone, floored: scheduledAt !== composed };
}
