'use client';

import { resolveOrganicImageUrl } from '@continuum/contracts';
import { PlayIcon } from '@radix-ui/react-icons';
import Image from 'next/image';
import { useDraftWithFreshMedia } from '@/components/organic/hooks/useDraftWithFreshMedia';
import { cn } from '@/lib/utils';
import type { OrganicCalendarDraft } from './types';

const PLATFORM_GRADIENTS: Record<string, [string, string]> = {
  instagram: ['#E1306C', '#833AB4'],
  linkedin: ['#0A66C2', '#004182'],
  facebook: ['#1877F2', '#0550AE'],
  tiktok: ['#69C9D0', '#010101'],
  youtube: ['#FF0000', '#CC0000'],
  twitter: ['#1DA1F2', '#0C7ABF'],
};

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export type DraftMediaKind = 'image' | 'video';

export type ResolvedDraftMedia = {
  /** The renderable URL — a signed storage URL, or a base64 512px mockup for images. */
  url: string;
  kind: DraftMediaKind;
  /** Poster frame for a video, when one is known. Always `null` for an image. */
  poster: string | null;
};

/** The reel's poster, when the attach boundary carried the library's thumbnail through. */
function resolveReelPoster(draft: OrganicCalendarDraft): string | null {
  const thumbnail = draft.mediaSuggestion?.reel?.thumbnailUrl;
  return hasText(thumbnail) ? thumbnail.trim() : null;
}

/**
 * The ONE draft → renderable-media resolver, shared by the calendar card, the list
 * row and the post preview. It is video-aware on purpose: every earlier resolver
 * filtered to `kind === 'image'` and never read `mediaSuggestion.reel`, so an
 * attached video resolved to nothing and its surface rendered an empty placeholder.
 *
 * Precedence mirrors the publish path (`stageMediaForPublish`): durable
 * publishingAssets first, then the generated reel, then the shared image resolver,
 * and a HyperFrames cover last (its own player owns the composition itself).
 */
export function resolveDraftMedia(draft: OrganicCalendarDraft): ResolvedDraftMedia | null {
  const published = [...(draft.publishingAssets ?? [])]
    .filter((asset) => hasText(asset.storageUrl))
    .sort((a, b) => (a.slideIndex ?? 999) - (b.slideIndex ?? 999));
  const primary = published[0];
  if (primary) {
    return primary.kind === 'video'
      ? { url: primary.storageUrl.trim(), kind: 'video', poster: resolveReelPoster(draft) }
      : { url: primary.storageUrl.trim(), kind: 'image', poster: null };
  }

  const reel = draft.mediaSuggestion?.reel;
  if (reel?.generated && hasText(reel.signedUrl)) {
    return { url: reel.signedUrl.trim(), kind: 'video', poster: resolveReelPoster(draft) };
  }

  const imageUrl = resolveOrganicImageUrl(draft.mediaSuggestion);
  if (imageUrl) return { url: imageUrl, kind: 'image', poster: null };

  const cover = draft.mediaSuggestion?.hyperframe?.coverImageUrl;
  if (hasText(cover)) return { url: cover.trim(), kind: 'image', poster: null };

  return null;
}

/**
 * Image-only view of the resolver, for the surfaces still rendering into an `<img>`.
 * A video degrades to its poster rather than putting an MP4 in an image tag.
 */
export function resolveDraftMediaAssetUrl(draft: OrganicCalendarDraft): string | null {
  const media = resolveDraftMedia(draft);
  if (!media) return null;
  return media.kind === 'image' ? media.url : media.poster;
}

export function hasDraftMedia(draft: OrganicCalendarDraft): boolean {
  return resolveDraftMedia(draft) !== null;
}

export function resolveFormatAspectClass(format: string): string {
  const f = (format ?? '').toLowerCase();
  if (f === 'hyperframe') return 'aspect-video';
  if (f === 'reel' || f === 'video') return 'aspect-[4/5]';
  if (f === 'story') return 'aspect-[9/16]';
  return 'aspect-square';
}

export type DraftHyperframeCover = {
  coverImageUrl?: string | null;
  coverBase64?: string | null;
  coverPath?: string | null;
  bucket?: string | null;
};

export function isHyperframeDraft(draft: OrganicCalendarDraft): boolean {
  return (draft.format ?? '').toLowerCase() === 'hyperframe';
}

export function resolveDraftHyperframeCover(
  draft: OrganicCalendarDraft,
): DraftHyperframeCover | null {
  const hf = draft.mediaSuggestion?.hyperframe;
  if (!hf) return null;
  // A re-signable cover is one with a live signed URL or a durable storage path
  // (re-signed on load). Base64 covers are intentionally not considered — base64
  // must never render in the calendar UI.
  const hasCover = hasText(hf.coverImageUrl) || hasText(hf.coverPath);
  if (!hasCover) return null;
  return {
    coverImageUrl: hf.coverImageUrl ?? null,
    coverBase64: hf.coverBase64 ?? null,
    coverPath: hf.coverPath ?? null,
    bucket: hf.bucket ?? null,
  };
}

function resolveHyperframeCoverUrl(cover: DraftHyperframeCover): string | null {
  if (hasText(cover.coverImageUrl)) return cover.coverImageUrl.trim();
  return null;
}

export function DraftCardMedia({
  draft: persistedDraft,
  aspectClass = 'aspect-square',
  className,
  sizes = '280px',
}: {
  draft: OrganicCalendarDraft;
  aspectClass?: string;
  className?: string;
  sizes?: string;
}) {
  // Unconditional and first: a persisted draft carries an expired signed URL, which
  // resolves to nothing and renders the gradient placeholder until the page is
  // reloaded. The hyperframe early return below must not be able to skip the re-sign.
  const draft = useDraftWithFreshMedia(persistedDraft);
  const platform = draft.platforms[0] ?? 'instagram';
  const [gradientStart, gradientEnd] = PLATFORM_GRADIENTS[platform] ?? ['#5A48F9', '#7C6FFF'];
  const altText =
    typeof draft.mediaSuggestion?.alt === 'string' && draft.mediaSuggestion.alt.trim()
      ? draft.mediaSuggestion.alt.trim()
      : draft.title;

  const hyperframeCover = isHyperframeDraft(draft) ? resolveDraftHyperframeCover(draft) : null;
  const hyperframeCoverUrl = hyperframeCover ? resolveHyperframeCoverUrl(hyperframeCover) : null;

  if (hyperframeCoverUrl) {
    return (
      <div className={cn('relative overflow-hidden', aspectClass, className)}>
        <Image
          src={hyperframeCoverUrl}
          alt={altText}
          fill
          unoptimized
          className="object-cover"
          sizes={sizes}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
            <PlayIcon className="h-4 w-4 translate-x-[1px]" />
          </span>
        </div>
      </div>
    );
  }

  const media = resolveDraftMedia(draft);

  if (media?.kind === 'video') {
    return (
      <div className={cn('relative overflow-hidden', aspectClass, className)}>
        {/* Muted and paused: the poster (or the first frame) is the still preview. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={media.poster ? media.url : `${media.url}#t=0.01`}
          poster={media.poster ?? undefined}
          muted
          playsInline
          preload="metadata"
          aria-label={altText}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
            <PlayIcon className="h-4 w-4 translate-x-[1px]" />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden', aspectClass, className)}>
      {media ? (
        <Image
          src={media.url}
          alt={altText}
          fill
          unoptimized
          className="object-cover"
          sizes={sizes}
        />
      ) : (
        <div
          className="absolute inset-0 flex items-end p-3"
          style={{ background: `linear-gradient(135deg, ${gradientStart}, ${gradientEnd})` }}
        >
          <p className="line-clamp-3 text-xs font-bold leading-tight text-white/90 drop-shadow-sm">
            {draft.creativeIdea || draft.title}
          </p>
        </div>
      )}
    </div>
  );
}
