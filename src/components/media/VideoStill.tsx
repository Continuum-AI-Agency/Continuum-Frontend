'use client';

import type { VideoHTMLAttributes } from 'react';
import { useNearViewport } from '@/hooks/useNearViewport';

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
  onError?: () => void;
};

/**
 * A video at rest, loaded the way every resting video in the app loads:
 * - with a poster, the poster stands in as a lazy still and no byte of the video is fetched;
 * - without one, the file's metadata paints its first frame, once the box nears the screen;
 * - the video itself streams only while `playing`.
 * A thumbnail never falls back to the original file; that rule lives in `stillSignable`.
 */
export function VideoStill({
  src,
  poster,
  playing = false,
  eager = false,
  alt = '',
  className,
  onError,
  ...video
}: Props) {
  const { ref, near } = useNearViewport<HTMLVideoElement>(eager || playing);
  if (!playing && poster) {
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
    // biome-ignore lint/a11y/useMediaCaption: previews and review players of the brand's own media carry no caption track
    <video
      ref={ref}
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
