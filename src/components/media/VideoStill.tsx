'use client';

import type { ReactNode, VideoHTMLAttributes } from 'react';
import { useNearViewport } from '@/hooks/useNearViewport';
import { cn } from '@/lib/utils';

type Props = Omit<
  VideoHTMLAttributes<HTMLVideoElement>,
  'src' | 'poster' | 'preload' | 'autoPlay' | 'onError'
> & {
  src: string | null | undefined;
  poster?: string | null;
  /** The video plays: the pointer is on it, a panel opened it, or the person pressed play. */
  playing?: boolean;
  /** In the first screenful: load at once rather than when it nears the screen. */
  eager?: boolean;
  alt?: string;
  /** Drawn when there is neither a poster nor a file; a neutral tile by default. */
  placeholder?: ReactNode;
  onError?: () => void;
};

/**
 * A video, loaded the way every video in the app loads:
 * - with a poster, it rests as that poster, a lazy still, and no `<video>` exists;
 * - without one, the file's metadata paints its first frame once the box nears the screen
 *   (most production videos have none; opening one in the Library backfills it);
 * - the film streams only while `playing`.
 * A thumbnail never falls back to the original file; that rule lives in `stillSignable`.
 */
export function VideoStill({
  src,
  poster,
  playing = false,
  eager = false,
  alt = '',
  placeholder,
  className,
  onError,
  ...video
}: Props) {
  const [observe, near] = useNearViewport(eager);
  if (!playing) {
    if (poster) {
      return (
        // biome-ignore lint/performance/noImgElement: a signed storage still, not a Next-optimisable asset
        <img
          src={poster}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className={className}
          onError={onError}
        />
      );
    }
    if (!src) {
      return (
        placeholder ?? (
          <div
            role={alt ? 'img' : undefined}
            aria-label={alt || undefined}
            className={cn('bg-muted', className)}
          />
        )
      );
    }
  }
  return (
    // biome-ignore lint/a11y/useMediaCaption: previews and review players of the brand's own media carry no caption track
    <video
      ref={observe}
      src={(playing || near) && src ? src : undefined}
      poster={poster ?? undefined}
      preload={playing ? 'auto' : 'metadata'}
      autoPlay={playing}
      muted
      playsInline
      aria-label={alt || undefined}
      className={className}
      onError={onError}
      {...video}
    />
  );
}
