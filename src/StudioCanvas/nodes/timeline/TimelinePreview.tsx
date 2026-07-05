'use client';

import { VideoIcon } from '@radix-ui/react-icons';
import { Pause, Play } from 'lucide-react';
import type React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ResolvedTextOverlay } from '../../utils/render/effectSpec';

function formatTime(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Presentational sequence preview. The <video> layer is driven imperatively by
// usePlayheadPlayback (it swaps source + seeks across clips); the <img> layer
// shows the active still. Both are letterboxed (object-contain) on a black frame
// to approximate the rendered output.
export function TimelinePreview({
  videoRef,
  showVideo,
  activeImageUrl,
  isEmpty,
  isPlaying,
  onTogglePlay,
  playheadSec,
  totalSec,
  mediaStyle,
  textOverlays,
  fadeOverlay,
  crossfade,
  caption,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  showVideo: boolean;
  activeImageUrl?: string;
  isEmpty: boolean;
  isPlaying: boolean;
  onTogglePlay: () => void;
  playheadSec: number;
  totalSec: number;
  // Effect CSS (filter/transform/opacity) for the active clip — the same spec
  // that the canvas export bakes in, so preview and output match.
  mediaStyle?: React.CSSProperties;
  textOverlays?: ResolvedTextOverlay[];
  // Fade/dip transition wash over the whole frame at the current playhead.
  fadeOverlay?: { color: string; alpha: number } | null;
  // Incoming clip's frame faded in over the current one during a cross-dissolve.
  crossfade?: { url: string; kind: 'video' | 'image'; opacity: number };
  // Active auto-caption line at the playhead (lower-third). Karaoke burn-in is exact
  // in the export; the preview shows the plain line.
  caption?: string;
}) {
  return (
    <div className="flex h-full flex-col gap-2">
      {/* containerType lets text overlays size via cqh (fraction of frame height). */}
      <div
        className="relative flex-1 overflow-hidden rounded-lg border border-border/60 bg-black"
        style={{ containerType: 'size' }}
      >
        <video
          ref={videoRef}
          playsInline
          muted={false}
          className="absolute inset-0 h-full w-full object-contain transition-opacity"
          style={{ ...mediaStyle, opacity: showVideo ? (mediaStyle?.opacity ?? 1) : 0 }}
        />
        {!showVideo && activeImageUrl ? (
          // biome-ignore lint/performance/noImgElement: in-memory still preview; next/image adds no value for canvas media
          <img
            src={activeImageUrl}
            alt="Timeline preview frame"
            className="absolute inset-0 h-full w-full object-contain"
            style={mediaStyle}
          />
        ) : null}

        {crossfade && crossfade.opacity > 0 ? (
          crossfade.kind === 'video' ? (
            <video
              key={crossfade.url}
              src={crossfade.url}
              muted
              playsInline
              preload="metadata"
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
              style={{ opacity: crossfade.opacity }}
            />
          ) : (
            // biome-ignore lint/performance/noImgElement: in-memory dissolve frame; next/image adds no value
            <img
              src={crossfade.url}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
              style={{ opacity: crossfade.opacity }}
            />
          )
        ) : null}

        {textOverlays?.map((overlay) => (
          <div
            key={overlay.id}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-pre-wrap text-center leading-tight"
            style={{
              left: `${overlay.xFrac * 100}%`,
              top: `${overlay.yFrac * 100}%`,
              fontSize: `${overlay.sizeFrac * 100}cqh`,
              color: overlay.color,
              fontWeight: overlay.fontWeight,
              background: overlay.background,
              padding: overlay.background ? '0.15em 0.4em' : undefined,
              borderRadius: overlay.background ? '0.15em' : undefined,
              textShadow: overlay.background ? undefined : '0 0 0.18em rgba(0,0,0,0.75)',
              maxWidth: '90%',
            }}
          >
            {overlay.text}
          </div>
        ))}

        {fadeOverlay && fadeOverlay.alpha > 0 ? (
          <div
            className="pointer-events-none absolute inset-0"
            style={{ backgroundColor: fadeOverlay.color, opacity: Math.min(1, fadeOverlay.alpha) }}
          />
        ) : null}

        {caption ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-[12%] flex justify-center px-4"
            aria-hidden="true"
          >
            <span
              className="max-w-[90%] text-center font-bold uppercase leading-tight text-white"
              style={{
                fontSize: '5.5cqh',
                textShadow: '0 0 0.18em rgba(0,0,0,0.9), 0 0 0.06em rgba(0,0,0,1)',
              }}
            >
              {caption}
            </span>
          </div>
        ) : null}

        {isEmpty ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <VideoIcon className="h-7 w-7 opacity-30" />
            <span className="text-xs">Drag clips from the media bin onto the timeline</span>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8"
          onClick={onTogglePlay}
          disabled={isEmpty}
          aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <span className="tabular-nums text-xs text-muted-foreground">
          {formatTime(playheadSec)} / {formatTime(totalSec)}
        </span>
      </div>
    </div>
  );
}
