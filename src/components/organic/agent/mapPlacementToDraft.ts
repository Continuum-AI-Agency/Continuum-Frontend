import type { CalendarPlacement } from "@/lib/organic/calendar-generation"
import type { OrganicCalendarDraft } from "@/components/organic/primitives/types"
import type { OrganicPlatformKey } from "@/lib/organic/platforms"

export function mapPlacementToDraft(
  placement: CalendarPlacement,
  draftId: string
): OrganicCalendarDraft {
  const mediaSuggestion = placement.creative?.mediaSuggestion ?? undefined
  const publishingAssets = (placement.publishingAssets ?? []).map((asset) => ({
    role: asset.role,
    kind: asset.kind,
    slideIndex: asset.slideIndex ?? undefined,
    assetId: asset.assetId ?? undefined,
    bucket: asset.bucket ?? undefined,
    storagePath: asset.storagePath,
    storageUrl: asset.storageUrl,
    mimeType: asset.mimeType ?? undefined,
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
  }))

  // Derive mediaCount from real media so the calendar "has media" affordance is
  // accurate (the previous `assetIds` field is never populated by the backend).
  const mediaCount =
    publishingAssets.length ||
    mediaSuggestion?.assets?.length ||
    (mediaSuggestion?.assetUrl || mediaSuggestion?.assetBase64 ? 1 : 0)

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
    mediaCount,
    mediaSuggestion: mediaSuggestion as OrganicCalendarDraft["mediaSuggestion"],
    publishingAssets: publishingAssets.length > 0 ? publishingAssets : undefined,
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
