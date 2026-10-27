'use client';

// A render's files, smallest first. A card or grid draws the 480p, a player starts on the 720p
// and moves to the original; each step falls back to the next larger file until its rendition is
// made (the Backend makes them as the render lands). The original is the Library copy, behind a
// CDN, before the fleet's file: one far region, measured at 120–165 KB/s.

import type { ApiRenderOutput } from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Video } from '@/components/ui/video';

type OutputFiles = Pick<
  ApiRenderOutput,
  'url' | 'libraryUrl' | 'previewUrl' | 'thumbnailUrl' | 'posterUrl'
>;

/** The original. */
export const fullSrc = (output: OutputFiles) => output.libraryUrl ?? output.url;
/** The 720p a player starts on (a video's `preview_video`). */
export const previewSrc = (output: OutputFiles) => output.previewUrl ?? fullSrc(output);
/** The 480p a card or grid draws: a video's `proxy_480`, an image's `thumbnail`. */
export const thumbnailSrc = (output: OutputFiles) =>
  output.thumbnailUrl ?? output.previewUrl ?? fullSrc(output);

/**
 * Whether an image already failed to load when React attached to it. A transition (opening a job)
 * builds its elements before it commits them, so an expired link can fail in between and the error
 * event lands on nothing; this reads the failure off the element instead.
 */
export const imageFailed = (element: HTMLImageElement | null) =>
  element !== null && element.complete && element.naturalWidth === 0;

/**
 * A render's video: the 720p first, so it starts at once, then the original. The swap waits for
 * a pause (or the end) after a play — never mid-play, where the original's first bytes would
 * stall the viewer — and lands on the same moment, so a paused frame is inspected at full size.
 * The Kobra player owns the element, so a broken file is read off the video it mounts.
 */
export function OutputVideo({
  output,
  ariaLabel = 'Render',
  muted,
  onBroken,
}: {
  output: OutputFiles;
  ariaLabel?: string;
  muted?: boolean;
  onBroken?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const full = fullSrc(output);
  const [upgraded, setUpgraded] = useState(false);
  const src = upgraded ? full : previewSrc(output);
  const resumeAt = useRef<number | null>(null);

  useEffect(() => {
    const video = host.current?.querySelector('video');
    if (!video) return;
    // A 720p that will not load falls back to the original; only the original failing is broken.
    const fail = () => (src === full ? onBroken?.() : setUpgraded(true));
    if (video.error) fail();
    video.addEventListener('error', fail);
    return () => video.removeEventListener('error', fail);
  }, [src, full, onBroken]);

  useEffect(() => {
    const video = host.current?.querySelector('video');
    if (!video) return;
    if (src === full) {
      const at = resumeAt.current;
      if (at === null) return;
      const seek = () => {
        video.currentTime = at;
        resumeAt.current = null;
      };
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) seek();
      else video.addEventListener('loadedmetadata', seek, { once: true });
      return () => video.removeEventListener('loadedmetadata', seek);
    }
    // A pause also fires at the end; `played` is empty until someone pressed play.
    const upgrade = () => {
      if (video.played.length === 0) return;
      resumeAt.current = video.ended ? 0 : video.currentTime;
      setUpgraded(true);
    };
    video.addEventListener('pause', upgrade);
    return () => video.removeEventListener('pause', upgrade);
  }, [src, full]);

  return (
    <div ref={host} className="relative size-full">
      <Video
        src={src}
        // The frame shows at once; the video buffers behind it.
        poster={output.posterUrl}
        ariaLabel={ariaLabel}
        muted={muted}
        className="aspect-auto! size-full rounded-none border-0"
        videoClassName="object-contain"
      />
      {src !== full ? (
        <span
          className="pointer-events-none absolute top-2 left-2 rounded-sm bg-background/80 px-1.5 py-0.5 text-2xs text-muted-foreground"
          title="Playing the 720p preview. Pause to see the original."
        >
          720p
        </span>
      ) : null}
    </div>
  );
}

/** One render file at full size, its low-res first; or why it cannot be shown. */
export function OutputFile({
  output,
  alt,
  muted,
}: {
  output: OutputFiles & Pick<ApiRenderOutput, 'kind'>;
  alt: string;
  muted?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const markBroken = useCallback(() => setBroken(true), []);
  if (broken) {
    return (
      <p className="m-0 flex size-full items-center justify-center bg-muted p-[var(--card-pad)] text-center text-xs text-muted-foreground">
        {output.kind === 'video'
          ? 'This browser can’t play this file. Download it below.'
          : 'This file can’t be shown — its link may have expired. Refresh to get a new one.'}
      </p>
    );
  }
  if (output.kind === 'video') {
    return <OutputVideo output={output} ariaLabel={alt} muted={muted} onBroken={markBroken} />;
  }
  // The 480p paints behind the original while it loads, and is dropped once it has: a
  // transparent PNG must not show its own thumbnail through.
  const placeholder =
    output.thumbnailUrl && !loaded
      ? {
          backgroundImage: `url("${output.thumbnailUrl}")`,
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'contain',
        }
      : undefined;
  return (
    // biome-ignore lint/performance/noImgElement: a signed render URL, not a Next-optimisable asset
    <img
      src={fullSrc(output)}
      alt={alt}
      className="size-full object-contain"
      style={placeholder}
      ref={(element) => {
        if (imageFailed(element)) setBroken(true);
      }}
      onLoad={() => setLoaded(true)}
      onError={() => setBroken(true)}
    />
  );
}
