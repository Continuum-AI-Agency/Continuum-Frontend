'use client';

import { ExternalLink, File, Play } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { type LightboxItem, MediaLightbox } from '@/components/organic/primitives/MediaLightbox';
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
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
  /**
   * Play a video on pointer-enter and pause on leave, instead of sitting on its poster.
   * Off by default: a page of autonomously-playing tiles is noise, and every existing
   * call site was written against the still.
   */
  hoverPlay?: boolean;
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
  hoverPlay = false,
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

  // #t=0.01 makes browsers paint the first frame when there is no poster, instead of
  // showing an empty black box.
  const videoSrc = media.thumbnailUrl ? media.url : `${media.url}#t=0.01`;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hovered, setHovered] = useState(false);
  const hoveredRef = useRef(false);
  // With a poster to paint, a hover-play tile downloads ZERO video bytes until the
  // pointer arrives: `preload="none"` plus a withheld src. Withholding the src is
  // strictly stronger than gating on an IntersectionObserver — an off-screen tile has
  // nothing to fetch either way, and a pointer that arrives before the observer fires
  // still starts playback immediately.
  const deferUntilHover = hoverPlay && Boolean(media.thumbnailUrl);
  const resolvedVideoSrc = deferUntilHover && !hovered ? undefined : videoSrc;

  return (
    <div className={cn('relative size-full overflow-hidden rounded-md bg-muted', className)}>
      {exhausted ? (
        <MediaFallbackTile seed={seed} />
      ) : media.kind === 'video' && !videoFailed ? (
        <>
          <video
            ref={videoRef}
            src={resolvedVideoSrc}
            poster={media.thumbnailUrl}
            aria-label={media.name ?? media.caption}
            preload={deferUntilHover ? 'none' : 'metadata'}
            muted
            playsInline
            loop={hoverPlay}
            onError={() => {
              setFailedVideoUrl(media.url);
              requestRecovery();
            }}
            onLoadedData={() => {
              if (hoveredRef.current) void videoRef.current?.play();
            }}
            onPointerEnter={
              hoverPlay
                ? () => {
                    hoveredRef.current = true;
                    setHovered(true);
                    if (resolvedVideoSrc) void videoRef.current?.play();
                  }
                : undefined
            }
            onPointerLeave={
              hoverPlay
                ? () => {
                    hoveredRef.current = false;
                    videoRef.current?.pause();
                  }
                : undefined
            }
            className="size-full object-cover"
          >
            <track kind="captions" />
          </video>
          <span
            className={cn(
              'pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity',
              hoverPlay && hovered && 'opacity-0',
            )}
          >
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
          <File width={18} height={18} aria-hidden="true" />
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

type ChatMediaCarouselProps = {
  items: readonly ChatMedia[];
  className?: string;
  /** Seed for the fallback letter tile on every slide. */
  fallbackSeed?: string;
  onRecoverItem?: (media: ChatMedia) => void;
  /** Natural dimensions of the FIRST slide, once it paints. */
  onLoadDimensions?: (dims: { width: number; height: number }) => void;
  /** Forwarded to every slide's thumb. */
  hoverPlay?: boolean;
  /** Called with the slide index when the media is activated (click or Enter). */
  onOpen?: (index: number) => void;
};

/**
 * One creative, paged in place — a carousel ad shown the way someone scrolling the feed
 * would see it, rather than flattened to its cover slide.
 *
 * A single-item list renders as a bare thumb with no chrome, so callers can hand this
 * whatever a creative turned out to be without branching on the count first.
 */
export function ChatMediaCarousel({
  items,
  className,
  fallbackSeed,
  onRecoverItem,
  onLoadDimensions,
  hoverPlay = false,
  onOpen,
}: ChatMediaCarouselProps) {
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) return;
    const syncCurrent = () => setCurrent(api.selectedScrollSnap());
    syncCurrent();
    api.on('select', syncCurrent);
    api.on('reInit', syncCurrent);
    return () => {
      api.off('select', syncCurrent);
      api.off('reInit', syncCurrent);
    };
  }, [api]);

  if (items.length === 0) return null;

  const slide = (media: ChatMedia, index: number) => {
    const thumb = (
      <ChatMediaThumb
        fallbackSeed={fallbackSeed}
        hoverPlay={hoverPlay}
        media={media}
        onLoadDimensions={index === 0 ? onLoadDimensions : undefined}
        onRecover={onRecoverItem}
      />
    );
    if (!onOpen) return thumb;
    return (
      <button
        aria-label={`Open ${media.name ?? media.caption ?? 'creative'}`}
        className="relative block size-full cursor-zoom-in"
        onClick={(event) => {
          event.stopPropagation();
          onOpen(index);
        }}
        type="button"
      >
        {thumb}
      </button>
    );
  };

  if (items.length === 1) {
    const only = items[0];
    return only ? (
      <div className={cn('relative size-full', className)}>{slide(only, 0)}</div>
    ) : null;
  }

  // The arrows sit inside the tile and surface on hover — a creative grid should read as
  // creatives, not as a row of controls.
  const arrowClass =
    'size-7 border-0 bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity ' +
    'group-hover/carousel:opacity-100 hover:bg-black/75 hover:text-white disabled:opacity-0';

  return (
    <div className={cn('group/carousel relative size-full', className)}>
      <Carousel className="size-full" opts={{ loop: false }} setApi={setApi}>
        <CarouselContent className="ml-0 size-full">
          {items.map((media, index) => (
            <CarouselItem className="pl-0" key={media.id}>
              {slide(media, index)}
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className={cn('left-2', arrowClass)} />
        <CarouselNext className={cn('right-2', arrowClass)} />
      </Carousel>
      <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 font-medium text-2xs text-white backdrop-blur-sm">
        {current + 1}/{items.length}
      </span>
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
