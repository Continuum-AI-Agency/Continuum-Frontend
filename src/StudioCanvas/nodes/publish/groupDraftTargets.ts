import type { OrganicCanvasTarget } from '@continuum/contracts';
import {
  formatDayId,
  formatWeekHeading,
  startOfWeek,
} from '@/components/organic/primitives/calendar-utils';

export type DraftTargetGroup = {
  /** Stable key — a week-start day id, or the unscheduled sentinel. */
  key: string;
  heading: string;
  targets: OrganicCanvasTarget[];
};

const UNSCHEDULED_KEY = 'unscheduled';

/**
 * Search results grouped the way the Planner itself reads: by week, soonest first, with
 * everything undated collected at the end.
 *
 * A flat list of "Untitled draft · instagram · draft" rows is unusable past about five
 * results — the week heading is what makes a draft identifiable at a glance, and the
 * server already sorts soonest-scheduled-first so group order falls out of the input.
 */
export function groupDraftTargets(targets: readonly OrganicCanvasTarget[]): DraftTargetGroup[] {
  const groups: DraftTargetGroup[] = [];
  const byKey = new Map<string, DraftTargetGroup>();

  for (const target of targets) {
    const scheduled = target.scheduledAt ? new Date(target.scheduledAt) : null;
    const valid = scheduled && !Number.isNaN(scheduled.getTime());
    const weekStart = valid ? startOfWeek(scheduled) : null;
    const key = weekStart ? formatDayId(weekStart) : UNSCHEDULED_KEY;
    const existing = byKey.get(key);
    if (existing) {
      existing.targets.push(target);
      continue;
    }
    const group: DraftTargetGroup = {
      key,
      heading: weekStart ? formatWeekHeading(weekStart) : 'Unscheduled',
      targets: [target],
    };
    byKey.set(key, group);
    groups.push(group);
  }

  // Unscheduled last regardless of where it first appeared in the input.
  return [
    ...groups.filter((group) => group.key !== UNSCHEDULED_KEY),
    ...groups.filter((group) => group.key === UNSCHEDULED_KEY),
  ];
}

/** The scheduled-date window a relative range names, as inclusive ISO bounds. */
export function draftWindowRange(
  range: 'any' | 'week' | 'month' | 'past',
  now: Date,
): { scheduledFrom?: string; scheduledTo?: string } {
  if (range === 'any') return {};
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === 'past') return { scheduledTo: start.toISOString() };
  const end = new Date(start);
  end.setDate(end.getDate() + (range === 'week' ? 7 : 30));
  return { scheduledFrom: start.toISOString(), scheduledTo: end.toISOString() };
}
