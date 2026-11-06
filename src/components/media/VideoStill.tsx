'use client';

import type { ReactNode, VideoHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Props = Omit<
  VideoHTMLAttributes<HTMLVideoElement>,
  'src' | 'poster' | 'preload' | 'autoPlay' | 'onError'
> & {
  src: string | null | undefined;
  poster?: string | null;
  /** The video plays: the pointer is on it, a panel opened it, or the person pressed play. */
  playing?: boolean;
  /** In the first screenful: load the poster at once rather than lazily. */
  eager?: boolean;
  alt?: string;
  /** Drawn at rest when there is no poster; a neutral tile by default. */
  placeholder?: ReactNode;
  onError?: () => void;
};

/**
 * A video, loaded the way every video in the app loads: not a byte of it until it plays.
 * At rest it is its poster, as a lazy still, or without one a neutral tile. The film streams
 * only while `playing`. A thumbnail never falls back to the original file; that rule lives in
 * `stillSignable`.
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
  return (
    // biome-ignore lint/a11y/useMediaCaption: previews and review players of the brand's own media carry no caption track
    <video
      src={src ?? undefined}
      poster={poster ?? undefined}
      preload="auto"
      autoPlay
      muted
      playsInline
      aria-label={alt || undefined}
      className={className}
      onError={onError}
      {...video}
    />
  );
}
