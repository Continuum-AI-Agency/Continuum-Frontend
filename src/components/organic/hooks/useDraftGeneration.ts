import * as React from "react";

import type {
  CalendarGenerationRequest,
  CalendarPlacement,
  CalendarPlacementSeed,
} from "@/lib/organic/calendar-generation";
import type { OrganicPlatformKey } from "@/lib/organic/platforms";
import {
  ORGANIC_MVP_PLATFORM_KEYS,
  isOrganicPlatformKey,
} from "@/lib/organic/platforms";
import {
  generationRequestSchema,
  type GenerationRequestPayload,
  type WeeklyGrid,
} from "@/lib/organic/types";
import { useCalendarStore } from "@/lib/organic/store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Trend } from "@/lib/organic/trends";
import { parseWeeklyGridPayload } from "@/lib/organic/weekly-grid";

import {
  ORGANIC_BETA_LAUNCH_SCHEDULE,
  ORGANIC_NEWSLETTER_DEFAULT,
} from "../primitives/organic-calendar-config";
import {
  buildScheduledAt,
  formatDayIdFromIso,
  formatTimeLabelFromIso,
  resolveTimeLabel,
} from "../primitives/calendar-utils";
import { streamCalendarGeneration } from "../primitives/organic-calendar-api";
import type {
  OrganicCalendarDay,
  OrganicCalendarDraft,
  OrganicPlatformTag,
} from "../primitives/types";

const DEFAULT_GRID_PROMPT: GenerationRequestPayload["prompt"] = {
  id: "calendar-weekly-mvp",
  name: "Calendar Weekly MVP",
  description: "Generate a weekly post plan for selected trends.",
  content:
    "Generate a weekly content grid for Instagram and LinkedIn. Keep posts distinct by platform and optimize for posting time.",
  source: "preset",
};

type GridControlValues = {
  language: string;
  userPrompt: string;
  generationPrompt?: string;
};

type GridPlacement = {
  dayId: string;
  draft: OrganicCalendarDraft;
};

function resolvePlacementScheduledAt(dayId: string, timeLabel: string) {
  return buildScheduledAt(dayId, timeLabel) ?? `${dayId}T09:00:00.000Z`;
}

function normalizeDayToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveGridPlatformOrder(activePlatforms: OrganicPlatformKey[]) {
  const mvpSet = new Set<OrganicPlatformKey>(ORGANIC_MVP_PLATFORM_KEYS);
  const preferred = activePlatforms.filter((platform) => mvpSet.has(platform));

  if (preferred.length > 0) {
    return preferred;
  }

  return [...ORGANIC_MVP_PLATFORM_KEYS];
}

function resolveGridDay(rowDay: string, calendarDays: OrganicCalendarDay[], rowIndex: number) {
  const trimmedDay = rowDay.trim();
  if (!trimmedDay) {
    return calendarDays[rowIndex % calendarDays.length] ?? null;
  }

  const dayToken = normalizeDayToken(trimmedDay);
  const exact = calendarDays.find((day) => normalizeDayToken(day.id) === dayToken);
  if (exact) return exact;

  const byLabel = calendarDays.find((day) => {
    const label = normalizeDayToken(day.label);
    return dayToken.startsWith(label) || label.startsWith(dayToken);
  });
  if (byLabel) return byLabel;

  const byDateLabel = calendarDays.find((day) => normalizeDayToken(day.dateLabel) === dayToken);
  if (byDateLabel) return byDateLabel;

  const shorthand = dayToken.slice(0, 3);
  const byShortLabel = calendarDays.find((day) => normalizeDayToken(day.label).slice(0, 3) === shorthand);
  if (byShortLabel) return byShortLabel;

  return calendarDays[rowIndex % calendarDays.length] ?? null;
}

export function mapWeeklyGridToCalendarPlacements({
  weeklyGrid,
  calendarDays,
  selectedTrendIds,
  activePlatforms,
  platformAccountIds,
}: {
  weeklyGrid: WeeklyGrid;
  calendarDays: OrganicCalendarDay[];
  selectedTrendIds: string[];
  activePlatforms: OrganicPlatformKey[];
  platformAccountIds: Partial<Record<OrganicPlatformKey, string>>;
}): GridPlacement[] {
  if (calendarDays.length === 0) {
    return [];
  }

  const platformOrder = resolveGridPlatformOrder(activePlatforms);
  const daySlotCount = new Map<string, number>();

  return weeklyGrid.grid.reduce<GridPlacement[]>((placements, row, index) => {
    const day = resolveGridDay(row.day, calendarDays, index);
    if (!day) {
      return placements;
    }

    const slotIndex = daySlotCount.get(day.id) ?? 0;
    daySlotCount.set(day.id, slotIndex + 1);

    const platform = platformOrder[slotIndex % platformOrder.length] ?? "instagram";
    const trendId = selectedTrendIds.length
      ? selectedTrendIds[index % selectedTrendIds.length]
      : undefined;

    const timeLabel = day.suggestedTimes[slotIndex % day.suggestedTimes.length] ?? "9:00 AM";
    const title = row.title_topic || row.type || "Planned post";
    const objective = row.objective || "Engagement";

    placements.push({
      dayId: day.id,
      draft: {
        id: `grid-${day.id}-${index + 1}`,
        title,
        summary: objective,
        timeLabel,
        dateLabel: `${day.label}, ${day.dateLabel}`,
        status: "draft",
        platforms: [platform],
        format: row.format || row.type || "Post",
        objective,
        captionPreview:
          row.cta?.trim().length
            ? `${title}\n\nCTA: ${row.cta}`
            : "Generated from weekly grid. Refine copy before publishing.",
        tags: [],
        mediaCount: row.num_slides ?? 1,
        seedTrendId: trendId,
        targetAccountId: platformAccountIds[platform],
        titleTopic: row.title_topic || undefined,
        target: row.target || undefined,
        tone: row.tone || undefined,
        cta: row.cta || undefined,
      },
    });

    return placements;
  }, []);
}

function parseJsonSafely(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function safeParseJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function queueGridJob(payload: GenerationRequestPayload): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const response = await fetch("/api/organic/generate-grid", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await safeParseJson(response);
    const message =
      typeof data === "object" && data && "error" in data && typeof data.error === "string"
        ? data.error
        : "Failed to queue organic content generation.";
    throw new Error(message);
  }

  const data = (await response.json()) as { jobId?: string };
  if (!data.jobId) {
    throw new Error("Generation service did not return a job identifier.");
  }

  return data.jobId;
}

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
    gridStatus,
    setGridStatus,
    setGridProgress,
    setGridError,
    addDraft,
    updateDraft: updateDraftById,
    setGhosts,
    addEvent,
    setDays,
  } = useCalendarStore();

  const gridEventSourceRef = React.useRef<EventSource | null>(null);

  const closeGridStream = React.useCallback(() => {
    gridEventSourceRef.current?.close();
    gridEventSourceRef.current = null;
  }, []);

  React.useEffect(() => () => closeGridStream(), [closeGridStream]);

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
    (dayId: string, scheduledAt?: string) => {
      const exactMatch = calendarDays.find((day) => day.id === dayId);
      if (exactMatch) return exactMatch;

      if (scheduledAt) {
        const datePart = formatDayIdFromIso(scheduledAt);
        const dateMatch = calendarDays.find((day) => day.id === datePart);
        if (dateMatch) return dateMatch;
      }

      const relativeMatch = dayId.match(/^day-(\d+)$/);
      if (relativeMatch) {
        const index = Number.parseInt(relativeMatch[1], 10) - 1;
        const indexedDay = calendarDays[index];
        if (indexedDay) return indexedDay;
      }

      return null;
    },
    [calendarDays]
  );

  const mapPlacementToDraft = React.useCallback(
    (placement: CalendarPlacement, existing?: OrganicCalendarDraft | null): OrganicCalendarDraft => {
      const day = resolveDayMeta(placement.schedule.dayId, placement.schedule.scheduledAt);
      const timeLabel =
        formatTimeLabelFromIso(placement.schedule.scheduledAt) ??
        resolveTimeLabel(placement.schedule.timeOfDay ?? null, day?.suggestedTimes ?? []);
      const content = placement.content ?? {};
      const title = content.titleTopic ?? existing?.title ?? "Planned draft";
      const summary =
        placement.creative?.creativeIdea ?? content.objective ?? existing?.summary ?? "Planned draft";
      const caption = placement.copy?.caption ?? existing?.captionPreview ?? "Details incoming.";
      const hashtags = placement.copy?.hashtags;
      let finalCaption = caption;

      if (hashtags) {
        const allTags = [...(hashtags.high || []), ...(hashtags.medium || []), ...(hashtags.low || [])].filter(Boolean);
        if (allTags.length > 0) {
          finalCaption = `${caption}\n\n${allTags.join(" ")}`;
        }
      }

      return {
        id: placement.placementId,
        title,
        summary,
        timeLabel,
        dateLabel: day ? `${day.label}, ${day.dateLabel}` : placement.schedule.dayId,
        status: "draft",
        generationError: undefined,
        generationAttempts: existing?.generationAttempts,
        platforms: [placement.platform.name as OrganicPlatformTag],
        format: content.format ?? content.type ?? existing?.format ?? "Post",
        objective: content.objective ?? existing?.objective ?? "Draft",
        captionPreview: finalCaption,
        tags: [],
        mediaCount: content.numSlides ?? existing?.mediaCount ?? 1,
        adjusted: placement.schedule.adjusted,
        titleTopic: content.titleTopic ?? undefined,
        target: content.target ?? undefined,
        tone: content.tone ?? undefined,
        cta: content.cta ?? undefined,
        creativeIdea: placement.creative?.creativeIdea ?? undefined,
        mediaSuggestion: placement.creative?.mediaSuggestion ?? undefined,
        assetHints: placement.creative?.assetHints ?? undefined,
        hashtags: placement.copy?.hashtags ?? undefined,
      };
    },
    [resolveDayMeta]
  );

  const hydrateCalendarFromGrid = React.useCallback(
    (weeklyGrid: WeeklyGrid) => {
      const placements = mapWeeklyGridToCalendarPlacements({
        weeklyGrid,
        calendarDays,
        selectedTrendIds,
        activePlatforms,
        platformAccountIds,
      });

      setDays(calendarDays.map((day) => ({ ...day, slots: [] })));

      placements.forEach((placement) => {
        addDraft(placement.dayId, placement.draft);
      });

      setGridProgress({
        percent: 100,
        message: `Placed ${placements.length} planned posts on this week.`,
      });
      setGridStatus("complete");
    },
    [
      activePlatforms,
      addDraft,
      calendarDays,
      platformAccountIds,
      selectedTrendIds,
      setDays,
      setGridProgress,
      setGridStatus,
    ]
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
            tags: [],
            mediaCount: 1,
          });
        }
        continue;
      }

      const platform =
        ORGANIC_BETA_LAUNCH_SCHEDULE[day.label as keyof typeof ORGANIC_BETA_LAUNCH_SCHEDULE];
      const trendId = itemsToSchedule[trendIndex];

      if (platform && trendId) {
        const accountId = platformAccountIds[platform as OrganicPlatformKey];
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
            tags: [],
            mediaCount: 1,
            seedTrendId: trendId,
            targetAccountId: accountId,
          });
        }

        trendIndex = (trendIndex + 1) % itemsToSchedule.length;
      }
    }
  }, [calendarDays, selectedTrendIds, trends, addDraft, platformAccountIds]);

  const handleGenerateDrafts = React.useCallback(async () => {
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
        .filter((draft) => draft.status === "placeholder" && Boolean(draft.seedTrendId))
        .map((draft) => {
          const trendId = draft.seedTrendId;
          if (!trendId) return null;

          return {
            placementId: draft.id,
            schedule: {
              dayId: day.id,
              scheduledAt: resolvePlacementScheduledAt(day.id, draft.timeLabel),
              timeLabel: draft.timeLabel,
            },
            platform: {
              name: draft.platforms[0] ?? "instagram",
              accountId:
                draft.targetAccountId ?? platformAccountIds[draft.platforms[0] as OrganicPlatformKey],
            },
            seed: {
              source: "trend" as const,
              trendId,
            },
            content: {
              format: draft.format,
            },
          };
        })
        .filter(Boolean)
    );

    if (seeds.length === 0) {
      setGridStatus("error");
      setGridError("Place at least one trend on the calendar before generating.");
      return;
    }

    let resolvedTz = "UTC";
    try {
      resolvedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      resolvedTz = "UTC";
    }

    try {
      const completedPlacementIds = new Set<string>();
      const failedPlacementIds = new Set<string>();
      const totalPlacements = seeds.length;

      seeds.forEach((seed) => {
        if (!seed) return;
        updateDraftById(seed.placementId, (draft) => ({
          ...draft,
          status: "streaming",
          generationError: undefined,
          generationAttempts: (draft.generationAttempts ?? 0) + 1,
        }));
      });

      const mvpSet = new Set<OrganicPlatformKey>(ORGANIC_MVP_PLATFORM_KEYS);
      const preferredMvpPlatforms = activePlatforms.filter((platform) => mvpSet.has(platform));
      const seedsByPlatform = new Map<OrganicPlatformKey, CalendarPlacementSeed[]>();

      for (const seed of seeds as CalendarPlacementSeed[]) {
        const platform = seed.platform.name;
        const existing = seedsByPlatform.get(platform) ?? [];
        existing.push(seed);
        seedsByPlatform.set(platform, existing);
      }

      const updateGlobalProgress = (message?: string) => {
        const processed = completedPlacementIds.size + failedPlacementIds.size;
        setGridProgress({
          percent: Math.min(99, Math.max(10, Math.round((processed / totalPlacements) * 100))),
          message,
        });
      };

      for (const [platform, platformSeeds] of seedsByPlatform.entries()) {
        const platformAccountId =
          platformAccountIds[platform] ??
          platformSeeds[0]?.platform.accountId ??
          null;

        if (!platformAccountId) {
          throw new Error(`Missing account id for ${platform} batch.`);
        }

        let batchError: string | null = null;

        const payload: CalendarGenerationRequest = {
          brandProfileId,
          weekStart: weekStartId,
          timezone: resolvedTz,
          placements: platformSeeds,
          platformAccountIds: { [platform]: platformAccountId } as Record<OrganicPlatformKey, string>,
          options: {
            schedulePreset: "beta-launch" as const,
            includeNewsletter: true,
            guidancePrompt: undefined,
            preferredPlatforms:
              preferredMvpPlatforms.length > 0 ? [platform] : undefined,
            assetGeneration: {
              enabled: true,
              provider: "nano-banana",
              model: "2-flash",
              thumbnailSize: 512,
            },
          },
        };

        await streamCalendarGeneration(payload, (event) => {
          addEvent({
            id: crypto.randomUUID(),
            type: event.type,
            timestamp: new Date().toISOString(),
            data: event,
          });

          if (event.type === "progress") {
            const message = event.stage
              ? `[${platform.toUpperCase()}][${event.stage.toUpperCase()}] ${event.message ?? "Generating..."}`
              : `[${platform.toUpperCase()}] ${event.message ?? "Generating content..."}`;
            updateGlobalProgress(message);
            return;
          }

          if (event.type === "slot_started") {
            updateDraftById(event.placementId, (draft) => ({
              ...draft,
              status: "streaming",
              generationError: undefined,
            }));
            return;
          }

          if (event.type === "slot_failed") {
            if (!completedPlacementIds.has(event.placementId) && !failedPlacementIds.has(event.placementId)) {
              failedPlacementIds.add(event.placementId);
            }
            updateDraftById(event.placementId, (draft) => ({
              ...draft,
              status: "failed",
              generationError: event.message,
              generationAttempts: event.attempts ?? draft.generationAttempts,
            }));
            updateGlobalProgress(
              `${completedPlacementIds.size}/${totalPlacements} generated, ${failedPlacementIds.size} failed.`
            );
            return;
          }

          if (event.type === "slot_completed" || event.type === "placement") {
            const placement = event.placement;
            if (completedPlacementIds.has(placement.placementId)) {
              return;
            }
            completedPlacementIds.add(placement.placementId);
            const existing = drafts.find((draft) => draft.id === placement.placementId) ?? null;
            const nextDraft = mapPlacementToDraft(placement, existing);

            const targetDay = resolveDayMeta(placement.schedule.dayId, placement.schedule.scheduledAt);
            if (targetDay) {
              addDraft(targetDay.id, nextDraft);
              setGhosts(targetDay.id, 0);
            }
            updateGlobalProgress(
              `${completedPlacementIds.size}/${totalPlacements} generated, ${failedPlacementIds.size} failed.`
            );
            return;
          }

          if (event.type === "error") {
            batchError = event.message;
          }
        });

        if (batchError) {
          throw new Error(batchError);
        }
      }

      const failed = failedPlacementIds.size;
      const succeeded = completedPlacementIds.size;
      const hasFailures = failed > 0;
      setGridProgress({
        percent: 100,
        message: hasFailures
          ? `Generated ${succeeded}/${totalPlacements} posts. ${failed} failed and can be retried.`
          : `Generated ${succeeded}/${totalPlacements} posts.`,
      });
      setGridStatus(hasFailures ? "complete_with_errors" : "complete");
      setGridError(null);
    } catch (error) {
      setGridStatus("error");
      setGridError(error instanceof Error ? error.message : "Generation failed. Please try again.");
    }
  }, [
    activePlatforms,
    addDraft,
    addEvent,
    brandProfileId,
    calendarDays,
    drafts,
    mapPlacementToDraft,
    platformAccountIds,
    resolveDayMeta,
    setGhosts,
    setGridError,
    setGridProgress,
    setGridStatus,
    updateDraftById,
    weekStartId,
  ]);

  const handleGenerateGridJob = React.useCallback(
    async ({ language, userPrompt, generationPrompt }: GridControlValues) => {
      closeGridStream();
      setGridError(null);
      setGridStatus("running");
      setGridProgress({ percent: 5, message: "Queuing weekly grid generation..." });

      if (!brandProfileId) {
        setGridStatus("error");
        setGridError("Missing brand context. Please reconnect your brand profile.");
        return;
      }

      const mvpSet = new Set<OrganicPlatformKey>(ORGANIC_MVP_PLATFORM_KEYS);
      const availableAccountIds = Object.entries(platformAccountIds).reduce<
        Record<OrganicPlatformKey, string>
      >((acc, [platform, accountId]) => {
        if (
          accountId &&
          isOrganicPlatformKey(platform) &&
          mvpSet.has(platform)
        ) {
          acc[platform] = accountId;
        }
        return acc;
      }, {} as Record<OrganicPlatformKey, string>);

      if (Object.keys(availableAccountIds).length === 0) {
        setGridStatus("error");
        setGridError("Connect at least one Instagram or LinkedIn account.");
        return;
      }

      const payload = generationRequestSchema.parse({
        platformAccountIds: availableAccountIds,
        language: language.trim() || "English",
        userPrompt:
          userPrompt.trim() ||
          "Create a weekly organic post plan from the selected trends with platform-specific copy.",
        generationPrompt: generationPrompt?.trim() || undefined,
        selectedTrendIds,
        prompt: DEFAULT_GRID_PROMPT,
      });

      try {
        const jobId = await queueGridJob(payload);
        setGridProgress({ percent: 10, message: "Generation job queued. Waiting for stream..." });

        const source = new EventSource(
          `/api/organic/generate-grid/events?job_id=${encodeURIComponent(jobId)}`
        );
        gridEventSourceRef.current = source;

        const handleStreamError = (message: string) => {
          closeGridStream();
          setGridStatus("error");
          setGridError(message);
        };

        source.addEventListener("progress", (event) => {
          const payload = parseJsonSafely((event as MessageEvent).data) as {
            completed?: number;
            total?: number;
            message?: string;
            detail?: string;
          };

          const completed = payload?.completed;
          const total = payload?.total;
          const percent =
            typeof completed === "number" && typeof total === "number" && total > 0
              ? Math.max(10, Math.round((completed / total) * 100))
              : 30;

          setGridProgress({
            percent,
            message: payload?.message ?? payload?.detail ?? "Generating weekly grid...",
          });
        });

        source.addEventListener("complete", (event) => {
          const streamPayload = parseJsonSafely((event as MessageEvent).data);
          const grid = parseWeeklyGridPayload(streamPayload);
          if (!grid) {
            handleStreamError("Received an invalid weekly grid payload.");
            return;
          }

          hydrateCalendarFromGrid(grid);
          closeGridStream();
        });

        source.addEventListener("error", (event) => {
          const streamPayload = parseJsonSafely((event as MessageEvent).data) as {
            error?: string;
            detail?: string;
            message?: string;
          };
          handleStreamError(
            streamPayload?.error ??
              streamPayload?.message ??
              streamPayload?.detail ??
              "The generation stream closed unexpectedly."
          );
        });

        source.onerror = () => {
          handleStreamError("The generation stream closed unexpectedly.");
        };
      } catch (error) {
        setGridStatus("error");
        setGridError(error instanceof Error ? error.message : "Unable to start grid generation.");
      }
    },
    [
      brandProfileId,
      closeGridStream,
      hydrateCalendarFromGrid,
      platformAccountIds,
      selectedTrendIds,
      setGridError,
      setGridProgress,
      setGridStatus,
    ]
  );

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

      const trendId = draft.seedTrendId;
      if (!trendId) return;
      const platformKey = (draft.platforms[0] ?? "instagram") as OrganicPlatformKey;
      const batchAccountId = draft.targetAccountId ?? platformAccountIds[platformKey];
      if (!batchAccountId) {
        setGridError(`Missing account id for ${platformKey} batch.`);
        return;
      }

      updateDraftById(draftId, (current) => ({
        ...current,
        status: "streaming",
        generationError: undefined,
        generationAttempts: (current.generationAttempts ?? 0) + 1,
      }));

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      try {
        const completedPlacementIds = new Set<string>();
        await streamCalendarGeneration(
          {
            brandProfileId,
            weekStart: weekStartId,
            timezone,
            placements: [
              {
                placementId: draft.id,
                schedule: {
                  dayId,
                  scheduledAt: resolvePlacementScheduledAt(dayId, draft.timeLabel),
                  timeLabel: draft.timeLabel,
                },
                platform: {
                  name: platformKey,
                  accountId: batchAccountId,
                },
                seed: {
                  source: "trend" as const,
                  trendId,
                },
                content: {
                  format: draft.format,
                },
              },
            ],
            platformAccountIds: {
              [platformKey]: batchAccountId,
            } as Record<OrganicPlatformKey, string>,
            options: {
              assetGeneration: {
                enabled: true,
                provider: "nano-banana",
                model: "2-flash",
                thumbnailSize: 512,
              },
            },
          },
          (event) => {
            addEvent({
              id: crypto.randomUUID(),
              type: event.type,
              timestamp: new Date().toISOString(),
              data: event,
            });

            if (event.type === "slot_failed") {
              updateDraftById(draftId, (current) => ({
                ...current,
                status: "failed",
                generationError: event.message,
                generationAttempts: event.attempts ?? current.generationAttempts,
              }));
              return;
            }

            if (event.type === "slot_completed" || event.type === "placement") {
              if (completedPlacementIds.has(event.placement.placementId)) {
                return;
              }
              completedPlacementIds.add(event.placement.placementId);
              const next = mapPlacementToDraft(event.placement, draft);
              addDraft(dayId, next);
              return;
            }
            if (event.type === "error") {
              setGridError(event.message);
            }
          }
        );
      } catch {
        updateDraftById(draftId, (current) => ({
          ...current,
          status: "failed",
          generationError: "Regeneration failed. Retry or clear this slot.",
        }));
      }
    },
    [
      addDraft,
      addEvent,
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

  const handleClearFailure = React.useCallback(
    (draftId: string) => {
      updateDraftById(draftId, (draft) => ({
        ...draft,
        status: draft.seedTrendId ? "placeholder" : "draft",
        generationError: undefined,
      }));
    },
    [updateDraftById]
  );

  return {
    seededDraftCount,
    gridStatus,
    handleAutoSort,
    handleGenerateDrafts,
    handleGenerateGridJob,
    handleRegenerate,
    handleClearFailure,
  };
}
