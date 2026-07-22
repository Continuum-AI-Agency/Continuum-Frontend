'use client';

import * as React from 'react';
import {
  buildWeekDays,
  formatDayId,
  formatWeekHeading,
  formatWeekRange,
  startOfWeek,
} from '../primitives/calendar-utils';
import type { OrganicCalendarDay } from '../primitives/types';

type UseWeekNavigationOptions = {
  initialWeekStart: string | null | undefined;
  persistedWeekStartId: string | null;
  initialDays: OrganicCalendarDay[];
  calendarDays: OrganicCalendarDay[];
  setCalendarDays: (days: OrganicCalendarDay[]) => void;
  setPersistedWeekStartId: (id: string | null) => void;
  initialView: 'week' | 'month' | 'list' | undefined;
  setViewMode: (mode: 'week' | 'month' | 'list') => void;
  clearSelection: () => void;
  schedulableChannels: number;
};

export function useWeekNavigation({
  initialWeekStart,
  persistedWeekStartId,
  initialDays,
  calendarDays,
  setCalendarDays,
  setPersistedWeekStartId,
  initialView,
  setViewMode,
  clearSelection,
  schedulableChannels,
}: UseWeekNavigationOptions) {
  const resolvedInitialWeekStart = React.useMemo(() => {
    if (initialWeekStart) {
      const parsed = new Date(initialWeekStart);
      if (!Number.isNaN(parsed.getTime())) {
        return startOfWeek(parsed);
      }
    }
    if (persistedWeekStartId) {
      const parsed = new Date(persistedWeekStartId);
      if (!Number.isNaN(parsed.getTime())) {
        return startOfWeek(parsed);
      }
    }
    return startOfWeek(new Date());
  }, [initialWeekStart, persistedWeekStartId]);

  const resolvedInitialWeekStartId = React.useMemo(
    () => formatDayId(resolvedInitialWeekStart),
    [resolvedInitialWeekStart],
  );

  const [weekStart, setWeekStart] = React.useState<Date>(resolvedInitialWeekStart);
  const weekStartId = formatDayId(weekStart);
  const weekCacheRef = React.useRef<Record<string, OrganicCalendarDay[]>>({});

  // Apply initialView from URL search param on mount (once)
  React.useEffect(() => {
    if (initialView) setViewMode(initialView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    setPersistedWeekStartId(weekStartId);
  }, [setPersistedWeekStartId, weekStartId]);

  // Keep the week cache in sync (ref write is safe during render)
  if (calendarDays.length > 0) {
    weekCacheRef.current[weekStartId] = calendarDays;
  }

  // Populate calendar days when the store is empty for the current week
  React.useEffect(() => {
    if (calendarDays.length > 0) return;

    const cachedWeek = weekCacheRef.current[weekStartId];
    const fallbackDays =
      cachedWeek ??
      (weekStartId === resolvedInitialWeekStartId ? initialDays : buildWeekDays(weekStart));
    setCalendarDays(fallbackDays);
    weekCacheRef.current[weekStartId] = fallbackDays;
  }, [
    calendarDays.length,
    initialDays,
    resolvedInitialWeekStartId,
    setCalendarDays,
    weekStart,
    weekStartId,
  ]);

  const handleWeekChange = React.useCallback(
    (date: Date) => {
      const nextWeekStart = startOfWeek(date);
      const nextWeekId = formatDayId(nextWeekStart);
      if (nextWeekId === weekStartId) return;
      weekCacheRef.current[weekStartId] = calendarDays;
      const nextDays = weekCacheRef.current[nextWeekId] ?? buildWeekDays(nextWeekStart);
      setCalendarDays(nextDays);
      clearSelection();
      setWeekStart(nextWeekStart);
    },
    [calendarDays, clearSelection, setCalendarDays, weekStartId],
  );

  const handlePreviousWeek = React.useCallback(() => {
    const previous = new Date(weekStart);
    previous.setDate(weekStart.getDate() - 7);
    handleWeekChange(previous);
  }, [handleWeekChange, weekStart]);

  const handleNextWeek = React.useCallback(() => {
    const next = new Date(weekStart);
    next.setDate(weekStart.getDate() + 7);
    handleWeekChange(next);
  }, [handleWeekChange, weekStart]);

  const handlePreviousMonth = React.useCallback(() => {
    const prev = new Date(weekStart);
    prev.setDate(1);
    prev.setMonth(prev.getMonth() - 1);
    handleWeekChange(prev);
  }, [handleWeekChange, weekStart]);

  const handleNextMonth = React.useCallback(() => {
    const next = new Date(weekStart);
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    handleWeekChange(next);
  }, [handleWeekChange, weekStart]);

  const weekTitle = React.useMemo(() => formatWeekHeading(weekStart), [weekStart]);
  const weekSubtitle = React.useMemo(
    () => `${formatWeekRange(weekStart)} • ${schedulableChannels} scheduling channels`,
    [schedulableChannels, weekStart],
  );

  return {
    weekStart,
    weekStartId,
    weekTitle,
    weekSubtitle,
    handlePreviousWeek,
    handleNextWeek,
    handlePreviousMonth,
    handleNextMonth,
    handleWeekChange,
  };
}
