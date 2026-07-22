import { describe, expect, it } from 'bun:test';
import {
  getReportScheduleResponseSchema,
  reportScheduleSchema,
  upsertReportScheduleRequestSchema,
} from './reportSchedule';

const validWeekly = {
  brandId: 'brand-1',
  presentation: 'continuum_report' as const,
  cadence: 'weekly' as const,
  dayOfWeek: 1,
  dayOfMonth: null,
  hour: 8,
  timezone: 'America/New_York',
  recipients: { memberUserIds: ['user-1'], externalEmails: ['ext@company.com'] },
  enabled: true,
  nextRunAt: '2026-03-09T12:00:00.000Z',
  lastRunAt: null,
  updatedAt: '2026-03-02T12:00:00.000Z',
};

const validMonthly = {
  ...validWeekly,
  cadence: 'monthly' as const,
  dayOfWeek: null,
  dayOfMonth: 28,
};

describe('reportScheduleSchema', () => {
  it('parses a valid weekly schedule', () => {
    expect(reportScheduleSchema.safeParse(validWeekly).success).toBe(true);
  });

  it('parses a valid monthly schedule', () => {
    expect(reportScheduleSchema.safeParse(validMonthly).success).toBe(true);
  });

  it('rejects an unknown cadence', () => {
    expect(reportScheduleSchema.safeParse({ ...validWeekly, cadence: 'daily' }).success).toBe(
      false,
    );
  });

  it('rejects dayOfWeek greater than 6', () => {
    expect(reportScheduleSchema.safeParse({ ...validWeekly, dayOfWeek: 7 }).success).toBe(false);
  });

  it('rejects dayOfMonth greater than 28', () => {
    expect(reportScheduleSchema.safeParse({ ...validMonthly, dayOfMonth: 29 }).success).toBe(false);
  });

  it('rejects a presentation other than continuum_report', () => {
    expect(reportScheduleSchema.safeParse({ ...validWeekly, presentation: 'pulse' }).success).toBe(
      false,
    );
  });

  it('rejects an invalid external email', () => {
    const result = reportScheduleSchema.safeParse({
      ...validWeekly,
      recipients: { memberUserIds: [], externalEmails: ['not-an-email'] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a weekly schedule missing dayOfWeek (refine)', () => {
    const result = reportScheduleSchema.safeParse({ ...validWeekly, dayOfWeek: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['cadence']);
    }
  });

  it('rejects a monthly schedule missing dayOfMonth (refine)', () => {
    expect(reportScheduleSchema.safeParse({ ...validMonthly, dayOfMonth: null }).success).toBe(
      false,
    );
  });
});

describe('upsertReportScheduleRequestSchema', () => {
  it('parses a valid create request and drops nothing', () => {
    const result = upsertReportScheduleRequestSchema.safeParse({
      brandId: 'brand-1',
      cadence: 'weekly',
      dayOfWeek: 3,
      dayOfMonth: null,
      hour: 9,
      timezone: 'UTC',
      recipients: { memberUserIds: ['u1'], externalEmails: [] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an upsert with a server-managed field present (strict)', () => {
    const result = upsertReportScheduleRequestSchema.safeParse({
      brandId: 'brand-1',
      cadence: 'weekly',
      dayOfWeek: 3,
      dayOfMonth: null,
      hour: 9,
      timezone: 'UTC',
      recipients: { memberUserIds: [], externalEmails: [] },
      nextRunAt: '2026-03-09T12:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('getReportScheduleResponseSchema', () => {
  it('accepts a null schedule (none configured)', () => {
    expect(getReportScheduleResponseSchema.safeParse({ schedule: null }).success).toBe(true);
  });

  it('accepts a present schedule', () => {
    expect(getReportScheduleResponseSchema.safeParse({ schedule: validWeekly }).success).toBe(true);
  });
});
