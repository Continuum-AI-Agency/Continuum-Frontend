import { describe, expect, it } from 'bun:test';

import {
  describeSchedule,
  isValidTimezone,
  listTimezones,
  nextRunTimes,
  scheduleToCronExpression,
  timezoneLabel,
  validateCron,
} from './schedule';

describe('scheduleToCronExpression', () => {
  it('canonicalizes every preset and passes cron through', () => {
    expect(scheduleToCronExpression({ kind: 'daily', time: '09:30', timezone: 'UTC' })).toBe(
      '30 9 * * *',
    );
    expect(
      scheduleToCronExpression({ kind: 'weekly', dayOfWeek: 5, time: '18:00', timezone: 'UTC' }),
    ).toBe('0 18 * * 5');
    expect(
      scheduleToCronExpression({ kind: 'monthly', dayOfMonth: 1, time: '08:15', timezone: 'UTC' }),
    ).toBe('15 8 1 * *');
    expect(scheduleToCronExpression({ kind: 'cron', expr: '0 8 * * 1-5', timezone: 'UTC' })).toBe(
      '0 8 * * 1-5',
    );
  });
});

describe('validateCron', () => {
  it('accepts valid expressions and rejects junk with a reason', () => {
    expect(validateCron('0 8 * * 1-5')).toEqual({ ok: true });
    const invalid = validateCron('not a cron');
    expect(invalid.ok).toBe(false);
  });
});

describe('nextRunTimes', () => {
  it('returns strictly increasing future dates in the schedule timezone', () => {
    const runs = nextRunTimes({ kind: 'daily', time: '09:30', timezone: 'America/New_York' });
    expect(runs).toHaveLength(3);
    expect(runs[0].getTime()).toBeGreaterThan(Date.now());
    expect(runs[1].getTime()).toBeGreaterThan(runs[0].getTime());
    // Exact 24h only holds in a fixed-offset zone; NY intervals shift at DST.
    const utcRuns = nextRunTimes({ kind: 'daily', time: '09:30', timezone: 'UTC' });
    expect(utcRuns[2].getTime() - utcRuns[1].getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('returns empty for an invalid expression instead of throwing', () => {
    expect(nextRunTimes({ kind: 'cron', expr: 'garbage', timezone: 'UTC' })).toEqual([]);
  });
});

describe('describeSchedule', () => {
  it('produces human sentences for every kind', () => {
    expect(describeSchedule({ kind: 'daily', time: '09:30', timezone: 'UTC' })).toBe(
      'Daily at 9:30 AM (UTC)',
    );
    expect(
      describeSchedule({ kind: 'weekly', dayOfWeek: 1, time: '14:05', timezone: 'Europe/London' }),
    ).toBe('Weekly on Monday at 2:05 PM (Europe/London)');
    expect(
      describeSchedule({ kind: 'monthly', dayOfMonth: 28, time: '00:00', timezone: 'UTC' }),
    ).toBe('Monthly on day 28 at 12:00 AM (UTC)');
    expect(describeSchedule({ kind: 'cron', expr: '*/30 9-17 * * *', timezone: 'UTC' })).toContain(
      'Custom cron',
    );
  });
});

// Brand Settings saves only a zone this accepts: El Quinto Elemento (Alcaldía de Cali) sat on the
// 'UTC' default with no way to pick America/Bogota.
describe('isValidTimezone', () => {
  it('accepts IANA zones and UTC, refuses anything else', () => {
    expect(isValidTimezone('America/Bogota')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('America/Cali')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
  });

  it('accepts every zone the picker offers', () => {
    expect(listTimezones().every(isValidTimezone)).toBe(true);
  });
});

describe('timezoneLabel', () => {
  it('names the zone in the reader’s language and keeps the city that tells zones apart', () => {
    expect(timezoneLabel('America/Bogota', 'es')).toBe('hora estándar de Colombia · Bogota');
    expect(timezoneLabel('America/Argentina/Buenos_Aires', 'en')).toBe(
      'Argentina Standard Time · Buenos Aires',
    );
  });

  it('falls back to the id for a zone the runtime cannot format', () => {
    expect(timezoneLabel('America/Cali', 'es')).toBe('America/Cali');
  });
});
