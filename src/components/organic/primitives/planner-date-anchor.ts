import * as React from 'react';
import { startOfWeek } from './calendar-utils';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const UTC_MIDNIGHT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T00:00:00(?:\.\d{1,3})?Z$/;

export type PlannerInitialDates = {
  weekStart: Date;
  monthAnchorDate: Date;
};

type ResolvePlannerInitialDatesInput = {
  initialWeekStart?: string;
  persistedWeekStartId?: string | null;
  now?: Date;
};

type PlannerDateAnchors = PlannerInitialDates & {
  setWeekStart: React.Dispatch<React.SetStateAction<Date>>;
  setMonthAnchorDate: React.Dispatch<React.SetStateAction<Date>>;
};

function localCalendarDate(match: RegExpExecArray): Date | null {
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

export function parsePlannerCalendarDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const calendarMatch = DATE_ONLY_PATTERN.exec(value) ?? UTC_MIDNIGHT_PATTERN.exec(value);
  if (calendarMatch) return localCalendarDate(calendarMatch);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function resolvePlannerInitialDates({
  initialWeekStart,
  persistedWeekStartId,
  now = new Date(),
}: ResolvePlannerInitialDatesInput): PlannerInitialDates {
  const explicitDate = parsePlannerCalendarDate(initialWeekStart);
  const persistedDate = parsePlannerCalendarDate(persistedWeekStartId);
  const weekStart = startOfWeek(explicitDate ?? persistedDate ?? now);

  return {
    weekStart,
    monthAnchorDate: explicitDate ?? new Date(now),
  };
}

export function usePlannerDateAnchors({
  initialWeekStart,
  persistedWeekStartId,
  now,
}: ResolvePlannerInitialDatesInput): PlannerDateAnchors {
  const initialDatesRef = React.useRef<PlannerInitialDates | null>(null);
  if (!initialDatesRef.current) {
    initialDatesRef.current = resolvePlannerInitialDates({
      initialWeekStart,
      persistedWeekStartId,
      now,
    });
  }

  const [weekStart, setWeekStart] = React.useState(initialDatesRef.current.weekStart);
  const [monthAnchorDate, setMonthAnchorDate] = React.useState(
    initialDatesRef.current.monthAnchorDate,
  );
  const persistedWeekStartIdRef = React.useRef(persistedWeekStartId);
  const nowRef = React.useRef(now);
  const previousInitialWeekStartRef = React.useRef(initialWeekStart);
  persistedWeekStartIdRef.current = persistedWeekStartId;
  nowRef.current = now;

  React.useEffect(() => {
    if (previousInitialWeekStartRef.current === initialWeekStart) return;
    previousInitialWeekStartRef.current = initialWeekStart;
    const dates = resolvePlannerInitialDates({
      initialWeekStart,
      persistedWeekStartId: persistedWeekStartIdRef.current,
      now: nowRef.current,
    });
    setWeekStart(dates.weekStart);
    setMonthAnchorDate(dates.monthAnchorDate);
  }, [initialWeekStart]);

  return { weekStart, monthAnchorDate, setWeekStart, setMonthAnchorDate };
}
