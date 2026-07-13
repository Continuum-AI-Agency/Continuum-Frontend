import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '@/components/ui/ToastProvider';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import { useCalendarStore } from '@/lib/organic/store';
import { formatTimeLabel, parseTimeLabelToHour } from '../primitives/calendar-utils';
import { ORGANIC_BETA_LAUNCH_SCHEDULE } from '../primitives/organic-calendar-config';
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicPlatformTag,
  OrganicSeedDragPayload,
} from '../primitives/types';

function isSchedulablePlatformTag(value: string | undefined): value is OrganicPlatformTag {
  return value === 'instagram' || value === 'linkedin';
}

function parsePlannerCellId(id: string): { dayId: string; platform?: OrganicPlatformTag } | null {
  if (!id.startsWith('planner-cell::')) return null;
  const [, dayId, platformRaw] = id.split('::');
  if (!dayId) return null;

  return {
    dayId,
    platform: isSchedulablePlatformTag(platformRaw) ? platformRaw : undefined,
  };
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
) {
  const { show } = useToast();
  const { moveDraft, addDraft, updateDraft } = useCalendarStore(
    useShallow((state) => ({
      moveDraft: state.moveDraft,
      addDraft: state.addDraft,
      updateDraft: state.updateDraft,
    })),
  );
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
      const { active, over } = event;
      if (!over) return;

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
          const targetDay = daysById.get(plannerCell.dayId);

          updateDraft(draftId, (draft) => ({
            ...draft,
            dateLabel: targetDay ? `${targetDay.label}, ${targetDay.dateLabel}` : draft.dateLabel,
            platforms: plannerCell.platform ? [plannerCell.platform] : draft.platforms,
            targetAccountId:
              plannerCell.platform && platformAccountIds[plannerCell.platform]
                ? platformAccountIds[plannerCell.platform]
                : draft.targetAccountId,
          }));

          moveDraft(draftId, plannerCell.dayId);
          return;
        }

        const targetDay = daysById.get(overId);
        if (targetDay) {
          updateDraft(draftId, (draft) => ({
            ...draft,
            dateLabel: `${targetDay.label}, ${targetDay.dateLabel}`,
          }));
          moveDraft(draftId, targetDay.id);
        }
      }
    },
    [daysById, moveDraft, platformAccountIds, updateDraft],
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

      const targetDay = daysById.get(dayId);
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
    [addDraft, daysById, platformAccountIds, show],
  );

  return {
    activeDragDraft,
    handleDragStart,
    handleDragEnd,
    handleNativeDrop,
  };
}
