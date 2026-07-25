import { describe, expect, it } from 'bun:test';
import {
  applyPlannerFutureFloor,
  formatPlannerTimeOfDay,
  isValidPlannerTimeZone,
  movePlannerDraftToDay,
  PLANNER_PAST_GUARD_FLOOR_MS,
  parsePlannerDayId,
  parsePlannerTimeOfDay,
  plannerDayIdInZone,
  plannerInstantFromDayTime,
  plannerTimeOfDayInZone,
  plannerTimeOfDaySchema,
  plannerTimeZoneSchema,
} from './planner-schedule';

describe('parsePlannerTimeOfDay', () => {
  it('reads the canonical 24-hour form', () => {
    expect(parsePlannerTimeOfDay('17:30')).toEqual({ hour: 17, minute: 30 });
    expect(parsePlannerTimeOfDay('00:00')).toEqual({ hour: 0, minute: 0 });
    expect(parsePlannerTimeOfDay('9:05')).toEqual({ hour: 9, minute: 5 });
  });

  it('reads the planner chip label', () => {
    expect(parsePlannerTimeOfDay('5:00 PM')).toEqual({ hour: 17, minute: 0 });
    expect(parsePlannerTimeOfDay('12:00 AM')).toEqual({ hour: 0, minute: 0 });
    expect(parsePlannerTimeOfDay('12:30 PM')).toEqual({ hour: 12, minute: 30 });
    expect(parsePlannerTimeOfDay('7 AM')).toEqual({ hour: 7, minute: 0 });
  });

  it('returns null for junk instead of guessing', () => {
    expect(parsePlannerTimeOfDay('half past five')).toBeNull();
    expect(parsePlannerTimeOfDay('25:00')).toBeNull();
    expect(parsePlannerTimeOfDay('')).toBeNull();
    expect(parsePlannerTimeOfDay(null)).toBeNull();
  });
});

describe('formatPlannerTimeOfDay', () => {
  it('always pads to HH:mm', () => {
    expect(formatPlannerTimeOfDay({ hour: 9, minute: 5 })).toBe('09:05');
    expect(
      plannerTimeOfDaySchema.safeParse(formatPlannerTimeOfDay({ hour: 0, minute: 0 })).success,
    ).toBe(true);
  });
});

describe('parsePlannerDayId', () => {
  it('accepts a real calendar day', () => {
    expect(parsePlannerDayId('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it('rejects a shape-valid but impossible day', () => {
    expect(parsePlannerDayId('2026-02-31')).toBeNull();
    expect(parsePlannerDayId('2026-13-01')).toBeNull();
    expect(parsePlannerDayId('2026-7-1')).toBeNull();
  });
});

describe('plannerInstantFromDayTime', () => {
  it('composes a UTC instant', () => {
    expect(
      plannerInstantFromDayTime({ dayId: '2026-08-01', timeOfDay: '17:00', timeZone: 'UTC' }),
    ).toBe('2026-08-01T17:00:00.000Z');
  });

  it('composes a zoned instant with the offset in effect on that day', () => {
    // America/New_York is UTC-4 in August (EDT) and UTC-5 in January (EST).
    expect(
      plannerInstantFromDayTime({
        dayId: '2026-08-01',
        timeOfDay: '17:00',
        timeZone: 'America/New_York',
      }),
    ).toBe('2026-08-01T21:00:00.000Z');
    expect(
      plannerInstantFromDayTime({
        dayId: '2026-01-15',
        timeOfDay: '17:00',
        timeZone: 'America/New_York',
      }),
    ).toBe('2026-01-15T22:00:00.000Z');
  });

  it('lands the wall-clock time on the far side of a DST spring-forward', () => {
    // 2026-03-08 is the US spring-forward. 09:00 local is EDT (UTC-4) already.
    expect(
      plannerInstantFromDayTime({
        dayId: '2026-03-08',
        timeOfDay: '09:00',
        timeZone: 'America/New_York',
      }),
    ).toBe('2026-03-08T13:00:00.000Z');
  });

  it('defaults to 09:00 and rejects an impossible day', () => {
    expect(plannerInstantFromDayTime({ dayId: '2026-08-01', timeZone: 'UTC' })).toBe(
      '2026-08-01T09:00:00.000Z',
    );
    expect(plannerInstantFromDayTime({ dayId: 'not-a-day', timeZone: 'UTC' })).toBeNull();
  });
});

describe('plannerTimeOfDayInZone / plannerDayIdInZone', () => {
  it('round-trips an instant back to the wall clock that produced it', () => {
    const iso = plannerInstantFromDayTime({
      dayId: '2026-08-01',
      timeOfDay: '17:00',
      timeZone: 'America/New_York',
    });
    expect(iso).not.toBeNull();
    expect(plannerTimeOfDayInZone(iso as string, 'America/New_York')).toBe('17:00');
    expect(plannerDayIdInZone(iso as string, 'America/New_York')).toBe('2026-08-01');
  });

  it('shows the same instant on a different day in a different zone', () => {
    // 21:00 UTC on 2026-08-01 is already 2026-08-02 in Tokyo.
    expect(plannerDayIdInZone('2026-08-01T21:00:00.000Z', 'Asia/Tokyo')).toBe('2026-08-02');
    expect(plannerTimeOfDayInZone('2026-08-01T21:00:00.000Z', 'Asia/Tokyo')).toBe('06:00');
  });

  it('returns null for an unparseable instant', () => {
    expect(plannerTimeOfDayInZone('nope', 'UTC')).toBeNull();
    expect(plannerDayIdInZone('nope', 'UTC')).toBeNull();
  });
});

describe('applyPlannerFutureFloor', () => {
  const now = Date.parse('2026-08-01T12:00:00.000Z');

  it('leaves a future instant alone', () => {
    expect(applyPlannerFutureFloor('2026-08-02T09:00:00.000Z', { nowMs: now })).toBe(
      '2026-08-02T09:00:00.000Z',
    );
  });

  it('floors a past instant to now + the guard window', () => {
    expect(applyPlannerFutureFloor('2020-01-01T09:00:00.000Z', { nowMs: now })).toBe(
      new Date(now + PLANNER_PAST_GUARD_FLOOR_MS).toISOString(),
    );
  });
});

describe('movePlannerDraftToDay', () => {
  const now = Date.parse('2026-08-01T12:00:00.000Z');

  it('carries the current time-of-day onto the new day', () => {
    const move = movePlannerDraftToDay({
      fromIso: '2026-08-01T21:00:00.000Z',
      targetDayId: '2026-08-10',
      timeZone: 'America/New_York',
      nowMs: now,
    });
    expect(move).not.toBeNull();
    expect(move?.timeOfDay).toBe('17:00');
    expect(move?.scheduledAt).toBe('2026-08-10T21:00:00.000Z');
    expect(move?.floored).toBe(false);
  });

  it('an explicit time_of_day overrides the carried one', () => {
    const move = movePlannerDraftToDay({
      fromIso: '2026-08-01T21:00:00.000Z',
      targetDayId: '2026-08-10',
      timeOfDay: '08:30',
      timeZone: 'UTC',
      nowMs: now,
    });
    expect(move?.timeOfDay).toBe('08:30');
    expect(move?.scheduledAt).toBe('2026-08-10T08:30:00.000Z');
  });

  it('floors a move onto a past day and says so', () => {
    const move = movePlannerDraftToDay({
      fromIso: '2026-08-01T21:00:00.000Z',
      targetDayId: '2020-01-01',
      timeZone: 'UTC',
      nowMs: now,
    });
    expect(move?.floored).toBe(true);
    expect(Date.parse(move?.scheduledAt as string)).toBeGreaterThan(now);
  });

  it('defaults to 09:00 when the draft has no schedule yet', () => {
    const move = movePlannerDraftToDay({
      fromIso: null,
      targetDayId: '2026-08-10',
      timeZone: 'UTC',
      nowMs: now,
    });
    expect(move?.timeOfDay).toBe('09:00');
    expect(move?.scheduledAt).toBe('2026-08-10T09:00:00.000Z');
  });

  it('returns null for an unusable target day', () => {
    expect(
      movePlannerDraftToDay({ fromIso: null, targetDayId: '2026-02-30', timeZone: 'UTC' }),
    ).toBeNull();
  });
});

describe('time zone validation', () => {
  it('accepts real zones and rejects invented ones', () => {
    expect(isValidPlannerTimeZone('America/New_York')).toBe(true);
    expect(isValidPlannerTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(plannerTimeZoneSchema.safeParse('Europe/London').success).toBe(true);
    expect(plannerTimeZoneSchema.safeParse('Nowhere/Nothing').success).toBe(false);
  });
});
