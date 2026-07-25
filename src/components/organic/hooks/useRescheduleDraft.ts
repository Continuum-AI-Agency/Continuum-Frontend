'use client';

import {
  applyPlannerFutureFloor,
  organicRescheduleDraftRequestSchema,
  plannerInstantFromDayTime,
} from '@continuum/contracts';
import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  makeCalendarDay,
  UNSCHEDULED_DAY_ID,
} from '@/components/organic/primitives/calendar-utils';
import type { OrganicCalendarDay } from '@/components/organic/primitives/types';
import { useToast } from '@/components/ui/ToastProvider';
import { request } from '@/lib/api/http';
import { useCalendarStore } from '@/lib/organic/store';

const DAY_ID_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// Bulk selections can be large; persist a bounded number of PATCHes at a time so a
// 50-draft move does not open 50 concurrent connections.
const PERSIST_CONCURRENCY = 4;

type RescheduleSnapshot = {
  draftId: string;
  fromDayId: string;
  dateLabel: string;
  timeLabel: string;
  backendDraftId?: string;
  origin?: 'manual' | 'agent';
};

function isReschedulableDay(dayId: string): boolean {
  return dayId !== UNSCHEDULED_DAY_ID && DAY_ID_PATTERN.test(dayId);
}

function snapshotDraft(days: OrganicCalendarDay[], draftId: string): RescheduleSnapshot | null {
  for (const day of days) {
    const found = day.slots.find((slot) => slot.id === draftId);
    if (found) {
      return {
        draftId,
        fromDayId: day.id,
        dateLabel: found.dateLabel,
        timeLabel: found.timeLabel,
        backendDraftId: found.backendDraftId,
        origin: found.origin,
      };
    }
  }
  return null;
}

// The new day keeps the chip's existing time-of-day; floor to the future if that lands
// in the past. Both steps come from @continuum/contracts so a drag here and a
// `planner_manage action=reschedule` call on the Backend normalize identically —
// same time-of-day carry-over, same zone resolution, same past guard.
function computeScheduledDate(targetDayId: string, timeLabel: string): string | null {
  const built = plannerInstantFromDayTime({ dayId: targetDayId, timeOfDay: timeLabel });
  if (!built) return null;
  return applyPlannerFutureFloor(built);
}

function dateLabelForDay(days: OrganicCalendarDay[], targetDayId: string): string {
  const day = days.find((item) => item.id === targetDayId) ?? makeCalendarDay(targetDayId);
  return `${day.label}, ${day.dateLabel}`;
}

async function runChunked<T>(
  items: T[],
  size: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(worker));
  }
}

export type UseRescheduleDraftResult = {
  reschedule: (draftId: string, targetDayId: string) => Promise<void>;
  rescheduleMany: (draftIds: string[], targetDayId: string) => Promise<void>;
};

/**
 * Move one or many drafts to a new day: optimistic store move (keeping each chip's
 * time-of-day) plus a brand-scoped PATCH to persist the new scheduled_date. Manual-origin
 * drafts are excluded from the PATCH — they re-persist through the debounced browser
 * autosave (whose signature includes the dayId), so PATCHing them would double-write and
 * race that autosave. A rejected PATCH rolls its draft back to where it started.
 */
export function useRescheduleDraft(): UseRescheduleDraftResult {
  const { show } = useToast();
  const { moveDraft, bulkMoveDrafts, updateDraft } = useCalendarStore(
    useShallow((state) => ({
      moveDraft: state.moveDraft,
      bulkMoveDrafts: state.bulkMoveDrafts,
      updateDraft: state.updateDraft,
    })),
  );

  const persistDraft = React.useCallback(
    async (snapshot: RescheduleSnapshot, scheduledDate: string): Promise<boolean> => {
      if (!snapshot.backendDraftId || snapshot.origin === 'manual') return true;
      try {
        await request({
          path: `/api/organic/calendar/drafts/${snapshot.backendDraftId}/reschedule`,
          method: 'PATCH',
          body: organicRescheduleDraftRequestSchema.parse({ scheduled_date: scheduledDate }),
        });
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const rollback = React.useCallback(
    (snapshot: RescheduleSnapshot) => {
      moveDraft(snapshot.draftId, snapshot.fromDayId);
      updateDraft(snapshot.draftId, (draft) => ({ ...draft, dateLabel: snapshot.dateLabel }));
    },
    [moveDraft, updateDraft],
  );

  const reschedule = React.useCallback(
    async (draftId: string, targetDayId: string): Promise<void> => {
      if (!isReschedulableDay(targetDayId)) return;
      const { days } = useCalendarStore.getState();
      const snapshot = snapshotDraft(days, draftId);
      if (!snapshot || snapshot.fromDayId === targetDayId) return;

      const scheduledDate = computeScheduledDate(targetDayId, snapshot.timeLabel);
      if (!scheduledDate) return;
      const nextDateLabel = dateLabelForDay(days, targetDayId);

      moveDraft(draftId, targetDayId);
      updateDraft(draftId, (draft) => ({ ...draft, dateLabel: nextDateLabel }));

      const ok = await persistDraft(snapshot, scheduledDate);
      if (!ok) {
        rollback(snapshot);
        show({
          title: 'Reschedule failed',
          description: 'Could not move the post. It was restored to its original slot.',
          variant: 'error',
        });
      }
    },
    [moveDraft, updateDraft, persistDraft, rollback, show],
  );

  const rescheduleMany = React.useCallback(
    async (draftIds: string[], targetDayId: string): Promise<void> => {
      if (!isReschedulableDay(targetDayId)) return;
      const { days } = useCalendarStore.getState();
      const snapshots = draftIds
        .map((id) => snapshotDraft(days, id))
        .filter((s): s is RescheduleSnapshot => s !== null && s.fromDayId !== targetDayId);
      if (snapshots.length === 0) return;

      const nextDateLabel = dateLabelForDay(days, targetDayId);
      const movingIds = snapshots.map((s) => s.draftId);

      bulkMoveDrafts(movingIds, targetDayId);
      for (const snapshot of snapshots) {
        updateDraft(snapshot.draftId, (draft) => ({ ...draft, dateLabel: nextDateLabel }));
      }

      const plans = snapshots
        .map((snapshot) => {
          const scheduledDate = computeScheduledDate(targetDayId, snapshot.timeLabel);
          return scheduledDate ? { snapshot, scheduledDate } : null;
        })
        .filter(
          (plan): plan is { snapshot: RescheduleSnapshot; scheduledDate: string } => plan !== null,
        );

      const failures: RescheduleSnapshot[] = [];
      await runChunked(plans, PERSIST_CONCURRENCY, async ({ snapshot, scheduledDate }) => {
        const ok = await persistDraft(snapshot, scheduledDate);
        if (!ok) failures.push(snapshot);
      });

      if (failures.length > 0) {
        for (const snapshot of failures) rollback(snapshot);
        show({
          title: 'Some posts could not be moved',
          description: `${failures.length} of ${movingIds.length} could not be rescheduled and were restored.`,
          variant: 'error',
        });
      }
    },
    [bulkMoveDrafts, updateDraft, persistDraft, rollback, show],
  );

  return { reschedule, rescheduleMany };
}
