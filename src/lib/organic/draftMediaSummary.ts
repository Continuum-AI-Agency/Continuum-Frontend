// Glanceable media-enrichment summary for the post-preview stepper. Mirrors the
// URL fields the card/preview actually render (publishingAssets first, then the
// transient mediaSuggestion shapes) so "what media exists" agrees with what the
// editor can show. Pure so it can drive both the inventory label and the reuse
// popover without re-deriving in the component.

import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';

export type ReusableMediaSource = 'realized' | 'reel' | 'blueprint';

export type ReusableMediaItem = {
  id: string;
  kind: 'image' | 'video';
  url: string;
  source: ReusableMediaSource;
  /**
   * Durable storage path, when the source carries one. Signed URLs for the same
   * file differ per leg, so this — not `url` — is the identity used to dedupe.
   */
  storagePath?: string | null;
};

export type DraftMediaSummary = {
  imageCount: number;
  videoCount: number;
  carouselSlides: number;
  blueprintFrames: number;
  reusable: ReusableMediaItem[];
  label: string;
};

function isUsableUrl(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function firstUsableUrl(...values: unknown[]): string | null {
  for (const value of values) {
    if (isUsableUrl(value)) return value.trim();
  }
  return null;
}

// Realized images/videos the post would actually publish, ordered by slideIndex.
function collectRealized(draft: OrganicCalendarDraft): ReusableMediaItem[] {
  const items: ReusableMediaItem[] = [];

  const published = [...(draft.publishingAssets ?? [])].sort(
    (a, b) => (a.slideIndex ?? 999) - (b.slideIndex ?? 999),
  );
  published.forEach((asset, index) => {
    if (!isUsableUrl(asset.storageUrl)) return;
    items.push({
      id: asset.assetId ?? `${asset.storagePath}-${index}`,
      kind: asset.kind === 'video' ? 'video' : 'image',
      url: asset.storageUrl,
      source: 'realized',
      storagePath: asset.storagePath,
    });
  });
  if (items.length > 0) return items;

  // No durable publishingAssets yet — fall back to the generated mediaSuggestion
  // single image / multi-asset array so a draft mid-realization still reads its
  // existing media honestly.
  const suggestion = draft.mediaSuggestion;
  if (!suggestion) return items;

  const primary = firstUsableUrl(suggestion.assetUrl, suggestion.url, suggestion.signedUrl);
  if (primary) {
    items.push({ id: `suggestion-primary`, kind: 'image', url: primary, source: 'realized' });
  }

  (suggestion.assets ?? []).forEach((asset, index) => {
    const url = firstUsableUrl(asset.assetUrl, asset.url, asset.signedUrl);
    if (!url) return;
    items.push({ id: `suggestion-asset-${index}`, kind: 'image', url, source: 'realized' });
  });

  return items;
}

function collectReel(draft: OrganicCalendarDraft): ReusableMediaItem | null {
  const suggestion = draft.mediaSuggestion;
  if (!suggestion) return null;

  // Renderable first: `reel.url` is the durable storage PATH, not a URL a thumbnail
  // can load, so it is the dedupe identity rather than the render source.
  const reelUrl = firstUsableUrl(suggestion.reel?.signedUrl, suggestion.reel?.url);
  if (reelUrl) {
    return {
      id: 'reel',
      kind: 'video',
      url: reelUrl,
      source: 'reel',
      storagePath: firstUsableUrl(suggestion.reel?.url),
    };
  }

  const hyperUrl = firstUsableUrl(
    suggestion.hyperframe?.mp4Url,
    suggestion.hyperframe?.coverImageUrl,
  );
  if (hyperUrl) {
    const isVideo = isUsableUrl(suggestion.hyperframe?.mp4Url);
    return { id: 'hyperframe', kind: isVideo ? 'video' : 'image', url: hyperUrl, source: 'reel' };
  }

  return null;
}

// Stage-2 blueprint storyboard frames — reusable as the basis for realizing.
function collectBlueprint(draft: OrganicCalendarDraft): ReusableMediaItem[] {
  return (draft.mediaSuggestion?.storyboard ?? []).flatMap((frame, index): ReusableMediaItem[] => {
    if (!isUsableUrl(frame.storageUrl)) return [];
    return [
      { id: `blueprint-${index}`, kind: 'image', url: frame.storageUrl, source: 'blueprint' },
    ];
  });
}

function buildLabel(summary: Omit<DraftMediaSummary, 'label'>): string {
  const parts: string[] = [];
  if (summary.imageCount > 0) {
    parts.push(`${summary.imageCount} image${summary.imageCount === 1 ? '' : 's'}`);
  }
  if (summary.videoCount > 0) {
    parts.push(`${summary.videoCount} ${summary.videoCount === 1 ? 'video' : 'videos'}`);
  }
  if (parts.length > 0) return parts.join(' · ');

  if (summary.blueprintFrames > 0) {
    return `Blueprint: ${summary.blueprintFrames} frame${summary.blueprintFrames === 1 ? '' : 's'}`;
  }
  return 'No media yet';
}

/**
 * One entry per underlying file. A user-attached video lands in BOTH the realized
 * publishingAssets and `mediaSuggestion.reel` — the same file — which is why the
 * inventory read "2 videos" for one attached video.
 */
function dedupeByFile(items: ReusableMediaItem[]): ReusableMediaItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.storagePath ?? item.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function summarizeDraftMedia(draft: OrganicCalendarDraft): DraftMediaSummary {
  const realized = collectRealized(draft);
  const reel = collectReel(draft);
  const blueprint = collectBlueprint(draft);

  // Realized media wins the inventory; the reel/hyperframe and blueprint frames
  // are appended as additional reusable options. Blueprint frames are dropped
  // from the reuse list once realized media exists (they're superseded).
  const candidates: ReusableMediaItem[] = [...realized];
  if (reel) candidates.push(reel);
  if (realized.length === 0) candidates.push(...blueprint);
  const reusable = dedupeByFile(candidates);

  const imageCount = reusable.filter(
    (item) => item.kind === 'image' && item.source !== 'blueprint',
  ).length;
  const videoCount = reusable.filter((item) => item.kind === 'video').length;

  const summary = {
    imageCount,
    videoCount,
    carouselSlides: realized.filter((item) => item.kind === 'image').length,
    blueprintFrames: blueprint.length,
    reusable,
  };

  return { ...summary, label: buildLabel(summary) };
}
