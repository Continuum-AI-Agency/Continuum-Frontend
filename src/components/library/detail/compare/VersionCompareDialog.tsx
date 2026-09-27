'use client';

// Frame.io-style version compare. Any two versions of the stack (a picker on each
// side), side by side or stacked in one box with CSS `mix-blend-mode: difference` —
// identical pixels cancel to black and only what changed between the cuts lights
// up. "Highlight changes" goes further and paints every pixel whose change beats a
// threshold, so a subtle recolour that the blend leaves near-black still shows.
//
// For two videos one transport drives both: side A is the master, B follows it
// frame by frame (compareMath.followerCorrection). Exactly one side is audible.
//
// Toggling difference mode only restyles the same two elements, so the videos are
// never remounted and keep their playhead.

import type { MediaAsset, MediaAssetVersion } from '@continuum/contracts';
import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast-imperative';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { cn } from '@/lib/utils';
import { formatTimecode } from '../annotationGeometry';
import { resolveStageMedia, type StageMedia } from '../stageMedia';
import { DEFAULT_FPS, diffMask, estimateFps, followerCorrection } from './compareMath';

type CompareSide = {
  /** Short name for the audio toggle, e.g. "v2". */
  label: string;
  /** e.g. "v2 · Current · 3 days ago" */
  caption: string;
  media: StageMedia;
};

type AudibleSide = 'a' | 'b' | 'off';
type MediaElement = HTMLVideoElement | HTMLImageElement;

const FPS_SAMPLE_FRAMES = 10;
// The diff is a guide, not a measurement: a 320 px wide read keeps two
// getImageData calls per frame cheap enough to run at the video's frame rate.
const DIFF_MAX_WIDTH = 320;
const DEFAULT_THRESHOLD = 32;

function toSide(asset: MediaAsset, version: MediaAssetVersion): CompareSide {
  const label = `v${version.versionNumber}`;
  return {
    label,
    caption: `${label}${version.isHead ? ' · Current' : ''} · ${formatRelativeTime(version.createdAt)}`,
    media: version.isHead
      ? resolveStageMedia({ asset, viewedVersion: null, headVersion: version })
      : resolveStageMedia({ asset, viewedVersion: version }),
  };
}

function optionLabel(version: MediaAssetVersion): string {
  return `v${version.versionNumber}${version.isHead ? ' · current' : ''}`;
}

function videoOf(element: MediaElement | null): HTMLVideoElement | null {
  return element instanceof HTMLVideoElement ? element : null;
}

// Pausing or seeking lands both players on the same frame exactly; the rate
// controller is only for keeping them there while they run.
function snapFollower(
  master: HTMLVideoElement | null,
  follower: HTMLVideoElement | null,
  frameSec: number,
) {
  if (!master || !follower || follower.seeking) return;
  follower.playbackRate = 1;
  if (Math.abs(follower.currentTime - master.currentTime) > frameSec / 2) {
    follower.currentTime = master.currentTime;
  }
}

// Draws `source` object-contain into a width×height box — the same fit the
// stage gives it — so pixel (x, y) of both reads is the same point on screen.
function drawContained(
  context: CanvasRenderingContext2D,
  source: MediaElement,
  width: number,
  height: number,
): boolean {
  const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const sourceHeight =
    source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!sourceWidth || !sourceHeight) return false;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.clearRect(0, 0, width, height);
  context.drawImage(
    source,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
  return true;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: MediaAsset;
  /** Every version of the stack, newest first. */
  versions: MediaAssetVersion[];
  initialAId: string;
  initialBId: string;
};

function VersionPicker({
  side,
  testId,
  value,
  otherValue,
  versions,
  onChange,
}: {
  side: 'A' | 'B';
  testId: string;
  value: string;
  otherValue: string;
  versions: MediaAssetVersion[];
  onChange: (versionId: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        className="h-7 w-32 text-xs"
        aria-label={`Version on side ${side}`}
        data-testid={testId}
      >
        <span className="text-muted-foreground">{side}</span>
        <SelectValue
          items={Object.fromEntries(versions.map((version) => [version.id, optionLabel(version)]))}
        />
      </SelectTrigger>
      <SelectContent>
        {versions.map((version) => (
          <SelectItem
            key={version.id}
            value={version.id}
            disabled={version.id === otherValue}
            data-version-id={version.id}
          >
            {optionLabel(version)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SideMedia({
  side,
  testId,
  mediaRef,
  muted,
  synced,
  onReady,
  onTimeUpdate,
  onPlay,
  onPause,
  onSeeked,
  onLoadedMetadata,
}: {
  side: CompareSide;
  testId: string;
  mediaRef: React.RefObject<MediaElement | null>;
  muted: boolean;
  synced: boolean;
  onReady: () => void;
  onTimeUpdate?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onSeeked?: () => void;
  onLoadedMetadata?: () => void;
}) {
  const { media } = side;
  const attach = (element: MediaElement | null) => {
    mediaRef.current = element;
  };
  // crossOrigin: the highlight reads both frames back with getImageData, which a
  // non-CORS load would taint. Supabase Storage signs its URLs with CORS headers.
  if (media.src && media.kind === 'video') {
    return (
      // biome-ignore lint/a11y/useMediaCaption: comparing the user's own uploaded cuts; no caption track exists
      <video
        key={media.key}
        ref={attach}
        data-testid={testId}
        data-source-role={media.sourceRole}
        src={media.src}
        crossOrigin="anonymous"
        muted={muted}
        controls={!synced}
        playsInline
        preload="auto"
        className="size-full object-contain"
        onLoadedData={onReady}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
        onSeeked={onSeeked ?? onReady}
        onLoadedMetadata={onLoadedMetadata}
      />
    );
  }
  if (media.src && media.kind === 'image') {
    return (
      <img
        key={media.key}
        ref={attach}
        src={media.src}
        crossOrigin="anonymous"
        alt={side.caption}
        className="size-full object-contain"
        onLoad={onReady}
      />
    );
  }
  return (
    <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
      No visual preview for {media.label}
    </div>
  );
}

export function VersionCompareDialog({
  open,
  onOpenChange,
  asset,
  versions,
  initialAId,
  initialBId,
}: Props) {
  const mediaA = useRef<MediaElement | null>(null);
  const mediaB = useRef<MediaElement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const highlightCanvas = useRef<HTMLCanvasElement>(null);
  const scratchCanvas = useRef<HTMLCanvasElement | null>(null);
  const driftLabel = useRef<HTMLSpanElement>(null);
  const fpsRef = useRef<number | null>(null);
  const paintRef = useRef<() => void>(() => undefined);
  const [aId, setAId] = useState(initialAId);
  const [bId, setBId] = useState(initialBId);
  const [difference, setDifference] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [audible, setAudible] = useState<AudibleSide>('a');
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [fps, setFps] = useState<number | null>(null);

  // A refresh can drop a version (unstacked elsewhere); fall back rather than blank.
  const versionA = versions.find((version) => version.id === aId) ?? versions[0];
  const versionB = versions.find((version) => version.id === bId) ?? versions[1] ?? versions[0];
  const a = toSide(asset, versionA);
  const b = toSide(asset, versionB);
  const synced = a.media.kind === 'video' && b.media.kind === 'video';
  const frameSec = () => 1 / (fpsRef.current ?? DEFAULT_FPS);

  const snap = () => snapFollower(videoOf(mediaA.current), videoOf(mediaB.current), frameSec());

  // Steered on the media clocks (currentTime), measured once per display frame. Measured
  // in headless Chrome against the frames actually presented: this holds both players on
  // the same frame (median 0, clock gap ~7 ms at 30 fps); steering on presented-frame
  // times instead chased a one-frame phase artefact and never closed.
  const correctFollower = () => {
    const master = videoOf(mediaA.current);
    const follower = videoOf(mediaB.current);
    if (!master || !follower) return;
    const drift = follower.currentTime - master.currentTime;
    if (driftLabel.current)
      driftLabel.current.textContent = `${(Math.abs(drift) * 1000).toFixed(1)} ms`;
    if (follower.seeking) return;
    const correction = followerCorrection({ drift, frameSec: frameSec() });
    if ('seek' in correction) follower.currentTime = master.currentTime;
    else if (follower.playbackRate !== correction.playbackRate) {
      follower.playbackRate = correction.playbackRate;
    }
  };

  const paintHighlight = () => {
    const canvas = highlightCanvas.current;
    const stage = stageRef.current;
    const first = mediaA.current;
    const second = mediaB.current;
    if (!canvas || !stage || !first || !second || stage.clientWidth === 0) return;
    const scale = Math.min(1, DIFF_MAX_WIDTH / stage.clientWidth);
    const width = Math.max(1, Math.round(stage.clientWidth * scale));
    const height = Math.max(1, Math.round(stage.clientHeight * scale));
    scratchCanvas.current ??= document.createElement('canvas');
    const scratch = scratchCanvas.current;
    if (scratch.width !== width || scratch.height !== height) {
      scratch.width = width;
      scratch.height = height;
    }
    const context = scratch.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    try {
      if (!drawContained(context, first, width, height)) return;
      const pixelsA = context.getImageData(0, 0, width, height).data;
      if (!drawContained(context, second, width, height)) return;
      const pixelsB = context.getImageData(0, 0, width, height).data;
      const { mask, changedRatio } = diffMask(pixelsA, pixelsB, threshold);
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.putImageData(new ImageData(mask, width, height), 0, 0);
      canvas.dataset.changedRatio = changedRatio.toFixed(3);
    } catch (err) {
      // A SecurityError here means a source was served without CORS headers.
      setHighlight(false);
      toast.error(`Highlight unavailable · ${(err as Error).message}`);
    }
  };

  useEffect(() => {
    paintRef.current = paintHighlight;
  });

  // Images and paused videos have no frame loop to repaint them.
  // biome-ignore lint/correctness/useExhaustiveDependencies: repaint when what the highlight shows changes
  useEffect(() => {
    paintRef.current();
  }, [difference, highlight, threshold, a.media.key, b.media.key]);

  // timeupdate fires only ~4x/second — too coarse to hold a frame. Each rendered
  // frame of the master is the moment to measure the frame rate, steer the
  // follower, and repaint the highlight.
  // biome-ignore lint/correctness/useExhaustiveDependencies: correctFollower reads refs only; re-subscribe when the players change
  useEffect(() => {
    const master = videoOf(mediaA.current);
    if (!synced || !playing || !master || !('requestVideoFrameCallback' in master)) return;
    const mediaTimes: number[] = [];
    let handle = 0;
    const onFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (fpsRef.current === null) {
        mediaTimes.push(metadata.mediaTime);
        if (mediaTimes.length >= FPS_SAMPLE_FRAMES) {
          fpsRef.current = estimateFps(mediaTimes);
          setFps(fpsRef.current);
        }
      }
      paintRef.current();
      handle = master.requestVideoFrameCallback(onFrame);
    };
    handle = master.requestVideoFrameCallback(onFrame);
    // The follower is steered on every display frame, not only on the master's video
    // frames: those callbacks can be throttled (a headless or backgrounded page), and a
    // measured 50 ms drift that never closed was the controller not running at all.
    let steer = 0;
    const onDisplayFrame = () => {
      correctFollower();
      steer = requestAnimationFrame(onDisplayFrame);
    };
    steer = requestAnimationFrame(onDisplayFrame);
    return () => {
      master.cancelVideoFrameCallback(handle);
      cancelAnimationFrame(steer);
    };
  }, [synced, playing, a.media.key, b.media.key]);

  const togglePlay = () => {
    const master = videoOf(mediaA.current);
    if (!master) return;
    if (master.paused) void master.play().catch(() => setPlaying(false));
    else master.pause();
  };

  const seek = (seconds: number) => {
    for (const video of [videoOf(mediaA.current), videoOf(mediaB.current)]) {
      if (video) video.currentTime = seconds;
    }
    setCurrentSec(seconds);
  };

  const pick = (side: 'a' | 'b', versionId: string) => {
    videoOf(mediaA.current)?.pause();
    seek(0);
    fpsRef.current = null;
    setFps(null);
    if (side === 'a') setAId(versionId);
    else setBId(versionId);
  };

  const masterEvents = synced
    ? {
        onPlay: () => {
          setPlaying(true);
          snap();
          void videoOf(mediaB.current)
            ?.play()
            .catch(() => undefined);
        },
        onPause: () => {
          setPlaying(false);
          videoOf(mediaB.current)?.pause();
          snap();
        },
        onSeeked: () => {
          snap();
          paintRef.current();
        },
        onTimeUpdate: () => {
          const master = videoOf(mediaA.current);
          setCurrentSec(master?.currentTime ?? 0);
          // Without requestVideoFrameCallback the coarse timeupdate still steers.
          if (master && !('requestVideoFrameCallback' in master)) correctFollower();
        },
        onLoadedMetadata: () => setDurationSec(videoOf(mediaA.current)?.duration ?? 0),
      }
    : {};
  const repaint = () => paintRef.current();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="compare-dialog"
        data-fps={fps ?? undefined}
        className="max-w-5xl sm:max-w-5xl"
      >
        <DialogTitle className="text-sm">
          Compare {a.label} and {b.label}
        </DialogTitle>

        <div className="flex flex-wrap items-center gap-2">
          <VersionPicker
            side="A"
            testId="compare-pick-a"
            value={versionA.id}
            otherValue={versionB.id}
            versions={versions}
            onChange={(versionId) => pick('a', versionId)}
          />
          <VersionPicker
            side="B"
            testId="compare-pick-b"
            value={versionB.id}
            otherValue={versionA.id}
            versions={versions}
            onChange={(versionId) => pick('b', versionId)}
          />
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
          {difference ? (
            <Button
              type="button"
              size="sm"
              variant={highlight ? 'default' : 'outline'}
              className="h-7 text-xs"
              aria-pressed={highlight}
              data-testid="compare-highlight-toggle"
              onClick={() => setHighlight((value) => !value)}
            >
              Highlight changes
            </Button>
          ) : null}
          {difference && highlight ? (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Threshold
              <input
                type="range"
                min={0}
                max={255}
                step={1}
                value={threshold}
                data-testid="compare-threshold"
                onChange={(event) => setThreshold(Number(event.target.value))}
                className="w-24 accent-primary"
              />
              <span className="w-7 tabular-nums">{threshold}</span>
            </label>
          ) : null}
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
          ref={stageRef}
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
                mediaRef={mediaA}
                muted={audible !== 'a'}
                synced={synced}
                onReady={repaint}
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
                mediaRef={mediaB}
                muted={audible !== 'b'}
                synced={synced}
                onReady={repaint}
              />
            </div>
          </figure>
          {difference && highlight ? (
            <canvas
              ref={highlightCanvas}
              data-testid="compare-highlight-canvas"
              aria-label="Changed pixels"
              className="pointer-events-none absolute inset-0 size-full [image-rendering:pixelated]"
            />
          ) : null}
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
            <span
              ref={driftLabel}
              data-testid="compare-drift-ms"
              title="Drift between the two players"
              className="w-16 text-right text-2xs tabular-nums text-muted-foreground"
            >
              0.0 ms
            </span>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
