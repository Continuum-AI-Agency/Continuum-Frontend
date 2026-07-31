'use client';

import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  makeCalendarDay,
  UNSCHEDULED_DAY_ID,
} from '@/components/organic/primitives/calendar-utils';
import type { OrganicCalendarDay } from '@/components/organic/primitives/types';
import { useToast } from '@/components/ui/ToastProvider';
import { useCalendarStore } from '@/lib/organic/store';
import { scheduleFieldPatch, useDraftFieldPersistence } from './useDraftFieldEditor';

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
  updatedAt?: string | null;
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
        updatedAt: found.updatedAt,
        origin: found.origin,
      };
    }
  }
  return null;
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
 * time-of-day) plus a brand-scoped PATCH through the shared field-edit path. A rejected
 * PATCH rolls its draft back to where it started.
 *
 * Manual-origin drafts used to be excluded from the PATCH and left to the debounced
 * browser autosave, on the theory that its signature covered the dayId. It did not
 * persist the move, so a manual drag silently snapped back. The field-edit route
 * rewrites a manual draft's `slot_data.dayId` server-side, so every origin now moves
 * the same way.
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

  const { persistDraftFields } = useDraftFieldPersistence();

  const persistDraft = React.useCallback(
    async (snapshot: RescheduleSnapshot, targetDayId: string): Promise<boolean> => {
      if (!snapshot.backendDraftId) return true;
      const patch = scheduleFieldPatch(targetDayId, snapshot.timeLabel);
      if (!patch) return false;
      // The field-edit route, not the reschedule route: it is what rewrites a
      // manual draft's `slot_data.dayId` server-side. Manual drafts used to be
      // excluded here entirely and left to the browser autosave, which is why a
      // manual drag never persisted.
      const result = await persistDraftFields(
        {
          id: snapshot.draftId,
          backendDraftId: snapshot.backendDraftId,
          updatedAt: snapshot.updatedAt,
        },
        patch,
      );
      return result.ok;
    },
    [persistDraftFields],
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

      const nextDateLabel = dateLabelForDay(days, targetDayId);

      moveDraft(draftId, targetDayId);
      updateDraft(draftId, (draft) => ({ ...draft, dateLabel: nextDateLabel }));

      const ok = await persistDraft(snapshot, targetDayId);
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

      const failures: RescheduleSnapshot[] = [];
      await runChunked(snapshots, PERSIST_CONCURRENCY, async (snapshot) => {
        const ok = await persistDraft(snapshot, targetDayId);
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
