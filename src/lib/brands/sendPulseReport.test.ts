import { beforeEach, describe, expect, it, mock } from 'bun:test';

let invokeResult: { data: unknown; error: unknown } = { data: null, error: null };
const invoke = mock(async (_name: string, _args: { body?: unknown }) => invokeResult);

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({ functions: { invoke } }),
}));

const { getReportSchedule, sendContinuumReport, summarizeReportRecipients, upsertReportSchedule } =
  await import('./sendPulseReport');

const scheduleContract = {
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

describe('summarizeReportRecipients', () => {
  it('handles an empty list', () => {
    expect(summarizeReportRecipients([])).toContain('No recipients');
  });

  it('names a single recipient', () => {
    expect(summarizeReportRecipients(['duane@trycontinuum.ai'])).toBe(
      'Sent to duane@trycontinuum.ai.',
    );
  });

  it('summarizes two recipients without a plural trailing s', () => {
    expect(summarizeReportRecipients(['a@x.com', 'b@x.com'])).toBe(
      'Sent to a@x.com and 1 other recipient.',
    );
  });

  it('pluralizes three or more recipients', () => {
    expect(summarizeReportRecipients(['a@x.com', 'b@x.com', 'c@x.com'])).toBe(
      'Sent to a@x.com and 2 other recipients.',
    );
  });
});

describe('sendContinuumReport', () => {
  beforeEach(() => {
    invoke.mockClear();
    invokeResult = { data: null, error: null };
  });

  it('returns a partial receipt and sends it back for a failure-only retry', async () => {
    const brandId = '00000000-0000-4000-8000-000000000001';
    const userId = '00000000-0000-4000-8000-000000000002';
    const receiptId = '00000000-0000-4000-8000-000000000003';
    invokeResult = {
      data: {
        status: 'partial',
        ok: false,
        sent: false,
        recipients: ['duane@trycontinuum.ai'],
        resendMessageIds: [],
        outcomes: [
          {
            recipient: 'duane@trycontinuum.ai',
            status: 'failed',
            errorCode: 'network_error',
            httpStatus: null,
          },
        ],
        receiptId,
      },
      error: null,
    };

    const first = await sendContinuumReport({ brandId, recipientUserIds: [userId] });
    expect(first).toEqual({
      recipients: ['duane@trycontinuum.ai'],
      status: 'partial',
      receiptId,
    });

    await sendContinuumReport({
      brandId,
      recipientUserIds: [userId],
      retryReceiptId: receiptId,
    });
    const [, retryArgs] = invoke.mock.calls[1];
    expect(retryArgs.body).toEqual({
      action: 'send_now',
      brandId,
      recipientUserIds: [userId],
      retryReceiptId: receiptId,
    });
  });
});

describe('upsertReportSchedule', () => {
  beforeEach(() => {
    invoke.mockClear();
    invokeResult = { data: null, error: null };
  });

  it('builds the correct edge body and returns the parsed schedule', async () => {
    invokeResult = { data: { schedule: scheduleContract }, error: null };

    const result = await upsertReportSchedule({
      brandId: 'brand-1',
      cadence: 'weekly',
      dayOfWeek: 1,
      dayOfMonth: null,
      hour: 8,
      timezone: 'America/New_York',
      memberUserIds: ['user-1'],
      externalEmails: ['ext@company.com'],
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    const [functionName, args] = invoke.mock.calls[0];
    expect(functionName).toBe('send-first-value-report');
    expect(args.body).toEqual({
      action: 'schedule',
      brandId: 'brand-1',
      cadence: 'weekly',
      dayOfWeek: 1,
      dayOfMonth: null,
      hour: 8,
      timezone: 'America/New_York',
      recipients: { memberUserIds: ['user-1'], externalEmails: ['ext@company.com'] },
    });
    expect(result).toEqual(scheduleContract);
  });

  it('surfaces the edge body error message on failure', async () => {
    invokeResult = {
      data: null,
      error: {
        message: 'HTTP error',
        context: new Response(JSON.stringify({ error: 'monthly schedules require dayOfMonth.' }), {
          status: 400,
        }),
      },
    };

    await expect(
      upsertReportSchedule({
        brandId: 'brand-1',
        cadence: 'monthly',
        dayOfWeek: null,
        dayOfMonth: 1,
        hour: 8,
        timezone: 'UTC',
        memberUserIds: [],
        externalEmails: [],
      }),
    ).rejects.toThrow('monthly schedules require dayOfMonth.');
  });

  it('throws when the response fails contract validation', async () => {
    invokeResult = { data: { schedule: { cadence: 'weekly' } }, error: null };
    await expect(
      upsertReportSchedule({
        brandId: 'brand-1',
        cadence: 'weekly',
        dayOfWeek: 1,
        dayOfMonth: null,
        hour: 8,
        timezone: 'UTC',
        memberUserIds: [],
        externalEmails: [],
      }),
    ).rejects.toThrow('malformed');
  });
});

describe('getReportSchedule', () => {
  beforeEach(() => {
    invoke.mockClear();
    invokeResult = { data: null, error: null };
  });

  it('returns null when no schedule is configured', async () => {
    invokeResult = { data: { schedule: null, canManageSchedule: true }, error: null };
    expect(await getReportSchedule('brand-1')).toBeNull();
    const [, args] = invoke.mock.calls[0];
    expect(args.body).toEqual({ action: 'get_schedule', brandId: 'brand-1' });
  });

  it('returns the parsed schedule when present', async () => {
    invokeResult = {
      data: { schedule: scheduleContract, canManageSchedule: true },
      error: null,
    };
    expect(await getReportSchedule('brand-1')).toEqual(scheduleContract);
  });
});
