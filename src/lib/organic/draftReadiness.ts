// Light readiness validator for an organic calendar draft. The bare minimum for a
// post to be schedulable is a caption AND at least one media asset; the day and
// platform are implied by the calendar cell the draft was created in. Kept pure so
// it can drive both the editor checklist and the schedule/publish gates.

import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';

export type ReadinessCheckId = 'caption' | 'media';

export type ReadinessCheck = {
  id: ReadinessCheckId;
  label: string;
  met: boolean;
};

export type DraftReadiness = {
  ready: boolean;
  checks: ReadinessCheck[];
  reason: string | null;
};

function isUsableUrl(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// Covers every media slot `resolveDraftMedia` (DraftCardMedia) renders from — a
// publishing asset of EITHER kind, the generated/attached reel, the single-image
// trio and the hyperframe — so "has media" never disagrees with what the card and
// the preview actually show for a video-only draft. Two deliberate divergences from
// the renderer, both because schedule/publish re-stages from durable storage:
// transient base64 does not count, and neither do URLs left over from a generation
// that is still pending or in flight.
export function hasDraftMedia(draft: OrganicCalendarDraft): boolean {
  const publishingAssets = draft.publishingAssets ?? [];
  if (publishingAssets.some((asset) => isUsableUrl(asset.storageUrl))) {
    return true;
  }

  const suggestion = draft.mediaSuggestion;
  if (!suggestion) return false;

  // While a generation is in flight (or never started) any URLs still on the
  // suggestion are stale leftovers from a previous attempt. Only realized
  // publishingAssets (above) or a settled status may count as media.
  if (suggestion.mediaStatus === 'generating' || suggestion.mediaStatus === 'pending') {
    return false;
  }

  if (
    isUsableUrl(suggestion.assetUrl) ||
    isUsableUrl(suggestion.url) ||
    isUsableUrl(suggestion.signedUrl)
  ) {
    return true;
  }

  if (
    suggestion.assets?.some(
      (asset) =>
        isUsableUrl(asset.assetUrl) || isUsableUrl(asset.url) || isUsableUrl(asset.signedUrl),
    )
  ) {
    return true;
  }

  if (isUsableUrl(suggestion.reel?.url) || isUsableUrl(suggestion.reel?.signedUrl)) {
    return true;
  }

  if (
    isUsableUrl(suggestion.hyperframe?.coverImageUrl) ||
    isUsableUrl(suggestion.hyperframe?.mp4Url)
  ) {
    return true;
  }

  return false;
}

function hasCaption(draft: OrganicCalendarDraft): boolean {
  return draft.captionPreview.trim().length > 0;
}

function buildReason(missing: ReadinessCheck[]): string {
  if (missing.length === 1) {
    return missing[0].id === 'caption'
      ? 'Add a caption to schedule this post.'
      : 'Add at least one image or video to schedule this post.';
  }
  return 'Add a caption and at least one image or video to schedule this post.';
}

export function evaluateDraftReadiness(draft: OrganicCalendarDraft): DraftReadiness {
  const checks: ReadinessCheck[] = [
    { id: 'caption', label: 'Caption', met: hasCaption(draft) },
    { id: 'media', label: 'Media (image or video)', met: hasDraftMedia(draft) },
  ];

  const missing = checks.filter((check) => !check.met);
  const ready = missing.length === 0;

  return { ready, checks, reason: ready ? null : buildReason(missing) };
}
