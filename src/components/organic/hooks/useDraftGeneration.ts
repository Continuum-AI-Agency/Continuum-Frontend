import * as React from "react";
import { useCalendarStore } from "@/lib/organic/store";
import type { 
  OrganicCalendarDay, 
  OrganicCalendarDraft, 
  OrganicPlatformTag 
} from "../primitives/types";
import { 
  ORGANIC_BETA_LAUNCH_SCHEDULE, 
  ORGANIC_NEWSLETTER_DEFAULT 
} from "../primitives/organic-calendar-config";
import { 
  buildScheduledAt, 
  formatTimeLabel, 
  formatTimeLabelFromIso, 
  resolveTimeLabel 
} from "../primitives/calendar-utils";
import { streamCalendarGeneration } from "../primitives/organic-calendar-api";
import type { Trend } from "@/lib/organic/trends";
import type { OrganicPlatformKey } from "@/lib/organic/platforms";
import type { 
  CalendarPlacement, 
  CalendarPlacementSeed 
} from "@/lib/organic/calendar-generation";

export function useDraftGeneration({
  brandProfileId,
  calendarDays,
  drafts,
  selectedTrendIds,
  trends,
  platformAccountIds,
  activePlatforms,
  weekStartId,
}: {
  brandProfileId?: string;
  calendarDays: OrganicCalendarDay[];
  drafts: OrganicCalendarDraft[];
  selectedTrendIds: string[];
  trends: Trend[];
  platformAccountIds: Partial<Record<OrganicPlatformKey, string>>;
  activePlatforms: OrganicPlatformKey[];
  weekStartId: string;
}) {
  const {
    setGridStatus,
    setGridProgress,
    setGridError,
    addDraft,
    updateDraft: updateDraftById,
    setGhosts,
  } = useCalendarStore();

  const seededDraftCount = React.useMemo(
    () =>
      calendarDays.reduce(
        (count, day) =>
          count + day.slots.filter((slot) => slot.status === "placeholder").length,
        0
      ),
    [calendarDays]
  );

  const resolveDayMeta = React.useCallback(
    (dayId: string) => calendarDays.find((day) => day.id === dayId) ?? null,
    [calendarDays]
  );

  const mapPlacementToDraft = React.useCallback(
    (placement: CalendarPlacement, existing?: OrganicCalendarDraft | null): OrganicCalendarDraft => {
      const day = resolveDayMeta(placement.schedule.dayId);
      const timeLabel =
        formatTimeLabelFromIso(placement.schedule.scheduledAt) ??
        resolveTimeLabel(placement.schedule.timeOfDay ?? null, day?.suggestedTimes ?? []);
      const content = placement.content ?? {};
      const seedTrendId = placement.seed?.trendId ?? null;
      const tags = seedTrendId ? [seedTrendId] : existing?.tags ?? [];
      const title = content.titleTopic ?? existing?.title ?? "Planned draft";
      const summary = placement.creative?.creativeIdea ?? content.objective ?? existing?.summary ?? "Planned draft";
      const caption = placement.copy?.caption ?? existing?.captionPreview ?? "Details incoming.";

      return {
        id: placement.placementId,
        title,
        summary,
        timeLabel,
        dateLabel: day ? `${day.label}, ${day.dateLabel}` : placement.schedule.dayId,
        status: "draft",
        platforms: [placement.platform.name as OrganicPlatformTag],
        format: content.format ?? content.type ?? existing?.format ?? "Post",
        objective: content.objective ?? existing?.objective ?? "Draft",
        captionPreview: caption,
        tags,
        mediaCount: content.numSlides ?? existing?.mediaCount ?? 1,
        adjusted: placement.schedule.adjusted,
      };
    },
    [resolveDayMeta]
  );

  const handleAutoSort = React.useCallback(async () => {
    let trendIndex = 0;
    const itemsToSchedule = [...selectedTrendIds];

    if (itemsToSchedule.length === 0 && trends.length > 0) {
      itemsToSchedule.push(...trends.slice(0, 6).map((trend) => trend.id));
    }

    if (itemsToSchedule.length === 0) return;

    for (const day of calendarDays) {
      if (day.label === ORGANIC_NEWSLETTER_DEFAULT.dayLabel) {
        const newsletterId = `newsletter-${day.id}`;
        const alreadyExists = day.slots.some((slot) => slot.id === newsletterId);
        if (!alreadyExists) {
          addDraft(day.id, {
            id: newsletterId,
            title: "Weekly Newsletter",
            summary: "Distill the week's top insights into an email.",
            timeLabel: ORGANIC_NEWSLETTER_DEFAULT.timeLabel,
            dateLabel: `${day.label}, ${day.dateLabel}`,
            status: "draft",
            platforms: ["instagram"],
            format: ORGANIC_NEWSLETTER_DEFAULT.format,
            objective: "Retention",
            captionPreview: "Drafting your weekly recap...",
            tags: ["newsletter"],
            mediaCount: 1,
          });
        }
        continue;
      }

      const platform = ORGANIC_BETA_LAUNCH_SCHEDULE[day.label as keyof typeof ORGANIC_BETA_LAUNCH_SCHEDULE];
      const trendId = itemsToSchedule[trendIndex];

      if (platform && trendId) {
        const accountId = platformAccountIds[platform as OrganicPlatformKey];
        const trend = trends.find((item) => item.id === trendId);
        const tags = trend?.tags?.includes("question")
          ? [trendId, "question"]
          : trend?.tags?.includes("event")
          ? [trendId, "event"]
          : [trendId];
        const seedId = `seed-${day.id}-${trendId}`;
        const alreadyExists = day.slots.some((slot) => slot.id === seedId);
        if (!alreadyExists) {
          addDraft(day.id, {
            id: seedId,
            title: "Seeded topic",
            summary: "Ready to generate once you press build.",
            timeLabel: day.suggestedTimes[0] ?? "9:00 AM",
            dateLabel: `${day.label}, ${day.dateLabel}`,
            status: "placeholder",
            platforms: [platform as OrganicPlatformTag],
            format: "Post",
            objective: "Generation Seed",
            captionPreview: "Click Generate to construct this post.",
            tags,
            mediaCount: 1,
            seedTrendId: trendId,
            targetAccountId: accountId,
          });
        }

        trendIndex = (trendIndex + 1) % itemsToSchedule.length;
      }
    }
  }, [calendarDays, selectedTrendIds, trends, addDraft, platformAccountIds]);

  const handleGenerateDrafts = async () => {
    setGridStatus("running");
    setGridProgress({ percent: 0, message: "Preparing calendar seeds..." });
    setGridError(null);

    if (!brandProfileId) {
      setGridStatus("error");
      setGridError("Missing brand context. Please reconnect your brand profile.");
      return;
    }

    const seeds = calendarDays.flatMap((day) =>
      day.slots
        .filter((draft) => draft.status === "placeholder" && (draft.seedTrendId || draft.tags.length > 0))
        .map((draft) => {
          const trendId = draft.seedTrendId ?? draft.tags[0];
          if (!trendId) return null;
          const seedSource = draft.tags.includes("question")
            ? "question"
            : draft.tags.includes("event")
            ? "event"
            : "trend";
          return {
            placementId: draft.id,
            trendId,
            dayId: day.id,
            scheduledAt: buildScheduledAt(day.id, draft.timeLabel) ?? day.id,
            timeLabel: draft.timeLabel,
            platform: draft.platforms[0] ?? "instagram",
            accountId: draft.targetAccountId ?? platformAccountIds[draft.platforms[0] as OrganicPlatformKey],
            seedSource,
            desiredFormat: draft.format,
          };
        })
        .filter(Boolean)
    );

    if (seeds.length === 0) {
      setGridStatus("error");
      setGridError("Seed the calendar with trends or questions before generating.");
      return;
    }

    seeds.forEach((seed) => {
      if (!seed) return;
      updateDraftById(seed.placementId, (draft) => ({
        ...draft,
        status: "streaming",
      }));
    });

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    try {
      await streamCalendarGeneration(
        {
          brandProfileId,
          weekStart: weekStartId,
          timezone,
          placements: seeds as CalendarPlacementSeed[],
          platformAccountIds: platformAccountIds as Record<OrganicPlatformKey, string>,
          options: {
            schedulePreset: "beta-launch",
            includeNewsletter: true,
            guidancePrompt: undefined,
            preferredPlatforms: activePlatforms.length > 0 ? activePlatforms : undefined,
          },
        },
        (event) => {
          if (event.type === "progress") {
            const message = event.stage 
              ? `[${event.stage.toUpperCase()}] ${event.message ?? "Generating..."}`
              : event.message ?? "Generating content...";
            setGridProgress({
              percent: Math.round((event.completed / event.total) * 100),
              message,
            });
            return;
          }

          if (event.type === "placement") {
            const placement = event.placement;
            const existing = drafts.find((draft) => draft.id === placement.placementId) ?? null;
            const nextDraft = mapPlacementToDraft(placement, existing);
            addDraft(placement.schedule.dayId, nextDraft);
            setGhosts(placement.schedule.dayId, 0);
            return;
          }

          if (event.type === "error") {
            setGridError(event.message);
            setGridStatus("error");
            return;
          }

          if (event.type === "complete") {
            setGridStatus("complete");
          }
        }
      );
    } catch (error) {
      setGridStatus("error");
      setGridError(
        error instanceof Error ? error.message : "Generation failed. Please try again."
      );
    }
  };

  const handleRegenerate = React.useCallback(
    async (draftId: string) => {
      const draft = drafts.find((item) => item.id === draftId);
      if (!draft) return;

      if (!brandProfileId) {
        setGridError("Missing brand context. Please reconnect your brand profile.");
        return;
      }

      const dayId = calendarDays.find((day) => day.slots.some((slot) => slot.id === draftId))?.id;
      if (!dayId) return;

      const trendId = draft.seedTrendId ?? draft.tags[0];
      if (!trendId) return;
      const seedSource = draft.tags.includes("question")
        ? "question"
        : draft.tags.includes("event")
        ? "event"
        : "trend";

      updateDraftById(draftId, (current) => ({ ...current, status: "streaming" }));

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      try {
        await streamCalendarGeneration(
          {
            brandProfileId,
            weekStart: weekStartId,
            timezone,
            placements: [
              {
                placementId: draft.id,
                trendId,
                dayId,
                scheduledAt: buildScheduledAt(dayId, draft.timeLabel) ?? dayId,
                timeLabel: draft.timeLabel,
                platform: draft.platforms[0] ?? "instagram",
                accountId: draft.targetAccountId ?? platformAccountIds[draft.platforms[0] as OrganicPlatformKey],
                seedSource,
                desiredFormat: draft.format,
              },
            ],
            platformAccountIds: platformAccountIds as Record<OrganicPlatformKey, string>,
          },
          (event) => {
            if (event.type === "placement") {
              const next = mapPlacementToDraft(event.placement, draft);
              addDraft(dayId, next);
              return;
            }
            if (event.type === "error") {
              setGridError(event.message);
            }
          }
        );
      } catch (e) {
        updateDraftById(draftId, (current) => ({ ...current, status: "draft" }));
      }
    },
    [
      addDraft,
      brandProfileId,
      calendarDays,
      drafts,
      mapPlacementToDraft,
      platformAccountIds,
      setGridError,
      updateDraftById,
      weekStartId,
    ]
  );

  return {
    seededDraftCount,
    handleAutoSort,
    handleGenerateDrafts,
    handleRegenerate,
  };
}
