import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import type { CalendarPlacement } from '@/lib/organic/calendar-generation';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';

export function mapPlacementToDraft(
  placement: CalendarPlacement,
  draftId: string,
): OrganicCalendarDraft {
  const rawMediaSuggestion = placement.creative?.mediaSuggestion ?? undefined;
  // Carry the persisted 512px storyboard preview frames through. They arrive
  // re-signed from the backend on calendar load; the no-media card + editor
  // render storageUrl directly (never base64).
  const storyboard = (rawMediaSuggestion?.storyboard ?? undefined)?.map((frame) => ({
    role: frame.role ?? undefined,
    bucket: frame.bucket ?? undefined,
    storagePath: frame.storagePath ?? undefined,
    storageUrl: frame.storageUrl ?? undefined,
    format: frame.format ?? undefined,
  }));
  const mediaSuggestion = rawMediaSuggestion
    ? ({ ...rawMediaSuggestion, storyboard } as OrganicCalendarDraft['mediaSuggestion'])
    : undefined;
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
  }));

  // Derive mediaCount from real media so the calendar "has media" affordance is
  // accurate (the previous `assetIds` field is never populated by the backend).
  const mediaCount =
    publishingAssets.length ||
    mediaSuggestion?.assets?.length ||
    (mediaSuggestion?.assetUrl || mediaSuggestion?.assetBase64 ? 1 : 0);

  return {
    id: draftId,
    backendDraftId: draftId,
    title: placement.content?.titleTopic ?? placement.seed?.source ?? 'Agent post',
    summary: placement.content?.objective ?? '',
    captionPreview: placement.copy?.caption ?? '',
    // The hashtag tiers are part of the caption the backend publishes. Dropping them here is
    // how agent drafts published with a bare caption and no tags: the planner sends its own
    // caption on publish, so whatever it fails to carry never reaches the post.
    hashtags: placement.copy?.hashtags ?? undefined,
    platforms: [placement.platform.name as OrganicPlatformKey],
    format: placement.content?.format ?? 'post',
    objective: placement.content?.objective ?? '',
    timeLabel: placement.schedule.timeOfDay ?? '',
    dateLabel: placement.schedule.dayId,
    status: 'draft',
    mediaCount,
    mediaSuggestion,
    publishingAssets: publishingAssets.length > 0 ? publishingAssets : undefined,
    seedTrendId: placement.seed?.trendId ?? undefined,
    targetAccountId: placement.platform.accountId ?? undefined,
    creativeIdea: placement.creative?.creativeIdea ?? undefined,
    titleTopic: placement.content?.titleTopic ?? undefined,
    tone: placement.content?.tone ?? undefined,
    cta: placement.content?.cta ?? undefined,
    target: placement.content?.target ?? undefined,
    tags: [],
  };
}
