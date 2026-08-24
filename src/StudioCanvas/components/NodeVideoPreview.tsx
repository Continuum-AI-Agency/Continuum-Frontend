'use client';

import {
  MediaControlBar,
  MediaController,
  MediaMuteButton,
  MediaPlayButton,
  MediaTimeDisplay,
  MediaTimeRange,
} from 'media-chrome/react';
import { cn } from '@/lib/utils';

/**
 * The generated-clip preview every video-producing node renders.
 *
 * One component because the four generator blocks kept four copies of
 * `<video controls>` that had already drifted (some sized themselves, some
 * carried a Radix AspectRatio, none preloaded metadata). media-chrome gives an
 * in-node scrub bar the native control strip never fit at node scale, and it is
 * an already-installed dependency.
 *
 * The BOX carries the aspect ratio (see useSnapToVideoAspect) and the video
 * fills it with `object-contain`: sizing the preview from its own ratio is the
 * bug that read as extreme zoom in Airtable #232.
 *
 * `nodrag` on the control bar only — scrubbing must not drag the node, while the
 * picture itself stays a drag surface so the node can still be moved by it.
 */
export function NodeVideoPreview({
  src,
  className,
  children,
  'data-testid': testId,
}: {
  src: string;
  className?: string;
  children?: React.ReactNode;
  'data-testid'?: string;
}) {
  return (
    <MediaController
      className={cn('relative flex h-full w-full bg-black/85', className)}
      data-testid={testId ?? 'studio-node-video-preview'}
    >
      {/* biome-ignore lint/a11y/useMediaCaption: generated clip; no authored caption track exists */}
      <video
        slot="media"
        src={src}
        preload="metadata"
        playsInline
        className="h-full w-full object-contain"
      />
      <MediaControlBar className="nodrag nowheel">
        <MediaPlayButton />
        <MediaTimeRange />
        <MediaTimeDisplay showDuration />
        <MediaMuteButton />
      </MediaControlBar>
      {children}
    </MediaController>
  );
}
