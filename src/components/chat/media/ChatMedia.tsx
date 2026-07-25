'use client';

import { FileIcon } from '@radix-ui/react-icons';
import { ExternalLink, Play } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { type LightboxItem, MediaLightbox } from '@/components/organic/primitives/MediaLightbox';
import { cn } from '@/lib/utils';
import type { ChatMedia } from './media';

/**
 * Branded tile shown when media has no usable URL or its URL failed to load —
 * the same letter-glyph idiom the dashboard leaderboards used, so a dead
 * creative degrades to something intentional instead of a broken-image glyph.
 */
export function MediaFallbackTile({ seed, className }: { seed?: string; className?: string }) {
  const letter = seed?.trim().charAt(0) ?? '';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-full items-center justify-center border border-border/60 bg-muted/60 font-mono text-xs uppercase text-muted-foreground',
        className,
      )}
    >
      {letter || '·'}
    </span>
  );
}

type ChatMediaThumbProps = {
  media: ChatMedia;
  className?: string;
  /** Seed for the fallback letter tile. Defaults to media.name ?? media.caption. */
  fallbackSeed?: string;
  /**
   * Fired at most once per failed URL. Surfaces with a fresh-URL strategy
   * re-resolve and pass updated media; the URL change resets the failure and
   * the thumb retries automatically.
   */
  onRecover?: (media: ChatMedia) => void;
  /** Natural dimensions once an image paints (aspect-ratio badges need this). */
  onLoadDimensions?: (dims: { width: number; height: number }) => void;
};

// The single media renderer for every surface that shows a creative. It branches on `kind`, which
// is the whole point: every previous renderer was an <img>, so a video creative or a reel rendered
// its MP4 into an image tag. Video gets a real <video> with a poster; a failed URL degrades to the
// poster and then to the branded fallback tile, never a broken-image glyph.
export function ChatMediaThumb({
  media,
  className,
  fallbackSeed,
  onRecover,
  onLoadDimensions,
}: ChatMediaThumbProps) {
  // Failures are keyed to the URL that failed, so recovered media (a new signed
  // URL arriving via props) invalidates the failure without an explicit reset.
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [failedVideoUrl, setFailedVideoUrl] = useState<string | null>(null);
  const recoveredUrls = useRef<Set<string>>(new Set());

  const requestRecovery = () => {
    if (!onRecover || recoveredUrls.current.has(media.url)) return;
    recoveredUrls.current.add(media.url);
    onRecover(media);
  };

  const videoFailed = media.kind === 'video' && failedVideoUrl === media.url;
  // A failed video degrades to its poster rendered as an image, when it has one.
  const imageSrc = media.kind === 'video' ? (media.thumbnailUrl ?? null) : media.url;
  const showImage = media.kind === 'image' || (videoFailed && imageSrc);
  const imageFailed = imageSrc !== null && failedImageUrl === imageSrc;
  const exhausted =
    (media.kind === 'video' && videoFailed && (!imageSrc || imageFailed)) ||
    (media.kind === 'image' && imageFailed);

  const seed = fallbackSeed ?? media.name ?? media.caption;

  return (
    <div className={cn('relative size-full overflow-hidden rounded-md bg-muted', className)}>
      {exhausted ? (
        <MediaFallbackTile seed={seed} />
      ) : media.kind === 'video' && !videoFailed ? (
        <>
          {/* #t=0.01 makes browsers paint the first frame when there is no poster, instead of
              showing an empty black box. */}
          <video
            src={media.thumbnailUrl ? media.url : `${media.url}#t=0.01`}
            poster={media.thumbnailUrl}
            aria-label={media.name ?? media.caption}
            preload="metadata"
            muted
            playsInline
            onError={() => {
              setFailedVideoUrl(media.url);
              requestRecovery();
            }}
            className="size-full object-cover"
          >
            <track kind="captions" />
          </video>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Play className="size-5 fill-white/90 text-white/90 drop-shadow" aria-hidden="true" />
          </span>
        </>
      ) : showImage && imageSrc ? (
        <Image
          src={imageSrc}
          alt={media.name ?? media.caption ?? ''}
          fill
          unoptimized
          sizes="(max-width: 768px) 40vw, 240px"
          onError={() => {
            setFailedImageUrl(imageSrc);
            requestRecovery();
          }}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth > 0 && naturalHeight > 0) {
              onLoadDimensions?.({ width: naturalWidth, height: naturalHeight });
            }
          }}
          className="object-cover"
        />
      ) : (
        <span className="flex size-full items-center justify-center text-muted-foreground">
          <FileIcon width={18} height={18} aria-hidden="true" />
        </span>
      )}

      {media.badge ? (
        <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {media.badge}
        </span>
      ) : null}
    </div>
  );
}

type ChatMediaGridProps = {
  items: readonly ChatMedia[];
  /** Title of the lightbox that opens on click. Omit to render the media inert. */
  lightboxTitle?: string;
  className?: string;
  tileClassName?: string;
  /** Per-item fallback seed for the letter tile. */
  fallbackSeedFor?: (media: ChatMedia) => string;
  /** Per-item recovery, forwarded to each thumb (once per failed URL). */
  onRecoverItem?: (media: ChatMedia) => void;
};

/**
 * A grid of media that opens the shared MediaLightbox on click — the lightbox is the one component
 * in the repo that already renders video properly, and no chat surface was using it.
 */
export function ChatMediaGrid({
  items,
  lightboxTitle,
  className,
  tileClassName,
  fallbackSeedFor,
  onRecoverItem,
}: ChatMediaGridProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (items.length === 0) return null;

  const lightboxItems: LightboxItem[] = items.map((media) => ({
    url: media.url,
    caption: media.caption ?? media.name ?? '',
    isVideo: media.kind === 'video',
  }));

  return (
    <>
      <div className={cn('flex flex-wrap gap-2', className)}>
        {items.map((media, index) => (
          <figure key={media.id} className="group relative">
            <button
              type="button"
              disabled={!lightboxTitle}
              onClick={() => setOpenIndex(index)}
              aria-label={media.name ?? media.caption ?? 'Open media'}
              className={cn(
                'relative block size-24 overflow-hidden rounded-md border transition-opacity',
                lightboxTitle ? 'hover:opacity-90' : 'cursor-default',
                tileClassName,
              )}
            >
              <ChatMediaThumb
                media={media}
                fallbackSeed={fallbackSeedFor?.(media)}
                onRecover={onRecoverItem}
              />
            </button>

            {media.permalink ? (
              <a
                href={media.permalink}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open the live post"
                className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            ) : null}
          </figure>
        ))}
      </div>

      {lightboxTitle ? (
        <MediaLightbox
          open={openIndex !== null}
          onOpenChange={(open) => setOpenIndex(open ? (openIndex ?? 0) : null)}
          title={lightboxTitle}
          items={lightboxItems}
          index={openIndex ?? 0}
          onIndexChange={setOpenIndex}
        />
      ) : null}
    </>
  );
}
