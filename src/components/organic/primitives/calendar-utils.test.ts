import { describe, expect, it } from 'bun:test';

import {
  buildDayRange,
  buildScaffoldForRange,
  buildUnscheduledDay,
  buildWeekDays,
  makeCalendarDay,
  sliceWeekDays,
  UNSCHEDULED_DAY_ID,
} from './calendar-utils';
import type { OrganicCalendarDay, OrganicCalendarDraft } from './types';

const draft = (id: string): OrganicCalendarDraft =>
  ({ id, title: id, platforms: ['instagram'], slots: [] }) as unknown as OrganicCalendarDraft;

const dayWith = (id: string, drafts: OrganicCalendarDraft[]): OrganicCalendarDay => ({
  ...makeCalendarDay(id),
  slots: drafts,
});

describe('buildDayRange', () => {
  it('builds an inclusive range of empty days with weekday labels', () => {
    const days = buildDayRange(new Date(2026, 5, 15), new Date(2026, 5, 17));
    expect(days.map((d) => d.id)).toEqual(['2026-06-15', '2026-06-16', '2026-06-17']);
    expect(days[0].label).toBe('Mon');
    expect(days[0].dateLabel).toBe('Jun 15');
    expect(days.every((d) => d.slots.length === 0)).toBe(true);
  });

  it('returns a single day when start equals end', () => {
    const days = buildDayRange(new Date(2026, 5, 15), new Date(2026, 5, 15));
    expect(days).toHaveLength(1);
    expect(days[0].id).toBe('2026-06-15');
  });
});

describe('buildWeekDays', () => {
  it('delegates to buildDayRange and yields a Monday-started 7-day week', () => {
    const days = buildWeekDays(new Date(2026, 5, 17)); // a Wednesday
    expect(days).toHaveLength(7);
    expect(days[0].id).toBe('2026-06-15'); // Monday
    expect(days[0].label).toBe('Mon');
    expect(days[6].id).toBe('2026-06-21'); // Sunday
    expect(days[6].label).toBe('Sun');
  });
});

describe('makeCalendarDay', () => {
  it('builds a labeled empty day from a valid id', () => {
    const day = makeCalendarDay('2026-06-15');
    expect(day.label).toBe('Mon');
    expect(day.dateLabel).toBe('Jun 15');
    expect(day.slots).toEqual([]);
  });
});

describe('sliceWeekDays', () => {
  it('returns exactly 7 days, pulling loaded days and synthesizing the rest', () => {
    const loaded = [dayWith('2026-06-17', [draft('a')])];
    const week = sliceWeekDays(loaded, new Date(2026, 5, 17));
    expect(week).toHaveLength(7);
    expect(week.map((d) => d.id)).toEqual([
      '2026-06-15',
      '2026-06-16',
      '2026-06-17',
      '2026-06-18',
      '2026-06-19',
      '2026-06-20',
      '2026-06-21',
    ]);
    // The loaded day keeps its drafts; the synthesized ones are empty.
    expect(week[2].slots.map((s) => s.id)).toEqual(['a']);
    expect(week[0].slots).toEqual([]);
  });

  it('synthesizes a full empty week when nothing is loaded', () => {
    const week = sliceWeekDays([], new Date(2026, 5, 17));
    expect(week).toHaveLength(7);
    expect(week.every((d) => d.slots.length === 0)).toBe(true);
  });
});

describe('buildScaffoldForRange', () => {
  it('unions the span days with every loaded draft day, sorted', () => {
    const span = { start: new Date(2026, 5, 1), end: new Date(2026, 5, 3) };
    const scaffold = buildScaffoldForRange(['2026-09-09', '2026-06-02'], span.start, span.end);
    expect(scaffold.map((d) => d.id)).toEqual([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-09-09', // far-future loaded draft day gets a home
    ]);
  });

  it('ignores non-date ids (e.g. the unscheduled sentinel)', () => {
    const scaffold = buildScaffoldForRange(
      [UNSCHEDULED_DAY_ID, 'not-a-date'],
      new Date(2026, 5, 1),
      new Date(2026, 5, 1),
    );
    expect(scaffold.map((d) => d.id)).toEqual(['2026-06-01']);
  });
});

describe('buildUnscheduledDay', () => {
  it('returns the sentinel day', () => {
    const day = buildUnscheduledDay();
    expect(day.id).toBe(UNSCHEDULED_DAY_ID);
    expect(day.label).toBe('Unscheduled');
    expect(day.slots).toEqual([]);
  });
});
