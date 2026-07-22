import { describe, expect, it } from 'bun:test';

import { organicRescheduleDraftRequestSchema } from './calendar-draft';

describe('organicRescheduleDraftRequestSchema', () => {
  it('accepts a valid offset datetime', () => {
    const parsed = organicRescheduleDraftRequestSchema.safeParse({
      scheduled_date: '2026-07-22T13:30:00.000Z',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a datetime with a numeric offset', () => {
    const parsed = organicRescheduleDraftRequestSchema.safeParse({
      scheduled_date: '2026-07-22T13:30:00-05:00',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a date-only string', () => {
    const parsed = organicRescheduleDraftRequestSchema.safeParse({
      scheduled_date: '2026-07-22',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects garbage', () => {
    const parsed = organicRescheduleDraftRequestSchema.safeParse({
      scheduled_date: 'not-a-date',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a missing scheduled_date', () => {
    const parsed = organicRescheduleDraftRequestSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });
});
