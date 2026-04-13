import * as React from "react";
import { useShallow } from "zustand/react/shallow";

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
import { parseWeeklyGridPayload } from "@/lib/organic/weekly-grid";

import { useToast } from "@/components/ui/ToastProvider";
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

type PlacementMediaSuggestion = NonNullable<
  NonNullable<CalendarPlacement["creative"]>["mediaSuggestion"]
>;
type PlacementMediaAsset = NonNullable<NonNullable<PlacementMediaSuggestion["assets"]>[number]>;

function normalizeTimestamp(value?: string): string {
  if (!value) return "";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

function buildSeedScheduleKey({
  dayId,
  scheduledAt,
  platform,
}: {
  dayId: string;
  scheduledAt?: string;
  platform: string;
}) {
  const normalizedDayId = dayId || (scheduledAt ? formatDayIdFromIso(scheduledAt) : "") || "";
  const normalizedScheduledAt = normalizeTimestamp(scheduledAt);
  return `${platform}::${normalizedDayId}::${normalizedScheduledAt}`;
}

function resolvePlacementScheduledAt(dayId: string, timeLabel: string) {
  return buildScheduledAt(dayId, timeLabel) ?? `${dayId}T09:00:00.000Z`;
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toDataUrl(base64: string, mimeType?: string | null): string {
  const normalized = base64.trim();
  if (normalized.startsWith("data:")) return normalized;
  const mime = hasText(mimeType) ? mimeType.trim() : "image/png";
  return `data:${mime};base64,${normalized}`;
}

function resolvePrimaryMediaAsset(
  mediaSuggestion: PlacementMediaSuggestion
): PlacementMediaAsset | undefined {
  const assets = Array.isArray(mediaSuggestion.assets) ? mediaSuggestion.assets : [];
  const withBase64 = assets.filter(
    (asset): asset is PlacementMediaAsset => !!asset && hasText(asset.assetBase64)
  );
  if (withBase64.length === 0) return undefined;
  return withBase64.sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER))[0];
}

function normalizeMediaSuggestionAssetUrl(
  mediaSuggestion?: PlacementMediaSuggestion | null
): PlacementMediaSuggestion | undefined {
  if (!mediaSuggestion) return undefined;
  const rawAssetUrl =
    hasText(mediaSuggestion.assetUrl) ? mediaSuggestion.assetUrl.trim() : "";
  if (rawAssetUrl.length > 0) {
    return {
      ...mediaSuggestion,
      assetUrl: rawAssetUrl,
    };
  }

  if (hasText(mediaSuggestion.assetBase64)) {
    return {
      ...mediaSuggestion,
      assetUrl: toDataUrl(mediaSuggestion.assetBase64, "image/png"),
    };
  }

  const primaryAsset = resolvePrimaryMediaAsset(mediaSuggestion);
  if (!primaryAsset || !hasText(primaryAsset.assetBase64)) return mediaSuggestion;

  return {
    ...mediaSuggestion,
    provider: mediaSuggestion.provider ?? primaryAsset.provider ?? null,
    model: mediaSuggestion.model ?? primaryAsset.model ?? null,
    prompt: mediaSuggestion.prompt ?? primaryAsset.prompt ?? null,
    width: mediaSuggestion.width ?? primaryAsset.width ?? null,
    height: mediaSuggestion.height ?? primaryAsset.height ?? null,
    assetBase64: mediaSuggestion.assetBase64 ?? primaryAsset.assetBase64 ?? null,
    generationContext:
      mediaSuggestion.generationContext ?? primaryAsset.generationContext ?? null,
    assetUrl: toDataUrl(primaryAsset.assetBase64, primaryAsset.mimeType),
  };
}

function normalizeDayToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveProgressStageFloor(stage?: string): number {
  if (stage === "analyzing") return 14;
  if (stage === "optimizing") return 24;
  if (stage === "drafting") return 56;
  if (stage === "matching") return 72;
  if (stage === "finalizing") return 90;
  return 10;
}


function resolveSlotStageFloor(stage: string): number {
  if (stage === "concepting") return 15;
  if (stage === "drafting") return 30;
  if (stage === "generating_assets") return 55;
  if (stage === "reviewing") return 60;
  if (stage === "revising") return 75;
  if (stage === "merging") return 95;
  return 5;
}

const GRID_STAGE_LABELS: Record<string, string> = {
  analyzing: "Reading brand context",
  optimizing: "Planning schedule",
  drafting: "Writing content",
  matching: "Generating visuals",
  finalizing: "Polishing details",
};

function formatGridProgressMessage({
  platform,
  stage,
  message,
}: {
  platform: string;
  stage?: string;
  message?: string;
}) {
  const prefix = `[${platform.toUpperCase()}]`;
  const stageLabel = stage
    ? `${GRID_STAGE_LABELS[stage] ?? stage} · `
    : "";
  const detail = message?.trim();
  if (detail) {
    return `${prefix} ${stageLabel}${detail}`;
  }
  return stage ? `${prefix} ${GRID_STAGE_LABELS[stage] ?? stage}` : prefix;
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
  platformAccountIds,
  activePlatforms,
  weekStartId,
}: {
  brandProfileId?: string;
  calendarDays: OrganicCalendarDay[];
  drafts: OrganicCalendarDraft[];
  selectedTrendIds: string[];
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
    bulkDeleteDrafts,
    updateDraft: updateDraftById,
    setGhosts,
    addEvent,
    setDays,
  } = useCalendarStore(
    useShallow((state) => ({
      gridStatus: state.gridStatus,
      setGridStatus: state.setGridStatus,
      setGridProgress: state.setGridProgress,
      setGridError: state.setGridError,
      addDraft: state.addDraft,
      bulkDeleteDrafts: state.bulkDeleteDrafts,
      updateDraft: state.updateDraft,
      setGhosts: state.setGhosts,
      addEvent: state.addEvent,
      setDays: state.setDays,
    }))
  );

  const { show: showToast } = useToast();

  const gridEventSourceRef = React.useRef<EventSource | null>(null);

  const closeGridStream = React.useCallback(() => {
    gridEventSourceRef.current?.close();
    gridEventSourceRef.current = null;
  }, []);

  React.useEffect(
    () => () => {
      const { gridStatus } = useCalendarStore.getState();
      closeGridStream();
      if (gridStatus === "running") {
        useCalendarStore.getState().setGridStatus("error");
        useCalendarStore
          .getState()
          .setGridError("Generation was interrupted. You can regenerate when ready.");
      }
    },
    [closeGridStream]
  );

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
    (
      placement: CalendarPlacement,
      existing?: OrganicCalendarDraft | null,
      draftIdOverride?: string
    ): OrganicCalendarDraft => {
      const day = resolveDayMeta(placement.schedule.dayId, placement.schedule.scheduledAt);
      const timeLabel =
        formatTimeLabelFromIso(placement.schedule.scheduledAt) ??
        resolveTimeLabel(placement.schedule.timeOfDay ?? null, day?.suggestedTimes ?? []);
      const content = placement.content ?? {};
      const title = content.titleTopic ?? existing?.title ?? "Planned draft";
      const summary =
        placement.creative?.creativeIdea ?? content.objective ?? existing?.summary ?? "Planned draft";
      const finalCaption = placement.copy?.caption ?? existing?.captionPreview ?? "Details incoming.";
      const mediaSuggestion = normalizeMediaSuggestionAssetUrl(placement.creative?.mediaSuggestion);
      const publishingAssets =
        mediaSuggestion?.assetUrl && mediaSuggestion.assetUrl.trim().length > 0
          ? [
              {
                role: "primary",
                kind: "image" as const,
                storagePath: mediaSuggestion.assetUrl,
                storageUrl: mediaSuggestion.assetUrl,
                mimeType:
                  typeof mediaSuggestion.provider === "string" &&
                  mediaSuggestion.provider.toLowerCase().includes("video")
                    ? "video/mp4"
                    : "image/png",
                width: mediaSuggestion.width ?? undefined,
                height: mediaSuggestion.height ?? undefined,
                generationContext: mediaSuggestion.generationContext,
              },
            ]
          : existing?.publishingAssets;

      return {
        id: draftIdOverride ?? existing?.id ?? placement.placementId,
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
        mediaSuggestion,
        publishingAssets,
        assetHints: placement.creative?.assetHints ?? undefined,
        hashtags: placement.copy?.hashtags ?? undefined,
        creativeDirectionPrompt: existing?.creativeDirectionPrompt,
        thumbnailPrompt: existing?.thumbnailPrompt,
      };
    },
    [resolveDayMeta]
  );

  const buildDraftMetadata = React.useCallback((draft: OrganicCalendarDraft) => {
    const metadata: Record<string, string> = {};

    if (draft.creativeDirectionPrompt?.trim()) {
      metadata.creativeDirectionPrompt = draft.creativeDirectionPrompt.trim();
    }

    if (draft.thumbnailPrompt?.trim()) {
      metadata.thumbnailPrompt = draft.thumbnailPrompt.trim();
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }, []);

  const hydrateCalendarFromGrid = React.useCallback(
    (weeklyGrid: WeeklyGrid) => {
      const placements = mapWeeklyGridToCalendarPlacements({
        weeklyGrid,
        calendarDays,
        selectedTrendIds,
        activePlatforms,
        platformAccountIds,
      });

      const nextDaysById = new Map(
        calendarDays.map((day) => [day.id, { ...day, slots: [] as OrganicCalendarDraft[] }])
      );
      placements.forEach((placement) => {
        const targetDay = nextDaysById.get(placement.dayId);
        if (!targetDay) return;
        targetDay.slots.push(placement.draft);
      });

      setDays(
        calendarDays.map(
          (day) => nextDaysById.get(day.id) ?? { ...day, slots: [] as OrganicCalendarDraft[] }
        )
      );

      setGridProgress({
        percent: 100,
        message: `Placed ${placements.length} planned posts on this week.`,
        completed: placements.length,
        total: placements.length,
      });
      setGridStatus("complete");
      showToast({
        title: "Generation complete",
        description: `All ${placements.length} posts generated`,
        variant: "success",
      });
    },
    [
      activePlatforms,
      calendarDays,
      platformAccountIds,
      selectedTrendIds,
      setDays,
      setGridProgress,
      setGridStatus,
      showToast,
    ]
  );

  const handleAutoSort = React.useCallback(async () => {
    let trendIndex = 0;
    const itemsToSchedule = [...selectedTrendIds];

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
  }, [calendarDays, selectedTrendIds, addDraft, platformAccountIds]);

  const handleGenerateDrafts = React.useCallback(async () => {
    setGridStatus("running");
    setGridProgress({
      percent: 0,
      message: "Preparing calendar seeds...",
      completed: 0,
      total: 0,
      failed: 0,
      stage: "analyzing",
    });
    setGridError(null);

    if (!brandProfileId) {
      setGridStatus("error");
      setGridError("Missing brand context. Please reconnect your brand profile.");
      return;
    }

    const seeds = calendarDays.flatMap((day) =>
      day.slots
        .filter((draft) => draft.status === "placeholder")
        .map((draft) => {
          const trendId = draft.seedTrendId;

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
            seed: trendId
              ? {
                  source: "trend" as const,
                  trendId,
                }
              : {
                  source: "manual" as const,
                },
            content: {
              format: draft.format,
            },
            metadata: buildDraftMetadata(draft),
          };
        })
    );

    if (seeds.length === 0) {
      setGridStatus("error");
      setGridError("Create at least one draft placeholder before generating.");
      return;
    }

    setGridProgress({
      percent: 10,
      message: `0/${seeds.length} completed`,
      completed: 0,
      total: seeds.length,
      failed: 0,
      stage: "analyzing",
    });

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
      const seededPlacementIds = new Set(seeds.map((seed) => seed.placementId));
      setDays(
        calendarDays.map((day) => ({
          ...day,
          slots: day.slots.map((slot) =>
            seededPlacementIds.has(slot.id)
              ? {
                  ...slot,
                  status: "streaming",
                  generationError: undefined,
                  generationAttempts: (slot.generationAttempts ?? 0) + 1,
                }
              : slot
          ),
        }))
      );

      const mvpSet = new Set<OrganicPlatformKey>(ORGANIC_MVP_PLATFORM_KEYS);
      const preferredMvpPlatforms = activePlatforms.filter((platform) => mvpSet.has(platform));
      const seedsByPlatform = new Map<OrganicPlatformKey, CalendarPlacementSeed[]>();

      for (const seed of seeds as CalendarPlacementSeed[]) {
        const platform = seed.platform.name;
        const existing = seedsByPlatform.get(platform) ?? [];
        existing.push(seed);
        seedsByPlatform.set(platform, existing);
      }

      const updateGlobalProgress = ({
        message,
        stage,
        backendCompleted,
        backendTotal,
      }: {
        message?: string;
        stage?: string;
        backendCompleted?: number;
        backendTotal?: number;
      } = {}) => {
        const processed = completedPlacementIds.size + failedPlacementIds.size;
        const completedCount = completedPlacementIds.size;
        const failedCount = failedPlacementIds.size;
        const slotPercent = Math.round((processed / totalPlacements) * 100);
        const backendPercent =
          typeof backendCompleted === "number" &&
          typeof backendTotal === "number" &&
          backendTotal > 0
            ? Math.round((backendCompleted / backendTotal) * 100)
            : 0;

        setGridProgress({
          percent: Math.min(
            99,
            Math.max(10, slotPercent, backendPercent, resolveProgressStageFloor(stage))
          ),
          message,
          completed: completedCount,
          total: totalPlacements,
          failed: failedCount,
          stage,
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

        const unresolvedSeedIds = new Set(platformSeeds.map((seed) => seed.placementId));
        const generatedToSeedPlacementId = new Map<string, string>();
        const seedByScheduleKey = new Map<string, CalendarPlacementSeed>();

        platformSeeds.forEach((seed) => {
          const key = buildSeedScheduleKey({
            dayId: seed.schedule.dayId,
            scheduledAt: seed.schedule.scheduledAt,
            platform: seed.platform.name,
          });
          if (!seedByScheduleKey.has(key)) {
            seedByScheduleKey.set(key, seed);
          }
        });

        const resolveSeedPlacementId = (placement: {
          placementId: string;
          schedule: { dayId: string; scheduledAt?: string };
          platform: { name: string };
        }): string | null => {
          const mapped = generatedToSeedPlacementId.get(placement.placementId);
          if (mapped) return mapped;
          if (unresolvedSeedIds.has(placement.placementId)) return placement.placementId;

          const scheduleKey = buildSeedScheduleKey({
            dayId: placement.schedule.dayId,
            scheduledAt: placement.schedule.scheduledAt,
            platform: placement.platform.name,
          });
          const scheduleMatch = seedByScheduleKey.get(scheduleKey);
          if (scheduleMatch && unresolvedSeedIds.has(scheduleMatch.placementId)) {
            generatedToSeedPlacementId.set(placement.placementId, scheduleMatch.placementId);
            return scheduleMatch.placementId;
          }

          const fallback = platformSeeds.find((seed) => unresolvedSeedIds.has(seed.placementId));
          if (!fallback) return null;
          generatedToSeedPlacementId.set(placement.placementId, fallback.placementId);
          return fallback.placementId;
        };

        await streamCalendarGeneration(payload, (event) => {
          addEvent({
            id: crypto.randomUUID(),
            type: event.type,
            timestamp: new Date().toISOString(),
            data: event,
          });

          if (event.type === "progress") {
            updateGlobalProgress({
              message: formatGridProgressMessage({
                platform,
                stage: event.stage,
                message: event.message ?? "Generating content...",
              }),
              stage: event.stage,
              backendCompleted: event.completed,
              backendTotal: event.total,
            });
            return;
          }

          if (event.type === "slot_started") {
            const seedPlacementId =
              generatedToSeedPlacementId.get(event.placementId) ??
              (unresolvedSeedIds.has(event.placementId)
                ? event.placementId
                : platformSeeds.find((seed) => unresolvedSeedIds.has(seed.placementId))?.placementId);
            if (seedPlacementId && seedPlacementId !== event.placementId) {
              generatedToSeedPlacementId.set(event.placementId, seedPlacementId);
            }
            updateDraftById(seedPlacementId ?? event.placementId, (draft) => ({
              ...draft,
              status: "streaming",
              progress: 5,
              generationStage: "queued",
              generationError: undefined,
            }));
            return;
          }

          if (event.type === "slot_heartbeat") {
            const seedPlacementId =
              generatedToSeedPlacementId.get(event.placementId) ??
              (unresolvedSeedIds.has(event.placementId)
                ? event.placementId
                : platformSeeds.find((seed) => unresolvedSeedIds.has(seed.placementId))?.placementId);
            if (seedPlacementId) {
              updateDraftById(seedPlacementId, (draft) => ({
                ...draft,
                progress: Math.round(event.progress * 100),
                ...(event.stage ? { generationStage: event.stage } : {}),
              }));
            }
            return;
          }

          if (event.type === "slot_stage") {
            const seedPlacementId =
              generatedToSeedPlacementId.get(event.placementId) ??
              (unresolvedSeedIds.has(event.placementId)
                ? event.placementId
                : platformSeeds.find((seed) => unresolvedSeedIds.has(seed.placementId))?.placementId);
            if (seedPlacementId) {
              updateDraftById(seedPlacementId, (draft) => ({
                ...draft,
                generationStage: event.stage,
                progress: Math.max(draft.progress ?? 0, resolveSlotStageFloor(event.stage)),
              }));
            }
            return;
          }

          if (event.type === "slot_failed") {
            const seedPlacementId =
              generatedToSeedPlacementId.get(event.placementId) ??
              (unresolvedSeedIds.has(event.placementId)
                ? event.placementId
                : platformSeeds.find((seed) => unresolvedSeedIds.has(seed.placementId))?.placementId) ??
              event.placementId;
            unresolvedSeedIds.delete(seedPlacementId);
            if (!completedPlacementIds.has(seedPlacementId) && !failedPlacementIds.has(seedPlacementId)) {
              failedPlacementIds.add(seedPlacementId);
            }
            updateDraftById(seedPlacementId, (draft) => ({
              ...draft,
              status: "failed",
              progress: undefined,
              generationStage: undefined,
              generationError: event.message,
              generationAttempts: event.attempts ?? draft.generationAttempts,
            }));
            updateGlobalProgress({
              message: formatGridProgressMessage({
                platform,
                stage: "drafting",
                message: `Placement failed for ${seedPlacementId}.`,
              }),
              stage: "drafting",
            });
            return;
          }

          if (event.type === "slot_completed" || event.type === "placement") {
            const placement = event.placement;
            const seedPlacementId =
              resolveSeedPlacementId({
                placementId: placement.placementId,
                schedule: placement.schedule,
                platform: placement.platform,
              }) ?? placement.placementId;
            if (completedPlacementIds.has(seedPlacementId)) {
              return;
            }
            completedPlacementIds.add(seedPlacementId);
            unresolvedSeedIds.delete(seedPlacementId);
            const existing = drafts.find((draft) => draft.id === seedPlacementId) ?? null;
            const nextDraft = mapPlacementToDraft(placement, existing, seedPlacementId);

            const targetDay = resolveDayMeta(placement.schedule.dayId, placement.schedule.scheduledAt);
            if (targetDay) {
              // Remove any existing placeholder/draft instance first so placement updates
              // replace globally (including cross-day schedule adjustments).
              const idsToDelete =
                seedPlacementId === placement.placementId
                  ? [seedPlacementId]
                  : [seedPlacementId, placement.placementId];
              bulkDeleteDrafts(idsToDelete);
              addDraft(targetDay.id, nextDraft);
              setGhosts(targetDay.id, 0);
            }
            updateGlobalProgress({
              message: formatGridProgressMessage({
                platform,
                stage: "drafting",
                message: `Placement completed for ${seedPlacementId}.`,
              }),
              stage: "drafting",
            });
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
        completed: succeeded,
        total: totalPlacements,
        failed,
        stage: "finalizing",
      });
      setGridStatus(hasFailures ? "complete_with_errors" : "complete");
      setGridError(null);
      if (hasFailures) {
        showToast({
          title: "Generation finished with errors",
          description: `${succeeded} of ${totalPlacements} generated. ${failed} failed.`,
          variant: "error",
        });
      } else {
        showToast({
          title: "Generation complete",
          description: `All ${totalPlacements} posts generated`,
          variant: "success",
        });
      }
    } catch (error) {
      setGridStatus("error");
      setGridError(error instanceof Error ? error.message : "Generation failed. Please try again.");
    }
  }, [
    activePlatforms,
    addDraft,
    addEvent,
    brandProfileId,
    bulkDeleteDrafts,
    calendarDays,
    buildDraftMetadata,
    drafts,
    mapPlacementToDraft,
    platformAccountIds,
    resolveDayMeta,
    setGhosts,
    setDays,
    setGridError,
    setGridProgress,
    setGridStatus,
    showToast,
    updateDraftById,
    weekStartId,
  ]);

  const handleGenerateGridJob = React.useCallback(
    async ({ language, userPrompt, generationPrompt }: GridControlValues) => {
      closeGridStream();
      setGridError(null);
      setGridStatus("running");
      setGridProgress({
        percent: 5,
        message: "Queuing weekly grid generation...",
        completed: 0,
        total: 0,
        failed: 0,
        stage: "analyzing",
      });

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
        setGridProgress({
          percent: 10,
          message: "Generation job queued. Waiting for stream...",
          completed: 0,
          total: 0,
          failed: 0,
          stage: "analyzing",
        });

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
            completed: typeof completed === "number" ? completed : undefined,
            total: typeof total === "number" ? total : undefined,
            failed: 0,
            stage: "drafting",
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
                metadata: buildDraftMetadata(draft),
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
              const next = mapPlacementToDraft(event.placement, draft, draftId);
              const targetDay = resolveDayMeta(
                event.placement.schedule.dayId,
                event.placement.schedule.scheduledAt
              );
              if (targetDay) {
                const idsToDelete =
                  event.placement.placementId === draftId
                    ? [draftId]
                    : [draftId, event.placement.placementId];
                bulkDeleteDrafts(idsToDelete);
                addDraft(targetDay.id, next);
              }
              showToast({
                title: "Draft ready",
                description: next.title || next.summary || "New post",
                variant: "success",
              });
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
      buildDraftMetadata,
      bulkDeleteDrafts,
      calendarDays,
      drafts,
      mapPlacementToDraft,
      platformAccountIds,
      resolveDayMeta,
      setGridError,
      showToast,
      updateDraftById,
      weekStartId,
    ]
  );

  const handleClearFailure = React.useCallback(
    (draftId: string) => {
      updateDraftById(draftId, (draft) => ({
        ...draft,
        status: "placeholder",
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
