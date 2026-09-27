'use client';

// Frame.io-style version compare. Two versions side by side, or stacked in one
// box with CSS `mix-blend-mode: difference` — identical pixels cancel to black and
// only what changed between the cuts lights up. For two videos one transport
// drives both: side A is the master, B mirrors its play/pause/seek and is pulled
// back whenever it drifts more than a frame. Exactly one side is audible.
//
// Toggling difference mode only restyles the same two elements, so the videos are
// never remounted and keep their playhead.

import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatTimecode } from '../annotationGeometry';
import type { StageMedia } from '../stageMedia';

export type CompareSide = {
  /** Short name for the audio toggle, e.g. "v2". */
  label: string;
  /** e.g. "v2 · Current · 3 days ago" */
  caption: string;
  media: StageMedia;
};

type AudibleSide = 'a' | 'b' | 'off';

// ~one frame at 25 fps. Tighter than this and the follower seeks on every tick.
const MAX_DRIFT_SEC = 0.04;

function alignFollower(master: HTMLVideoElement | null, follower: HTMLVideoElement | null) {
  if (!master || !follower || follower.seeking) return;
  if (Math.abs(follower.currentTime - master.currentTime) > MAX_DRIFT_SEC) {
    follower.currentTime = master.currentTime;
  }
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  a: CompareSide;
  b: CompareSide;
};

function SideMedia({
  side,
  testId,
  videoRef,
  muted,
  synced,
  onTimeUpdate,
  onPlay,
  onPause,
  onSeeked,
  onLoadedMetadata,
}: {
  side: CompareSide;
  testId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  muted: boolean;
  synced: boolean;
  onTimeUpdate?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onSeeked?: () => void;
  onLoadedMetadata?: () => void;
}) {
  const { media } = side;
  if (media.src && media.kind === 'video') {
    return (
      // biome-ignore lint/a11y/useMediaCaption: comparing the user's own uploaded cuts; no caption track exists
      <video
        ref={videoRef}
        data-testid={testId}
        data-source-role={media.sourceRole}
        src={media.src}
        muted={muted}
        controls={!synced}
        playsInline
        preload="auto"
        className="size-full object-contain"
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
        onSeeked={onSeeked}
        onLoadedMetadata={onLoadedMetadata}
      />
    );
  }
  if (media.src && media.kind === 'image') {
    return <img src={media.src} alt={side.caption} className="size-full object-contain" />;
  }
  return (
    <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
      No visual preview for {media.label}
    </div>
  );
}

export function VersionCompareDialog({ open, onOpenChange, title, a, b }: Props) {
  const videoA = useRef<HTMLVideoElement>(null);
  const videoB = useRef<HTMLVideoElement>(null);
  const [difference, setDifference] = useState(false);
  const [audible, setAudible] = useState<AudibleSide>('a');
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const synced = a.media.kind === 'video' && b.media.kind === 'video';

  const align = () => alignFollower(videoA.current, videoB.current);

  // timeupdate fires only ~4x/second — too coarse to hold a frame. Each rendered
  // frame of the master is the moment to re-check the follower.
  useEffect(() => {
    const master = videoA.current;
    // Without requestVideoFrameCallback (older Firefox) timeupdate still aligns.
    if (!synced || !playing || !master || !('requestVideoFrameCallback' in master)) return;
    let handle = 0;
    const onFrame = () => {
      alignFollower(master, videoB.current);
      handle = master.requestVideoFrameCallback(onFrame);
    };
    handle = master.requestVideoFrameCallback(onFrame);
    return () => master.cancelVideoFrameCallback(handle);
  }, [synced, playing]);

  const togglePlay = () => {
    const master = videoA.current;
    if (!master) return;
    if (master.paused) void master.play().catch(() => setPlaying(false));
    else master.pause();
  };

  const seek = (seconds: number) => {
    if (videoA.current) videoA.current.currentTime = seconds;
    if (videoB.current) videoB.current.currentTime = seconds;
    setCurrentSec(seconds);
  };

  const masterEvents = synced
    ? {
        onPlay: () => {
          setPlaying(true);
          align();
          void videoB.current?.play().catch(() => undefined);
        },
        onPause: () => {
          setPlaying(false);
          videoB.current?.pause();
          align();
        },
        onSeeked: align,
        onTimeUpdate: () => {
          setCurrentSec(videoA.current?.currentTime ?? 0);
          align();
        },
        onLoadedMetadata: () => setDurationSec(videoA.current?.duration ?? 0),
      }
    : {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="compare-dialog" className="max-w-5xl sm:max-w-5xl">
        <DialogTitle className="text-sm">{title}</DialogTitle>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={difference ? 'default' : 'outline'}
            className="h-7 text-xs"
            aria-pressed={difference}
            data-testid="compare-diff-toggle"
            onClick={() => setDifference((value) => !value)}
          >
            Difference
          </Button>
          {synced ? (
            <fieldset className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <legend className="sr-only">Audible version</legend>
              <span aria-hidden="true">Audio:</span>
              {(
                [
                  ['a', a.label, 'compare-audio-a'],
                  ['b', b.label, 'compare-audio-b'],
                  ['off', 'Off', 'compare-audio-off'],
                ] as const
              ).map(([value, label, testId]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={audible === value ? 'default' : 'ghost'}
                  className="h-7 px-2 text-xs"
                  aria-pressed={audible === value}
                  data-testid={testId}
                  onClick={() => setAudible(value)}
                >
                  {label}
                </Button>
              ))}
            </fieldset>
          ) : null}
        </div>

        <div
          className={cn(
            difference ? 'relative isolate h-[60vh] bg-black' : 'grid h-[60vh] grid-cols-2 gap-3',
          )}
        >
          <figure className={cn('flex min-h-0 flex-col gap-1.5', difference && 'absolute inset-0')}>
            <figcaption className={cn('text-xs text-muted-foreground', difference && 'sr-only')}>
              A · {a.caption}
            </figcaption>
            <div className="min-h-0 flex-1 rounded bg-muted">
              <SideMedia
                side={a}
                testId="compare-video-a"
                videoRef={videoA}
                muted={audible !== 'a'}
                synced={synced}
                {...masterEvents}
              />
            </div>
          </figure>
          <figure
            data-testid={difference ? 'compare-diff-layer' : undefined}
            style={difference ? { mixBlendMode: 'difference' } : undefined}
            className={cn('flex min-h-0 flex-col gap-1.5', difference && 'absolute inset-0')}
          >
            <figcaption className={cn('text-xs text-muted-foreground', difference && 'sr-only')}>
              B · {b.caption}
            </figcaption>
            <div className="min-h-0 flex-1 rounded bg-muted">
              <SideMedia
                side={b}
                testId="compare-video-b"
                videoRef={videoB}
                muted={audible !== 'b'}
                synced={synced}
              />
            </div>
          </figure>
        </div>

        {synced ? (
          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-8"
              aria-label={playing ? 'Pause both versions' : 'Play both versions'}
              data-testid="compare-play"
              onClick={togglePlay}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <input
              type="range"
              aria-label="Seek both versions"
              min={0}
              max={durationSec || 0}
              step={0.01}
              value={Math.min(currentSec, durationSec || 0)}
              onChange={(event) => seek(Number(event.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatTimecode(currentSec * 1000)} / {formatTimecode(durationSec * 1000)}
            </span>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
