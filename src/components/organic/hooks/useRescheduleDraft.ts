'use client';

import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  makeCalendarDay,
  UNSCHEDULED_DAY_ID,
} from '@/components/organic/primitives/calendar-utils';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicPlatformTag,
} from '@/components/organic/primitives/types';
import { useToast } from '@/components/ui/ToastProvider';
import { isPostPlatform } from '@/lib/organic/postPlatforms';
import { useCalendarStore } from '@/lib/organic/store';
import { scheduleFieldPatch, useDraftFieldPersistence } from './useDraftFieldEditor';

const DAY_ID_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// Bulk selections can be large; persist a bounded number of PATCHes at a time so a
// 50-draft move does not open 50 concurrent connections.
const PERSIST_CONCURRENCY = 4;

/** A drop on a platform's row: the dragged draft moves to that platform as well as that day. */
export type PlatformRetarget = {
  draftId: string;
  platform: OrganicPlatformTag;
  /** The destination platform's default account, if the brand has one. */
  accountId: string | undefined;
};

type RescheduleSnapshot = {
  fromDayId: string;
  draft: OrganicCalendarDraft;
  /** The draft as it reads on its new platform, or null when its platform is unchanged. */
  retargeted: OrganicCalendarDraft | null;
};

function isReschedulableDay(dayId: string): boolean {
  return dayId !== UNSCHEDULED_DAY_ID && DAY_ID_PATTERN.test(dayId);
}

/**
 * The draft restamped onto `retarget.platform`, or null when the drop changes nothing about
 * its platform. Never the source platform's account: an Instagram id on a TikTok draft is
 * refused at publish. `groupMembers` moves too, because publish reads its targets there.
 */
export function retargetDraft(
  draft: OrganicCalendarDraft,
  retarget: Pick<PlatformRetarget, 'platform' | 'accountId'>,
): OrganicCalendarDraft | null {
  // A fan-out card is N rows; restamping its source row alone would strand the siblings.
  if ((draft.groupMembers?.length ?? 0) > 1) return null;
  if (draft.platforms.length === 1 && draft.platforms[0] === retarget.platform) return null;
  return {
    ...draft,
    platforms: [retarget.platform],
    targetAccountId:
      draft.platforms[0] === retarget.platform ? draft.targetAccountId : retarget.accountId,
    groupMembers: draft.groupMembers?.map((member) => ({ ...member, platform: retarget.platform })),
  };
}

function snapshotDraft(
  days: OrganicCalendarDay[],
  draftId: string,
  retarget: PlatformRetarget | undefined,
): RescheduleSnapshot | null {
  for (const day of days) {
    const draft = day.slots.find((slot) => slot.id === draftId);
    if (draft) {
      return {
        fromDayId: day.id,
        draft,
        retargeted: retarget?.draftId === draftId ? retargetDraft(draft, retarget) : null,
      };
    }
  }
  return null;
}

function isNoOp(snapshot: RescheduleSnapshot, targetDayId: string): boolean {
  return snapshot.fromDayId === targetDayId && !snapshot.retargeted;
}

function dateLabelForDay(days: OrganicCalendarDay[], targetDayId: string): string {
  const day = days.find((item) => item.id === targetDayId) ?? makeCalendarDay(targetDayId);
  return `${day.label}, ${day.dateLabel}`;
}

/** The store fields a move rewrites, so a rollback restores exactly those. */
function movedFields(
  snapshot: RescheduleSnapshot,
  dateLabel: string,
): Partial<OrganicCalendarDraft> {
  const { platforms, targetAccountId, groupMembers } = snapshot.retargeted ?? snapshot.draft;
  return { dateLabel, platforms, targetAccountId, groupMembers };
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
  reschedule: (draftId: string, targetDayId: string, retarget?: PlatformRetarget) => Promise<void>;
  rescheduleMany: (
    draftIds: string[],
    targetDayId: string,
    retarget?: PlatformRetarget,
  ) => Promise<void>;
};

/**
 * Move one or many drafts to a new day, and the dragged one onto a new platform row:
 * optimistic store move (keeping each chip's time-of-day) plus the persist. A rejected
 * write rolls its draft back to where it started.
 *
 * Manual-origin drafts used to be excluded from the PATCH and left to the debounced
 * browser autosave, on the theory that its signature covered the dayId. It did not
 * persist the move, so a manual drag silently snapped back. The field-edit route
 * rewrites a manual draft's `slot_data.dayId` server-side, so every origin now moves
 * the same way. The platform used to be restamped in the store only, so the next
 * refetch put the card back on its old row; it is persisted with the move now.
 */
export function useRescheduleDraft(): UseRescheduleDraftResult {
  const { show } = useToast();
  const { moveDraft, bulkMoveDrafts, updateDraft, requestCalendarRefetch } = useCalendarStore(
    useShallow((state) => ({
      moveDraft: state.moveDraft,
      bulkMoveDrafts: state.bulkMoveDrafts,
      updateDraft: state.updateDraft,
      requestCalendarRefetch: state.requestCalendarRefetch,
    })),
  );

  const { persistDraftFields } = useDraftFieldPersistence();

  // One PATCH through the field-edit route carries the platform and the day. The route
  // restamps the row's platform, account and slot_data under its own CAS guard, so the
  // browser never writes the row (it used to, straight to Supabase, for the platform).
  const persistDraft = React.useCallback(
    async (snapshot: RescheduleSnapshot, targetDayId: string): Promise<boolean> => {
      const { draft, retargeted } = snapshot;
      if (!draft.backendDraftId) return true;
      const movesDay = snapshot.fromDayId !== targetDayId;
      const schedule = movesDay ? scheduleFieldPatch(targetDayId, draft.timeLabel) : null;
      if (movesDay && !schedule) return false;
      const platform = retargeted?.platforms[0];
      if (retargeted && !isPostPlatform(platform)) return false;
      if (!schedule && !retargeted) return true;
      const result = await persistDraftFields(
        { id: draft.id, backendDraftId: draft.backendDraftId, updatedAt: draft.updatedAt },
        {
          ...schedule,
          ...(retargeted && isPostPlatform(platform)
            ? { platform, accountId: retargeted.targetAccountId ?? null }
            : {}),
        },
      );
      if (result.ok && result.updatedAt) {
        const updatedAt = result.updatedAt;
        updateDraft(draft.id, (current) => ({ ...current, updatedAt }));
      }
      return result.ok;
    },
    [persistDraftFields, updateDraft],
  );

  const applyMove = React.useCallback(
    (snapshot: RescheduleSnapshot, dateLabel: string) => {
      updateDraft(snapshot.draft.id, (draft) => ({
        ...draft,
        ...movedFields(snapshot, dateLabel),
      }));
    },
    [updateDraft],
  );

  const rollback = React.useCallback(
    (snapshot: RescheduleSnapshot, targetDayId: string) => {
      if (snapshot.fromDayId !== targetDayId) moveDraft(snapshot.draft.id, snapshot.fromDayId);
      updateDraft(snapshot.draft.id, (draft) => ({
        ...draft,
        ...movedFields({ ...snapshot, retargeted: null }, snapshot.draft.dateLabel),
      }));
      // A platform write that landed before the day PATCH failed is on the server; a
      // refetch shows the row as it really is rather than the restored guess.
      if (snapshot.retargeted) requestCalendarRefetch();
    },
    [moveDraft, updateDraft, requestCalendarRefetch],
  );

  const reschedule = React.useCallback(
    async (draftId: string, targetDayId: string, retarget?: PlatformRetarget): Promise<void> => {
      if (!isReschedulableDay(targetDayId)) return;
      const { days } = useCalendarStore.getState();
      const snapshot = snapshotDraft(days, draftId, retarget);
      if (!snapshot || isNoOp(snapshot, targetDayId)) return;

      if (snapshot.fromDayId !== targetDayId) moveDraft(draftId, targetDayId);
      applyMove(snapshot, dateLabelForDay(days, targetDayId));

      const ok = await persistDraft(snapshot, targetDayId);
      if (!ok) {
        rollback(snapshot, targetDayId);
        show({
          title: 'Reschedule failed',
          description: 'Could not move the post. It was restored to its original slot.',
          variant: 'error',
        });
      }
    },
    [moveDraft, applyMove, persistDraft, rollback, show],
  );

  const rescheduleMany = React.useCallback(
    async (draftIds: string[], targetDayId: string, retarget?: PlatformRetarget): Promise<void> => {
      if (!isReschedulableDay(targetDayId)) return;
      const { days } = useCalendarStore.getState();
      const snapshots = draftIds
        .map((id) => snapshotDraft(days, id, retarget))
        .filter((s): s is RescheduleSnapshot => s !== null && !isNoOp(s, targetDayId));
      if (snapshots.length === 0) return;

      const nextDateLabel = dateLabelForDay(days, targetDayId);
      const movingIds = snapshots.filter((s) => s.fromDayId !== targetDayId).map((s) => s.draft.id);

      bulkMoveDrafts(movingIds, targetDayId);
      for (const snapshot of snapshots) applyMove(snapshot, nextDateLabel);

      const failures: RescheduleSnapshot[] = [];
      await runChunked(snapshots, PERSIST_CONCURRENCY, async (snapshot) => {
        const ok = await persistDraft(snapshot, targetDayId);
        if (!ok) failures.push(snapshot);
      });

      if (failures.length > 0) {
        for (const snapshot of failures) rollback(snapshot, targetDayId);
        show({
          title: 'Some posts could not be moved',
          description: `${failures.length} of ${snapshots.length} could not be rescheduled and were restored.`,
          variant: 'error',
        });
      }
    },
    [bulkMoveDrafts, applyMove, persistDraft, rollback, show],
  );

  return { reschedule, rescheduleMany };
}
