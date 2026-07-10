import { describe, expect, it } from 'bun:test';

import {
  automationRecipientsSchema,
  automationScheduleSchema,
  automationSchema,
} from './automation';
import { createAutomationRequestSchema, updateAutomationRequestSchema } from './automation-request';
import { automationRunSchema } from './run';

const weeklySchedule = {
  kind: 'weekly' as const,
  dayOfWeek: 1,
  time: '09:30',
  timezone: 'America/New_York',
};

const validAutomation = {
  id: 'auto-1',
  brandId: 'brand-1',
  createdBy: 'user-1',
  name: 'Weekly spend report',
  agent: 'jaina' as const,
  prompt: "Summarize last week's paid performance and top movers.",
  schedule: weeklySchedule,
  recipients: {
    memberUserIds: ['user-1'],
    externalEmails: ['cfo@example.com'],
  },
  enabled: true,
  nextRunAt: '2026-07-13T13:30:00.000Z',
  lastRunId: null,
  lastRunAt: null,
  lastRunStatus: null,
  createdAt: '2026-07-09T00:00:00.000Z',
  updatedAt: '2026-07-09T00:00:00.000Z',
};

describe('automationScheduleSchema', () => {
  it('accepts every preset kind and cron', () => {
    const cases = [
      { kind: 'daily', time: '07:00', timezone: 'UTC' },
      weeklySchedule,
      { kind: 'monthly', dayOfMonth: 28, time: '23:59', timezone: 'UTC' },
      { kind: 'cron', expr: '*/30 * * * *', timezone: 'Europe/London' },
    ];
    for (const schedule of cases) {
      expect(automationScheduleSchema.safeParse(schedule).success).toBe(true);
    }
  });

  it('rejects out-of-range time, dayOfWeek, and dayOfMonth', () => {
    expect(
      automationScheduleSchema.safeParse({
        kind: 'daily',
        time: '24:00',
        timezone: 'UTC',
      }).success,
    ).toBe(false);
    expect(
      automationScheduleSchema.safeParse({
        ...weeklySchedule,
        dayOfWeek: 7,
      }).success,
    ).toBe(false);
    expect(
      automationScheduleSchema.safeParse({
        kind: 'monthly',
        dayOfMonth: 29,
        time: '09:00',
        timezone: 'UTC',
      }).success,
    ).toBe(false);
  });
});

describe('automationRecipientsSchema', () => {
  it('defaults both lists to empty', () => {
    const parsed = automationRecipientsSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.memberUserIds).toEqual([]);
      expect(parsed.data.externalEmails).toEqual([]);
    }
  });

  it('rejects invalid external emails', () => {
    expect(
      automationRecipientsSchema.safeParse({
        memberUserIds: [],
        externalEmails: ['not-an-email'],
      }).success,
    ).toBe(false);
  });
});

describe('automationSchema', () => {
  it('round-trips a valid automation', () => {
    const parsed = automationSchema.safeParse(validAutomation);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.agent).toBe('jaina');
  });

  it('rejects an unknown agent', () => {
    expect(automationSchema.safeParse({ ...validAutomation, agent: 'trends' }).success).toBe(false);
  });
});

describe('request schemas', () => {
  it('createAutomationRequestSchema defaults enabled to true', () => {
    const parsed = createAutomationRequestSchema.safeParse({
      brandId: 'brand-1',
      name: 'Weekly spend report',
      agent: 'organic',
      prompt: 'What performed best this week?',
      schedule: weeklySchedule,
      recipients: { memberUserIds: [], externalEmails: ['a@b.co'] },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.enabled).toBe(true);
  });

  it('updateAutomationRequestSchema rejects an empty patch', () => {
    expect(updateAutomationRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('automationRunSchema', () => {
  it('round-trips a completed run with output', () => {
    const parsed = automationRunSchema.safeParse({
      runId: 'run-1',
      automationId: 'auto-1',
      brandId: 'brand-1',
      trigger: 'schedule',
      requestedBy: null,
      status: 'completed',
      scheduledFor: '2026-07-13T13:30:00.000Z',
      attempts: 1,
      output: { text: '# Weekly report\nSpend was flat.' },
      errorMessage: null,
      emailStatus: 'sent',
      emailedAt: '2026-07-13T13:32:00.000Z',
      emailError: null,
      enqueuedAt: '2026-07-13T13:30:00.000Z',
      startedAt: '2026-07-13T13:30:05.000Z',
      completedAt: '2026-07-13T13:31:40.000Z',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.output?.text).toContain('Weekly');
  });
});
