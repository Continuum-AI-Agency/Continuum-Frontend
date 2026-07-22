import { parseTimeLabel } from '@/lib/organic/scheduling';
import type { OrganicCalendarDay, OrganicCalendarDraft } from './types';

const DEFAULT_SUGGESTED_TIMES = ['9:00 AM', '1:00 PM', '5:00 PM'] as const;
const DAY_ID_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Sentinel day for drafts with no real scheduled date (agent/bulk rows that
// persisted a null scheduled_date). They have no place on a date grid, so they
// live under this id and surface only in the list view's "Unscheduled" group.
export const UNSCHEDULED_DAY_ID = 'unscheduled';

export function startOfWeek(date: Date): Date {
  const next = new Date(date);
  const dayOfWeek = next.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  next.setDate(next.getDate() + diffToMonday);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function formatDayId(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(weekStart.getDate() + 6);
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  return `${formatter.format(weekStart)} – ${formatter.format(end)}`;
}

export function formatWeekHeading(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(weekStart.getDate() + 6);

  const startMonth = weekStart.toLocaleString('en-US', { month: 'long' });
  const endMonth = end.toLocaleString('en-US', { month: 'long' });
  const year = weekStart.getFullYear();

  if (startMonth === endMonth) {
    return `${startMonth} ${weekStart.getDate()} – ${end.getDate()}, ${year}`;
  }

  return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${end.getDate()}, ${year}`;
}

function parseDayId(dayId: string): Date | null {
  const match = DAY_ID_PATTERN.exec(dayId);
  if (!match) return null;
  return new Date(
    Number(dayId.slice(0, 4)),
    Number(dayId.slice(5, 7)) - 1,
    Number(dayId.slice(8, 10)),
  );
}

function dayFromDate(date: Date): OrganicCalendarDay {
  const monthName = date.toLocaleString('en-US', { month: 'short' });
  return {
    id: formatDayId(date),
    label: date.toLocaleString('en-US', { weekday: 'short' }),
    dateLabel: `${monthName} ${date.getDate()}`,
    suggestedTimes: [...DEFAULT_SUGGESTED_TIMES],
    slots: [],
  };
}

// Build an empty calendar day for a single YYYY-MM-DD id. Used to materialize a
// day on demand (manual create / drag onto a day that isn't in the loaded set).
export function makeCalendarDay(dayId: string): OrganicCalendarDay {
  const date = parseDayId(dayId);
  if (!date) {
    return {
      id: dayId,
      label: '',
      dateLabel: '',
      suggestedTimes: [...DEFAULT_SUGGESTED_TIMES],
      slots: [],
    };
  }
  return dayFromDate(date);
}

// The list-view sentinel for undated drafts.
export function buildUnscheduledDay(): OrganicCalendarDay {
  return {
    id: UNSCHEDULED_DAY_ID,
    label: 'Unscheduled',
    dateLabel: '',
    suggestedTimes: [...DEFAULT_SUGGESTED_TIMES],
    slots: [],
  };
}

// Build empty calendar days for every date in [start, end] (inclusive).
export function buildDayRange(start: Date, end: Date): OrganicCalendarDay[] {
  const days: OrganicCalendarDay[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= last.getTime()) {
    days.push(dayFromDate(new Date(cursor)));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function buildWeekDays(weekStart: Date): OrganicCalendarDay[] {
  const base = startOfWeek(weekStart);
  const end = new Date(base);
  end.setDate(base.getDate() + 6);
  return buildDayRange(base, end);
}

// View model for the week grid: exactly the 7 Mon..Sun days for `weekStart`,
// pulled from `days` when present so loaded drafts show, synthesizing empty days
// for any of the seven missing from the loaded set. This keeps the grid at 7
// columns no matter how many days are loaded into the canonical day array.
export function sliceWeekDays(days: OrganicCalendarDay[], weekStart: Date): OrganicCalendarDay[] {
  const base = startOfWeek(weekStart);
  const byId = new Map(days.map((day) => [day.id, day]));
  const result: OrganicCalendarDay[] = [];
  for (let i = 0; i < 7; i++) {
    const current = new Date(base);
    current.setDate(base.getDate() + i);
    const id = formatDayId(current);
    result.push(byId.get(id) ?? dayFromDate(current));
  }
  return result;
}

// Canonical loaded-day scaffold: the union of (every day in the visible span)
// and (every distinct day that a loaded draft falls on). Guarantees every loaded
// draft has a home day even when it sits far outside the current month, while the
// span keeps the current view paintable when a brand has no drafts there. The
// "unscheduled" sentinel is intentionally NOT date-buildable — the caller appends
// it separately when undated drafts exist.
export function buildScaffoldForRange(
  loadedDayIds: string[],
  spanStart: Date,
  spanEnd: Date,
): OrganicCalendarDay[] {
  const byId = new Map<string, OrganicCalendarDay>();
  for (const day of buildDayRange(spanStart, spanEnd)) {
    byId.set(day.id, day);
  }
  for (const id of loadedDayIds) {
    if (!DAY_ID_PATTERN.test(id)) continue;
    if (!byId.has(id)) byId.set(id, makeCalendarDay(id));
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function moveDraftToDay(
  days: OrganicCalendarDay[],
  draftId: string,
  targetDayId: string,
): OrganicCalendarDay[] {
  let movedDraft: OrganicCalendarDraft | null = null;

  const cleared = days.map((day) => {
    const remaining = day.slots.filter((draft) => {
      if (draft.id === draftId) {
        movedDraft = draft;
        return false;
      }
      return true;
    });

    return day.id === targetDayId ? day : { ...day, slots: remaining };
  });

  if (!movedDraft) return days;

  return cleared.map((day) => {
    if (day.id !== targetDayId) return day;

    const updatedDraft: OrganicCalendarDraft = {
      ...movedDraft!,
      dateLabel: `${day.label}, ${day.dateLabel}`,
    };

    return {
      ...day,
      slots: [...day.slots.filter((draft) => draft.id !== draftId), updatedDraft],
    };
  });
}

export function parseTimeLabelToHour(timeLabel: string): number | null {
  const minutes = parseTimeLabelToMinutes(timeLabel);
  if (minutes === null) return null;
  return Math.floor(minutes / 60);
}

export function parseTimeLabelToMinutes(timeLabel: string): number | null {
  const parts = parseTimeLabelToParts(timeLabel);
  if (!parts) return null;
  return parts.hour * 60 + parts.minute;
}

export function parseTimeLabelToParts(timeLabel: string): { hour: number; minute: number } | null {
  const parsed = parseTimeLabel(timeLabel);
  if (!parsed) return null;

  return { hour: parsed.hour24, minute: parsed.minute };
}

export function buildScheduledAt(dayId: string, timeLabel: string): string | null {
  const [yearRaw, monthRaw, dayRaw] = dayId.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const timeParts = parseTimeLabelToParts(timeLabel) ?? { hour: 9, minute: 0 };
  const date = new Date(year, month - 1, day, timeParts.hour, timeParts.minute, 0, 0);
  return date.toISOString();
}

export function resolveTimeLabel(
  timeOfDay: string | null | undefined,
  fallbackTimes: string[],
): string {
  if (!timeOfDay) return fallbackTimes[0] ?? '9:00 AM';
  const mapping: Record<string, string> = {
    morning: '9:00 AM',
    afternoon: '1:00 PM',
    evening: '6:00 PM',
  };
  return mapping[timeOfDay] ?? fallbackTimes[0] ?? '9:00 AM';
}

export function formatTimeLabel(isoTime: string) {
  const [h, m] = isoTime.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function formatTimeLabelFromIso(isoString: string): string | null {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return null;
  const hours = parsed.getHours();
  const minutes = parsed.getMinutes();
  return formatTimeLabel(`${hours}:${minutes.toString().padStart(2, '0')}`);
}

export function formatDayIdFromIso(isoString: string): string | null {
  if (!isoString) return null;
  const match = isoString.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}
