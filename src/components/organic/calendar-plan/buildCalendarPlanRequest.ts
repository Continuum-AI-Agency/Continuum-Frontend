import {
  bulkContentFormatEnum,
  type CalendarPlanPlacement,
  type CalendarPlanProposeRequest,
  calendarPlanProposeRequestSchema,
  organicGeneratablePlatformSchema,
} from '@continuum/contracts';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import { buildScheduledAt, formatDayId } from '../primitives/calendar-utils';
import type { OrganicCalendarDay } from '../primitives/types';

const DEFAULT_TIME_LABEL = '10:00 AM';

type GeneratablePlatform = CalendarPlanPlacement['platform'];

function isGeneratable(platform: string): platform is GeneratablePlatform {
  return organicGeneratablePlatformSchema.safeParse(platform).success;
}

function toFormat(format: string): CalendarPlanPlacement['format'] {
  const parsed = bulkContentFormatEnum.safeParse(format.toLowerCase());
  return parsed.success ? parsed.data : undefined;
}

export type BuildCalendarPlanRequestInput = {
  brandId: string;
  weekStart: Date;
  weekDays: OrganicCalendarDay[];
  activePlatforms: OrganicPlatformKey[];
  accountIds: Partial<Record<string, string>>;
  selectedTrendIds: string[];
};

type Slot = Omit<CalendarPlanPlacement, 'trendId'>;

function placeholderSlots(input: BuildCalendarPlanRequestInput): Slot[] {
  return input.weekDays.flatMap((day) =>
    day.slots.flatMap((draft) => {
      const platform = draft.platforms[0];
      if (draft.status !== 'placeholder' || !platform || !isGeneratable(platform)) return [];
      const scheduledAt = buildScheduledAt(day.id, draft.timeLabel || DEFAULT_TIME_LABEL);
      if (!scheduledAt) return [];
      return [
        {
          placementId: crypto.randomUUID(),
          platform,
          format: toFormat(draft.format),
          dayId: day.id,
          scheduledAt,
          accountId: input.accountIds[platform] ?? draft.targetAccountId ?? null,
        },
      ];
    }),
  );
}

function gridSlots(input: BuildCalendarPlanRequestInput): Slot[] {
  const platforms = input.activePlatforms.filter(isGeneratable);
  // Mirrors buildPlannerPlatforms: a planner with no connected platform still has an
  // Instagram row, so Generate proposes for it too.
  const rows: GeneratablePlatform[] = platforms.length > 0 ? platforms : ['instagram'];
  return input.weekDays.flatMap((day) =>
    rows.flatMap((platform) => {
      const scheduledAt = buildScheduledAt(day.id, DEFAULT_TIME_LABEL);
      if (!scheduledAt) return [];
      return [
        {
          placementId: crypto.randomUUID(),
          platform,
          dayId: day.id,
          scheduledAt,
          accountId: input.accountIds[platform] ?? null,
        },
      ];
    }),
  );
}

/**
 * The slots the calendar's Generate button proposes for. Placeholders the user sketched
 * into the week win — each is their own "I want a post here". With none, one slot per
 * visible day per active platform at the planner's default posting time. Selected trends
 * are dealt round-robin across the slots.
 */
export function buildCalendarPlanRequest(
  input: BuildCalendarPlanRequestInput,
): CalendarPlanProposeRequest {
  const placeholders = placeholderSlots(input);
  const slots = placeholders.length > 0 ? placeholders : gridSlots(input);
  const trendIds = input.selectedTrendIds;
  const placements = slots.map((slot, index) => ({
    ...slot,
    trendId: trendIds.length > 0 ? trendIds[index % trendIds.length] : null,
  }));
  return calendarPlanProposeRequestSchema.parse({
    brandId: input.brandId,
    weekStart: formatDayId(input.weekStart),
    placements,
  });
}
