'use client';

import { VideoIcon } from '@radix-ui/react-icons';
import { Pause, Play } from 'lucide-react';
import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  showVideo: boolean;
  activeImageUrl?: string;
  isEmpty: boolean;
  isPlaying: boolean;
  onTogglePlay: () => void;
  playheadSec: number;
  totalSec: number;
}) {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="relative flex-1 overflow-hidden rounded-lg border border-border/60 bg-black">
        <video
          ref={videoRef}
          playsInline
          muted={false}
          className={cn(
            'absolute inset-0 h-full w-full object-contain transition-opacity',
            showVideo ? 'opacity-100' : 'opacity-0',
          )}
        />
        {!showVideo && activeImageUrl ? (
          // biome-ignore lint/performance/noImgElement: in-memory still preview; next/image adds no value for canvas media
          <img
            src={activeImageUrl}
            alt="Timeline preview frame"
            className="absolute inset-0 h-full w-full object-contain"
          />
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
