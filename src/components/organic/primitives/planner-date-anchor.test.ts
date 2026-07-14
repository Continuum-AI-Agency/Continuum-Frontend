import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { formatDayId } from './calendar-utils';
import { resolvePlannerInitialDates, usePlannerDateAnchors } from './planner-date-anchor';

describe('resolvePlannerInitialDates', () => {
  const originalTimezone = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/Phoenix';
  });

  afterAll(() => {
    if (originalTimezone) process.env.TZ = originalTimezone;
    else delete process.env.TZ;
  });

  afterEach(cleanup);

  it('opens the current month while preserving a persisted weekly cursor', () => {
    const dates = resolvePlannerInitialDates({
      persistedWeekStartId: '2026-06-15T12:00:00',
      now: new Date(2026, 6, 1, 12),
    });

    expect(dates.weekStart.getFullYear()).toBe(2026);
    expect(dates.weekStart.getMonth()).toBe(5);
    expect(dates.monthAnchorDate.getFullYear()).toBe(2026);
    expect(dates.monthAnchorDate.getMonth()).toBe(6);
  });

  it('lets an explicit deep-link date override both planner cursors', () => {
    const dates = resolvePlannerInitialDates({
      initialWeekStart: '2026-08-01T12:00:00',
      persistedWeekStartId: '2026-06-15T12:00:00',
      now: new Date(2026, 6, 10, 12),
    });

    expect(dates.weekStart.getFullYear()).toBe(2026);
    expect(dates.weekStart.getMonth()).toBe(6);
    expect(dates.monthAnchorDate.getFullYear()).toBe(2026);
    expect(dates.monthAnchorDate.getMonth()).toBe(7);
  });

  it('parses a date-only deep link as a local calendar date', () => {
    const dates = resolvePlannerInitialDates({
      initialWeekStart: '2026-07-06',
      now: new Date(2026, 6, 1, 12),
    });

    expect(dates.weekStart.getFullYear()).toBe(2026);
    expect(dates.weekStart.getMonth()).toBe(6);
    expect(dates.weekStart.getDate()).toBe(6);
    expect(dates.monthAnchorDate.getDate()).toBe(6);
  });

  it('keeps a UTC-midnight deep link on its written day in a western timezone', () => {
    const dates = resolvePlannerInitialDates({
      initialWeekStart: '2026-07-06T00:00:00.000Z',
      now: new Date(2026, 6, 1, 12),
    });

    expect(dates.weekStart.getFullYear()).toBe(2026);
    expect(dates.weekStart.getMonth()).toBe(6);
    expect(dates.weekStart.getDate()).toBe(6);
    expect(dates.monthAnchorDate.getDate()).toBe(6);
  });

  it('reconciles planner dates when an explicit deep link is added and removed', async () => {
    type HookProps = {
      initialWeekStart?: string;
      persistedWeekStartId: string;
    };
    const now = new Date(2026, 6, 1, 12);
    const { result, rerender } = renderHook(
      ({ initialWeekStart, persistedWeekStartId }: HookProps) =>
        usePlannerDateAnchors({ initialWeekStart, persistedWeekStartId, now }),
      {
        initialProps: {
          initialWeekStart: undefined,
          persistedWeekStartId: '2026-06-15',
        } as HookProps,
      },
    );

    expect(formatDayId(result.current.weekStart)).toBe('2026-06-15');
    expect(formatDayId(result.current.monthAnchorDate)).toBe('2026-07-01');

    rerender({
      initialWeekStart: '2026-08-01',
      persistedWeekStartId: '2026-06-15',
    });
    await waitFor(() => {
      expect(formatDayId(result.current.weekStart)).toBe('2026-07-27');
      expect(formatDayId(result.current.monthAnchorDate)).toBe('2026-08-01');
    });

    rerender({
      initialWeekStart: undefined,
      persistedWeekStartId: '2026-07-27',
    });
    await waitFor(() => {
      expect(formatDayId(result.current.weekStart)).toBe('2026-07-27');
      expect(formatDayId(result.current.monthAnchorDate)).toBe('2026-07-01');
    });
  });
});
