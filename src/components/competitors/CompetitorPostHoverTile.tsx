'use client';

import type { InstagramMediaItem, InstagramPost } from '@continuum/contracts';
import { ExternalLink, Heart, Images, MessageCircle, Play } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';
import { type CompetitorPostView, carouselSlides } from './competitorPostView';

const numberFormatter = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function formatCount(value: number | null | undefined): string | null {
  return typeof value === 'number' ? numberFormatter.format(value) : null;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    date,
  );
}

/** First playable video URL on a reel (or null when the post has no video item). */
function reelVideoUrl(post: InstagramPost): string | null {
  if (post.kind !== 'reel') return null;
  const video = post.items.find((item) => item.kind === 'video');
  return video?.url ?? null;
}

function KindGlyph({ kind }: { kind: CompetitorPostView['post']['kind'] }) {
  if (kind === 'reel') return <Play className="h-2.5 w-2.5 fill-current" aria-hidden />;
  if (kind === 'carousel') return <Images className="h-2.5 w-2.5" aria-hidden />;
  return null;
}

function PostThumb({
  coverUrl,
  alt,
  className,
}: {
  coverUrl: string | null;
  alt: string;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  if (!coverUrl || errored) {
    return (
      <div
        className={cn(
          'flex aspect-square items-center justify-center bg-muted text-2xs text-muted-foreground',
          className,
        )}
      >
        No preview
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote Instagram CDN preview, not static at build time
    <img
      src={coverUrl}
      alt={alt}
      loading="lazy"
      onError={() => setErrored(true)}
      className={cn('w-full object-cover', className)}
    />
  );
}

// Muted looping reel player. Parent sets `playing` (tile hover) or `autoPlay`
// (hover-card open) to start/stop. Falls back to the cover still on load error.
function ReelVideo({
  src,
  poster,
  alt,
  className,
  playing = false,
  autoPlay = false,
  controls = false,
}: {
  src: string;
  poster: string | null;
  alt: string;
  className?: string;
  playing?: boolean;
  autoPlay?: boolean;
  controls?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [errored, setErrored] = useState(false);
  const shouldPlay = playing || autoPlay;

  useEffect(() => {
    if (errored) return;
    const video = videoRef.current;
    if (!video) return;
    if (shouldPlay) {
      void video.play().catch(() => {
        // Autoplay can be blocked by policy; poster still shows.
      });
      return;
    }
    video.pause();
    try {
      video.currentTime = 0;
    } catch {
      // Seeking before metadata is ready can throw; leave at pause position.
    }
  }, [shouldPlay, errored, src]);

  if (errored) {
    return <PostThumb coverUrl={poster} alt={alt} className={className} />;
  }

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster ?? undefined}
      muted
      loop
      playsInline
      controls={controls}
      preload={shouldPlay ? 'auto' : 'metadata'}
      aria-label={alt}
      onError={() => setErrored(true)}
      className={cn('w-full bg-black object-cover', className)}
    />
  );
}

function SlideMedia({
  item,
  poster,
  alt,
}: {
  item: InstagramMediaItem;
  poster: string | null;
  alt: string;
}) {
  if (item.kind === 'video') {
    return (
      <video
        src={item.url}
        poster={poster ?? undefined}
        muted
        playsInline
        controls
        className="aspect-square w-full bg-black object-cover"
      />
    );
  }
  return <PostThumb coverUrl={item.url} alt={alt} className="aspect-square" />;
}

// The enlarged, pageable preview for carousels: click the inward arrows to move
// between slides while the pointer stays inside the hover card.
function PostCarousel({
  slides,
  poster,
  alt,
}: {
  slides: InstagramMediaItem[];
  poster: string | null;
  alt: string;
}) {
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

  const arrowClass =
    'h-7 w-7 border-0 bg-black/55 text-white backdrop-blur-sm hover:bg-black/75 hover:text-white disabled:opacity-30';

  return (
    <div className="relative">
      <Carousel setApi={setApi} opts={{ loop: false }} className="w-full">
        <CarouselContent className="ml-0">
          {slides.map((item, index) => (
            <CarouselItem key={`${item.url}-${index}`} className="pl-0">
              <SlideMedia item={item} poster={poster} alt={`${alt} slide ${index + 1}`} />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className={cn('left-2', arrowClass)} />
        <CarouselNext className={cn('right-2', arrowClass)} />
      </Carousel>
      <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-2xs font-medium text-white backdrop-blur-sm">
        {current + 1}/{slides.length}
      </span>
    </div>
  );
}

// A compact square thumbnail that expands on hover into a blown-up preview with the
// post copy and engagement metrics. Carousels become a pageable slideshow inside the
// hover card. Mirrors the paid-media CreativeTile pattern.
export function CompetitorPostHoverTile({
  view,
  actions,
}: {
  view: CompetitorPostView;
  actions?: ReactNode;
}) {
  const { post } = view;
  const likeCount = formatCount(post.likeCount);
  const commentsCount = formatCount(post.commentsCount);
  const postDate = formatDate(post.timestamp);
  const altText = `${view.competitorName} ${post.kind}`;
  const slides = carouselSlides(post);
  const videoUrl = reelVideoUrl(post);
  const [tileHovering, setTileHovering] = useState(false);
  const mediaClassName =
    'aspect-square h-full transition-transform duration-200 motion-safe:group-hover/tile:scale-105';

  return (
    <HoverCard openDelay={180} closeDelay={100}>
      <HoverCardTrigger asChild>
        <a
          href={post.permalink}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${view.competitorName} ${post.kind} on Instagram`}
          className="group/tile relative block overflow-hidden rounded-md border border-transparent bg-muted transition hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerEnter={() => setTileHovering(true)}
          onPointerLeave={() => setTileHovering(false)}
        >
          {videoUrl ? (
            <ReelVideo
              src={videoUrl}
              poster={post.coverUrl}
              alt={altText}
              playing={tileHovering}
              className={mediaClassName}
            />
          ) : (
            <PostThumb coverUrl={post.coverUrl} alt={altText} className={mediaClassName} />
          )}
          {(post.kind !== 'post' || post.mediaCount > 1) && (
            <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-2xs font-medium text-white backdrop-blur-sm">
              <KindGlyph kind={post.kind} />
              {post.mediaCount > 1 ? post.mediaCount : post.kind === 'reel' ? 'Reel' : null}
            </span>
          )}
        </a>
      </HoverCardTrigger>

      <HoverCardContent align="start" className="w-80 overflow-hidden p-0">
        {slides.length > 0 ? (
          <PostCarousel slides={slides} poster={post.coverUrl} alt={altText} />
        ) : videoUrl ? (
          <ReelVideo
            src={videoUrl}
            poster={post.coverUrl}
            alt={altText}
            autoPlay
            controls
            className="max-h-72 aspect-square"
          />
        ) : (
          <PostThumb coverUrl={post.coverUrl} alt={altText} className="max-h-72" />
        )}
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{view.competitorName}</p>
              <p className="truncate text-xs text-muted-foreground">@{view.instagramUsername}</p>
            </div>
            {postDate ? (
              <span className="shrink-0 text-2xs text-muted-foreground">{postDate}</span>
            ) : null}
          </div>

          {post.caption ? (
            <p className="line-clamp-4 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
              {post.caption}
            </p>
          ) : null}

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {likeCount ? (
              <span className="inline-flex items-center gap-1">
                <Heart className="h-3.5 w-3.5 text-red-500" /> {likeCount}
              </span>
            ) : null}
            {commentsCount ? (
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="h-3.5 w-3.5 text-blue-500" /> {commentsCount}
              </span>
            ) : null}
            <span className="ml-auto capitalize">{post.kind}</span>
          </div>

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <a
              href={post.permalink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open on Instagram
            </a>
            {actions}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
