'use client';

// Media primitives shared by the Inspiration tile face and its Analyse panel:
// a cover still that degrades to a placeholder, a muted reel player that falls
// back to the still, and a pageable carousel. IG CDN URLs expire, so every
// element tolerates a load error instead of showing a broken image.

import type { InstagramMediaItem, InstagramPost } from '@continuum/contracts';
import { useEffect, useRef, useState } from 'react';
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { cn } from '@/lib/utils';

/** First playable video URL on a reel (or null when the post has no video item). */
export function reelVideoUrl(post: InstagramPost): string | null {
  if (post.kind !== 'reel') return null;
  const video = post.items.find((item) => item.kind === 'video');
  return video?.url ?? null;
}

export function PostThumb({
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
          'flex items-center justify-center bg-muted text-2xs text-muted-foreground',
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

// Muted looping reel player. `playing` (tile hover) or `autoPlay` (panel open)
// start it; it rewinds when both drop. Falls back to the cover still on error.
export function ReelVideo({
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
        // Autoplay can be blocked by policy; the poster still shows.
      });
      return;
    }
    video.pause();
    try {
      video.currentTime = 0;
    } catch {
      // Seeking before metadata is ready can throw; leave it paused where it is.
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
        className="aspect-[4/5] w-full bg-black object-cover"
      />
    );
  }
  return <PostThumb coverUrl={item.url} alt={alt} className="aspect-[4/5]" />;
}

export function PostCarousel({
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
    'h-7 w-7 border-0 bg-black/55 text-white hover:bg-black/75 hover:text-white disabled:opacity-30';

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
      <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-2xs font-medium text-white">
        {current + 1}/{slides.length}
      </span>
    </div>
  );
}
