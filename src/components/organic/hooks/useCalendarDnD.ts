import {
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardCode,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '@/components/ui/ToastProvider';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import { isPostPlatform, postFormatOptions, postPlatformLabel } from '@/lib/organic/postPlatforms';
import { useCalendarStore } from '@/lib/organic/store';
import {
  formatTimeLabel,
  makeCalendarDay,
  parseTimeLabelToHour,
} from '../primitives/calendar-utils';
import { ORGANIC_BETA_LAUNCH_SCHEDULE } from '../primitives/organic-calendar-config';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicPlatformTag,
  OrganicSeedDragPayload,
} from '../primitives/types';
import type { UseRescheduleDraftResult } from './useRescheduleDraft';

export function parsePlannerCellId(
  id: string,
): { dayId: string; platform?: OrganicPlatformTag } | null {
  if (!id.startsWith('planner-cell::')) return null;
  const [, dayId, platformRaw] = id.split('::');
  if (!dayId) return null;

  return {
    dayId,
    platform: isPostPlatform(platformRaw) ? platformRaw : undefined,
  };
}

/** "Tue, Oct 20 · Instagram" for a planner cell id — what a screen reader hears, not the id. */
export function plannerCellLabel(id: UniqueIdentifier): string | null {
  const cell = parsePlannerCellId(String(id));
  if (!cell) return null;
  const { label, dateLabel } = makeCalendarDay(cell.dayId);
  const day = label ? `${label}, ${dateLabel}` : cell.dayId;
  return cell.platform ? `${day} · ${postPlatformLabel(cell.platform)}` : day;
}

const ARROW_KEYS: readonly string[] = [
  KeyboardCode.Right,
  KeyboardCode.Left,
  KeyboardCode.Down,
  KeyboardCode.Up,
];

/**
 * An arrow key carries a picked-up draft to the nearest cell in that direction. dnd-kit's
 * sortable getter moved nothing here: it needs the dragged id to be a droppable too, and a
 * draft is only draggable. "In that direction" is measured from the dragged rect's centre,
 * so the cell it sits in is never the next one. The rect lands CENTRED on the cell: the
 * overlay card is wider than a narrow cell, and the keyboard collision reads its centre.
 */
export const plannerCellKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  if (!ARROW_KEYS.includes(event.code)) return undefined;
  event.preventDefault();
  const { active, collisionRect, droppableRects, droppableContainers } = context;
  if (!active || !collisionRect) return undefined;

  const centerX = collisionRect.left + collisionRect.width / 2;
  const centerY = collisionRect.top + collisionRect.height / 2;
  const ahead = droppableContainers.getEnabled().filter((container) => {
    const rect = droppableRects.get(container.id);
    if (!rect) return false;
    if (event.code === KeyboardCode.Right) return rect.left >= centerX;
    if (event.code === KeyboardCode.Left) return rect.right <= centerX;
    if (event.code === KeyboardCode.Down) return rect.top >= centerY;
    return rect.bottom <= centerY;
  });
  const [closest] = closestCorners({
    active,
    collisionRect,
    droppableRects,
    droppableContainers: ahead,
    pointerCoordinates: null,
  });
  const rect = closest ? droppableRects.get(closest.id) : undefined;
  if (!rect) return undefined;
  return {
    x: rect.left + (rect.width - collisionRect.width) / 2,
    y: rect.top + (rect.height - collisionRect.height) / 2,
  };
};

// Every format the planner knows. A draft in any other (a HyperFrame, a legacy "Video")
// is not refused here: nothing says which platforms take it.
const KNOWN_FORMATS = postFormatOptions([]).map((option) => option.toLowerCase());

/**
 * Why `draft` cannot move onto `platform`'s row, or null when it can. A drop on another
 * platform's row restamps the draft onto that platform, so a Story dropped on Facebook
 * became a Facebook Story, which nothing can publish. A group is several rows: it moves to
 * a day on any of its own platforms' rows, and changes platforms only from its menu.
 */
export function crossPlatformDropRefusal(
  draft: Pick<OrganicCalendarDraft, 'format' | 'platforms' | 'groupMembers'>,
  platform: OrganicPlatformTag,
): string | null {
  if ((draft.groupMembers?.length ?? 0) > 1) {
    return draft.platforms.includes(platform)
      ? null
      : 'Change its platforms with "Change platforms" on the post';
  }
  if (draft.platforms.length === 1 && draft.platforms[0] === platform) return null;
  const format = draft.format.trim().toLowerCase();
  // Stated outright: a Story draft can come from the agent even where the picker offers none.
  if (format === 'story') return platform === 'instagram' ? null : 'Stories only post to Instagram';
  if (!KNOWN_FORMATS.includes(format)) return null;
  if (postFormatOptions([platform]).some((option) => option.toLowerCase() === format)) {
    return null;
  }
  if (platform === 'youtube') return 'YouTube takes video reels only';
  return `${postPlatformLabel(platform)} does not take a ${draft.format}`;
}

function buildSeededDraft({
  day,
  time,
  data,
  platform,
  platformAccountIds,
}: {
  day: OrganicCalendarDay | null;
  time: string;
  data: OrganicSeedDragPayload;
  platform: OrganicPlatformTag;
  platformAccountIds: Partial<Record<OrganicPlatformKey, string>>;
}): OrganicCalendarDraft {
  const trendId = data.trendId;
  // Seeded drafts now persist, so their id becomes the row's client_key under
  // UNIQUE (brand_id, client_key). A `seeded-${Date.now()}` id would collapse two
  // seeds dropped in the same millisecond onto one row.
  const draftId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `seeded-${crypto.randomUUID()}`
      : `seeded-${Date.now()}`;

  return {
    id: draftId,
    clientKey: draftId,
    title: 'Draft',
    summary: '',
    timeLabel: formatTimeLabel(time),
    dateLabel: day ? `${day.label}, ${day.dateLabel}` : 'Unassigned',
    status: 'placeholder',
    platforms: [platform],
    format: 'Post',
    objective: 'Draft',
    // The browser autosave only persists origin 'manual' drafts, and a seeded draft
    // needs a backendDraftId before the enrichment ladder can act on it. Safe because
    // nothing on the server mints a competing row for a trend seed any more — the
    // batch generate path that used to is gone.
    origin: 'manual',
    creativeIdea: '',
    captionPreview: '',
    tags: [],
    // No media exists yet; presence is derived downstream from real assets.
    mediaCount: 0,
    seedTrendId: trendId,
    targetAccountId: platformAccountIds[platform],
  };
}

export function useCalendarDnD(
  days: OrganicCalendarDay[],
  drafts: OrganicCalendarDraft[],
  platformAccountIds: Partial<Record<OrganicPlatformKey, string>>,
  selectedIds: string[],
  rescheduler: UseRescheduleDraftResult,
) {
  const { show } = useToast();
  const { addDraft } = useCalendarStore(useShallow((state) => ({ addDraft: state.addDraft })));
  const [activeDragDraft, setActiveDragDraft] = React.useState<OrganicCalendarDraft | null>(null);

  const draftsById = React.useMemo(() => {
    const map = new Map<string, OrganicCalendarDraft>();
    drafts.forEach((draft) => {
      map.set(draft.id, draft);
    });
    return map;
  }, [drafts]);

  const daysById = React.useMemo(() => {
    const map = new Map<string, OrganicCalendarDay>();
    days.forEach((day) => {
      map.set(day.id, day);
    });
    return map;
  }, [days]);
  // The native drop handler reaches every memoised week cell, so it reads the days when a
  // drop lands instead of closing over them: a draft edit must not hand each cell a new one.
  const daysByIdRef = React.useRef(daysById);
  daysByIdRef.current = daysById;

  const handleDragStart = React.useCallback(
    (event: DragStartEvent) => {
      const draftId = event.active.id as string;
      const draft = draftsById.get(draftId);
      if (draft) setActiveDragDraft(draft);
    },
    [draftsById],
  );

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      setActiveDragDraft(null);
      const { active, over, delta } = event;
      // Picked up and put down without moving: nothing to do. Without this a keyboard
      // Space, Space on an undated dock row dropped it on whichever cell was nearest.
      if (!over || (delta.x === 0 && delta.y === 0)) return;

      const draftId = active.id as string;
      const overId = String(over.id);
      const activeData = active.data.current as {
        type?: string;
        trendId?: string;
        title?: string;
      } | null;

      if (activeData?.type === 'draft') {
        const plannerCell = parsePlannerCellId(overId);

        if (plannerCell) {
          const draft = draftsById.get(draftId);
          const refusal =
            draft && plannerCell.platform
              ? crossPlatformDropRefusal(draft, plannerCell.platform)
              : null;
          if (refusal) {
            show({
              title: refusal,
              description: `"${draft?.title || 'Untitled'}" stays where it was.`,
              variant: 'warning',
            });
            return;
          }

          // A week cell names a platform row, and the dragged draft takes it; a month
          // cell names none. The reschedule hook restamps and persists both together.
          const retarget = plannerCell.platform
            ? {
                draftId,
                platform: plannerCell.platform,
                accountId: platformAccountIds[plannerCell.platform],
              }
            : undefined;

          // A multi-select drag moves the whole selection (previously only the dragged
          // id moved); a single drag moves just the dragged draft.
          if (selectedIds.includes(draftId) && selectedIds.length > 1) {
            void rescheduler.rescheduleMany(selectedIds, plannerCell.dayId, retarget);
          } else {
            void rescheduler.reschedule(draftId, plannerCell.dayId, retarget);
          }
          return;
        }

        const targetDay = daysById.get(overId);
        if (targetDay) {
          void rescheduler.reschedule(draftId, targetDay.id);
        }
      }
    },
    [daysById, draftsById, platformAccountIds, selectedIds, rescheduler, show],
  );

  const handleNativeDrop = React.useCallback(
    async (
      dayId: string,
      time: string,
      data: OrganicSeedDragPayload,
      platformKey?: OrganicPlatformTag,
    ) => {
      if (data.type !== 'trend' && data.type !== 'question' && data.type !== 'event') {
        return;
      }

      const trendId = data.trendId;
      if (!trendId) return;

      const targetDay = daysByIdRef.current.get(dayId);
      if (!targetDay) return;

      const fallbackPlatform = (ORGANIC_BETA_LAUNCH_SCHEDULE[
        targetDay.label as keyof typeof ORGANIC_BETA_LAUNCH_SCHEDULE
      ] ?? 'instagram') as OrganicPlatformTag;

      const platform = platformKey ?? fallbackPlatform;

      let finalTime = time;
      if (targetDay.slots.length > 0) {
        const sortedSlots = [...targetDay.slots].sort((a, b) => {
          const hoursA = parseTimeLabelToHour(a.timeLabel) ?? 0;
          const hoursB = parseTimeLabelToHour(b.timeLabel) ?? 0;
          return hoursA - hoursB;
        });

        const lastSlot = sortedSlots[sortedSlots.length - 1];
        if (lastSlot) {
          const lastHour = parseTimeLabelToHour(lastSlot.timeLabel) ?? 9;
          const nextHour = (lastHour + 2) % 24;
          finalTime = `${nextHour.toString().padStart(2, '0')}:00`;
        }
      }

      const seededDraft = buildSeededDraft({
        day: targetDay,
        time: finalTime,
        data,
        platform,
        platformAccountIds,
      });

      const existingSeeded = targetDay.slots.some(
        (slot) => slot.seedTrendId === trendId && slot.status === 'placeholder',
      );

      addDraft(dayId, seededDraft);

      show({
        title: existingSeeded ? 'Duplicate trend seeded' : 'Placeholder created',
        description: existingSeeded
          ? `"${data.title ?? 'Trend'}" already has a placeholder on ${targetDay.label}. Added another.`
          : `"${data.title ?? 'Trend'}" added to ${targetDay.label}, ${targetDay.dateLabel}`,
        variant: 'info',
      });
    },
    [addDraft, platformAccountIds, show],
  );

  return {
    activeDragDraft,
    handleDragStart,
    handleDragEnd,
    handleNativeDrop,
  };
}
