import type { CalendarPlacement } from "@/lib/organic/calendar-generation"
import type { OrganicCalendarDraft } from "@/components/organic/primitives/types"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"

export function mapPlacementToDraft(
  placement: CalendarPlacement,
  draftId: string
): OrganicCalendarDraft {
  return {
    id: draftId,
    backendDraftId: draftId,
    title: placement.content?.titleTopic ?? placement.seed?.source ?? "Agent post",
    summary: placement.content?.objective ?? "",
    captionPreview: placement.copy?.caption ?? "",
    platforms: [placement.platform.name as OrganicPlatformKey],
    format: placement.content?.format ?? "post",
    objective: placement.content?.objective ?? "",
    timeLabel: placement.schedule.timeOfDay ?? "",
    dateLabel: placement.schedule.dayId,
    status: "draft",
    mediaCount: placement.creative?.assetIds?.length ?? 0,
    seedTrendId: placement.seed?.trendId ?? undefined,
    targetAccountId: placement.platform.accountId ?? undefined,
    creativeIdea: placement.creative?.creativeIdea ?? undefined,
    titleTopic: placement.content?.titleTopic ?? undefined,
    tone: placement.content?.tone ?? undefined,
    cta: placement.content?.cta ?? undefined,
    target: placement.content?.target ?? undefined,
    tags: [],
  }
}
