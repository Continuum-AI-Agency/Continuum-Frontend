'use client';

// Frame.io-style comparison viewer for any two things the caller offers — two
// versions of one stack, or two unrelated assets (see CompareAssetsDialog) — each
// side picked from the same list.
//
// Three layouts over the same two media elements, so switching never remounts a
// player or loses a playhead:
//   · side by side;
//   · overlay: B over A, revealed right of a draggable wipe;
//   · difference: B over A with `mix-blend-mode: difference`, identical pixels
//     cancel to black; "Highlight changes" paints every pixel whose change beats a
//     threshold, so a subtle recolour the blend leaves near-black still shows.
//
// Linked (the default): stills share one zoom/pan view, and two videos (or two
// audio files) run off one transport — side A is the master, B follows it frame
// by frame (compareMath.followerCorrection), exactly one side audible. Unlinked:
// each side zooms and plays on its own, with its own controls.

import { Link2, Pause, Play, Unlink } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { fitContentRect, formatTimecode } from '../annotationGeometry';
import { useWaveform } from '../audio/useWaveform';
import type { StageMedia } from '../stageMedia';
import { ZoomStage } from '../zoom/ZoomStage';
import { FIT_VIEW, type ZoomView } from '../zoom/zoomMath';
import { DEFAULT_FPS, diffMask, estimateFps, followerCorrection } from './compareMath';

export type CompareOption = {
  /** Unique across the list (a version id). */
  id: string;
  /** Short name for the audio toggle and the title, e.g. "v2". */
  label: string;
  /** The picker's row. */
  optionLabel: string;
  /** Under the pane, e.g. "v2 · Current · 3 days ago". */
  caption: string;
  media: StageMedia;
};

type Mode = 'side' | 'overlay' | 'difference';
type AudibleSide = 'a' | 'b' | 'off';
type MediaElement = HTMLVideoElement | HTMLImageElement | HTMLAudioElement;

const FPS_SAMPLE_FRAMES = 10;
// The diff is a guide, not a measurement: a 320 px wide read keeps two
// getImageData calls per frame cheap enough to run at the video's frame rate.
const DIFF_MAX_WIDTH = 320;
const DEFAULT_THRESHOLD = 32;

function playableOf(element: MediaElement | null): HTMLMediaElement | null {
  return element instanceof HTMLMediaElement ? element : null;
}

function videoOf(element: MediaElement | null): HTMLVideoElement | null {
  return element instanceof HTMLVideoElement ? element : null;
}

// Pausing or seeking lands both players on the same frame exactly; the rate
// controller is only for keeping them there while they run.
function snapFollower(
  master: HTMLMediaElement | null,
  follower: HTMLMediaElement | null,
  frameSec: number,
) {
  if (!master || !follower || follower.seeking) return;
  follower.playbackRate = 1;
  if (Math.abs(follower.currentTime - master.currentTime) > frameSec / 2) {
    follower.currentTime = master.currentTime;
  }
}

// Draws `source` where it sits on screen — its object-contain rect inside its own
// box, which for a zoomed still is the zoomed image itself — into a canvas that
// maps the stage at `scale`, so pixel (x, y) of both reads is one point on screen.
function drawAsShown(
  context: CanvasRenderingContext2D,
  source: HTMLVideoElement | HTMLImageElement,
  stage: DOMRect,
  scale: number,
): boolean {
  const natural =
    source instanceof HTMLVideoElement
      ? { width: source.videoWidth, height: source.videoHeight }
      : { width: source.naturalWidth, height: source.naturalHeight };
  const box = source.getBoundingClientRect();
  const fit = fitContentRect({ width: box.width, height: box.height }, natural);
  if (!fit) return false;
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.drawImage(
    source,
    (box.left - stage.left + fit.left) * scale,
    (box.top - stage.top + fit.top) * scale,
    fit.width * scale,
    fit.height * scale,
  );
  return true;
}

function SidePicker({
  side,
  testId,
  value,
  otherValue,
  options,
  onChange,
}: {
  side: 'A' | 'B';
  testId: string;
  value: string;
  otherValue: string;
  options: CompareOption[];
  onChange: (id: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => next && onChange(next)}>
      <SelectTrigger
        size="sm"
        className="h-7 max-w-56 text-xs"
        aria-label={`Compare side ${side}`}
        data-testid={testId}
      >
        <span className="text-muted-foreground">{side}</span>
        <SelectValue
          items={Object.fromEntries(options.map((option) => [option.id, option.optionLabel]))}
        />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.id}
            value={option.id}
            disabled={option.id === otherValue}
            data-version-id={option.id}
          >
            {option.optionLabel}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type MediaEvents = {
  onTimeUpdate?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onSeeked?: () => void;
  onLoadedMetadata?: () => void;
};

function AudioPane({
  media,
  testId,
  attach,
  muted,
  synced,
  events,
}: {
  media: StageMedia;
  testId: string;
  attach: (element: HTMLAudioElement | null) => void;
  muted: boolean;
  synced: boolean;
  events: MediaEvents;
}) {
  const { canvasRef, peakCount } = useWaveform(media.src);
  const [progress, setProgress] = useState(0);
  const follow = (audio: HTMLAudioElement) =>
    setProgress(audio.duration > 0 ? audio.currentTime / audio.duration : 0);
  return (
    <div className="flex size-full flex-col justify-center gap-3 p-4">
      <div className="relative h-28 w-full rounded-md bg-background/60 text-foreground/70">
        <canvas
          ref={canvasRef}
          data-testid={`${testId}-waveform`}
          data-peaks={peakCount ?? undefined}
          className="size-full"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px bg-primary"
          style={{ left: `${progress * 100}%` }}
        />
      </div>
      {/* biome-ignore lint/a11y/useMediaCaption: comparing the user's own audio; the transcript is its text */}
      <audio
        ref={attach}
        data-testid={testId}
        src={media.src ?? undefined}
        crossOrigin="anonymous"
        muted={muted}
        controls={!synced}
        preload="auto"
        className="w-full"
        onTimeUpdate={(event) => {
          follow(event.currentTarget);
          events.onTimeUpdate?.();
        }}
        onPlay={events.onPlay}
        onPause={events.onPause}
        onSeeked={(event) => {
          follow(event.currentTarget);
          events.onSeeked?.();
        }}
        onLoadedMetadata={events.onLoadedMetadata}
      />
    </div>
  );
}

function SideMedia({
  side,
  pane,
  mediaRef,
  muted,
  synced,
  view,
  onViewChange,
  onReady,
  events,
}: {
  side: CompareOption;
  pane: 'a' | 'b';
  mediaRef: React.RefObject<MediaElement | null>;
  muted: boolean;
  synced: boolean;
  view: ZoomView;
  onViewChange: (view: ZoomView) => void;
  onReady: () => void;
  events: MediaEvents;
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
        data-testid={`compare-video-${pane}`}
        data-source-role={media.sourceRole}
        src={media.src}
        crossOrigin="anonymous"
        muted={muted}
        controls={!synced}
        playsInline
        preload="auto"
        className="size-full object-contain"
        onLoadedData={onReady}
        onTimeUpdate={events.onTimeUpdate}
        onPlay={events.onPlay}
        onPause={events.onPause}
        onSeeked={events.onSeeked ?? onReady}
        onLoadedMetadata={events.onLoadedMetadata}
      />
    );
  }
  if (media.src && media.kind === 'image') {
    return (
      <div className="relative size-full">
        <ZoomStage
          key={media.key}
          src={media.src}
          alt={side.caption}
          crossOrigin="anonymous"
          imageRef={attach}
          imageTestId={`compare-image-${pane}`}
          view={view}
          onViewChange={onViewChange}
          onLoad={onReady}
        />
      </div>
    );
  }
  if (media.src && media.kind === 'audio') {
    return (
      <AudioPane
        key={media.key}
        media={media}
        testId={`compare-audio-player-${pane}`}
        attach={attach}
        muted={muted}
        synced={synced}
        events={events}
      />
    );
  }
  return (
    <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
      No visual preview for {media.label}
    </div>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: CompareOption[];
  initialAId: string;
  initialBId: string;
  title?: string;
};

export function CompareDialog({
  open,
  onOpenChange,
  options,
  initialAId,
  initialBId,
  title,
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
  const [mode, setMode] = useState<Mode>('side');
  const [wipe, setWipe] = useState(50);
  const [linked, setLinked] = useState(true);
  const [sharedView, setSharedView] = useState<ZoomView>(FIT_VIEW);
  const [ownViews, setOwnViews] = useState<{ a: ZoomView; b: ZoomView }>({
    a: FIT_VIEW,
    b: FIT_VIEW,
  });
  const [highlight, setHighlight] = useState(false);
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [audible, setAudible] = useState<AudibleSide>('a');
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [fps, setFps] = useState<number | null>(null);

  // A refresh can drop an option (unstacked elsewhere); fall back rather than blank.
  const a = options.find((option) => option.id === aId) ?? options[0];
  const b = options.find((option) => option.id === bId) ?? options[1] ?? options[0];
  const difference = mode === 'difference';
  const stacked = mode !== 'side';
  const visual = (media: StageMedia) => media.kind === 'image' || media.kind === 'video';
  const canStack = visual(a.media) && visual(b.media);
  const timed = (media: StageMedia) => media.kind === 'video' || media.kind === 'audio';
  const synced = linked && timed(a.media) && a.media.kind === b.media.kind;
  // Stacked panes are one picture: their zoom cannot come apart.
  const zoomLinked = linked || stacked;
  const frameSec = () => 1 / (fpsRef.current ?? DEFAULT_FPS);

  const snap = () =>
    snapFollower(playableOf(mediaA.current), playableOf(mediaB.current), frameSec());

  // Steered on the media clocks (currentTime), measured once per display frame. Measured
  // in headless Chrome against the frames actually presented: this holds both players on
  // the same frame (median 0, clock gap ~7 ms at 30 fps); steering on presented-frame
  // times instead chased a one-frame phase artefact and never closed.
  const correctFollower = () => {
    const master = playableOf(mediaA.current);
    const follower = playableOf(mediaB.current);
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
    if (!canvas || !stage || stage.clientWidth === 0) return;
    if (first instanceof HTMLAudioElement || second instanceof HTMLAudioElement) return;
    if (!first || !second) return;
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
    const stageBox = stage.getBoundingClientRect();
    try {
      if (!drawAsShown(context, first, stageBox, scale)) return;
      const pixelsA = context.getImageData(0, 0, width, height).data;
      if (!drawAsShown(context, second, stageBox, scale)) return;
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
  }, [mode, highlight, threshold, a.media.key, b.media.key, sharedView]);

  // timeupdate fires only ~4x/second — too coarse to hold a frame. Each rendered
  // frame of a video master is the moment to measure the frame rate and repaint
  // the highlight; the follower is steered on every display frame.
  // biome-ignore lint/correctness/useExhaustiveDependencies: correctFollower reads refs only; re-subscribe when the players change
  useEffect(() => {
    const master = playableOf(mediaA.current);
    if (!synced || !playing || !master) return;
    const video = videoOf(mediaA.current);
    const mediaTimes: number[] = [];
    let handle = 0;
    if (video && 'requestVideoFrameCallback' in video) {
      const onFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
        if (fpsRef.current === null) {
          mediaTimes.push(metadata.mediaTime);
          if (mediaTimes.length >= FPS_SAMPLE_FRAMES) {
            fpsRef.current = estimateFps(mediaTimes);
            setFps(fpsRef.current);
          }
        }
        paintRef.current();
        handle = video.requestVideoFrameCallback(onFrame);
      };
      handle = video.requestVideoFrameCallback(onFrame);
    }
    // Steered on every display frame, not only on the master's video frames: those
    // callbacks can be throttled (a headless or backgrounded page), and a measured
    // 50 ms drift that never closed was the controller not running at all.
    let steer = 0;
    const onDisplayFrame = () => {
      correctFollower();
      steer = requestAnimationFrame(onDisplayFrame);
    };
    steer = requestAnimationFrame(onDisplayFrame);
    return () => {
      if (video && handle) video.cancelVideoFrameCallback(handle);
      cancelAnimationFrame(steer);
    };
  }, [synced, playing, a.media.key, b.media.key]);

  const togglePlay = () => {
    const master = playableOf(mediaA.current);
    if (!master) return;
    if (master.paused) void master.play().catch(() => setPlaying(false));
    else master.pause();
  };

  const seek = (seconds: number) => {
    for (const element of [playableOf(mediaA.current), playableOf(mediaB.current)]) {
      if (element) element.currentTime = seconds;
    }
    setCurrentSec(seconds);
  };

  const pick = (side: 'a' | 'b', id: string) => {
    playableOf(mediaA.current)?.pause();
    playableOf(mediaB.current)?.pause();
    seek(0);
    fpsRef.current = null;
    setFps(null);
    if (side === 'a') setAId(id);
    else setBId(id);
  };

  const toggleLinked = () => {
    const next = !linked;
    setLinked(next);
    // Unlinking starts each side where the shared view left it.
    if (!next) setOwnViews({ a: sharedView, b: sharedView });
    else playableOf(mediaB.current)?.pause();
  };

  const masterEvents: MediaEvents = synced
    ? {
        onPlay: () => {
          setPlaying(true);
          snap();
          void playableOf(mediaB.current)
            ?.play()
            .catch(() => undefined);
        },
        onPause: () => {
          setPlaying(false);
          playableOf(mediaB.current)?.pause();
          snap();
        },
        onSeeked: () => {
          snap();
          paintRef.current();
        },
        onTimeUpdate: () => {
          const master = playableOf(mediaA.current);
          setCurrentSec(master?.currentTime ?? 0);
          // Without requestVideoFrameCallback the coarse timeupdate still steers.
          if (master && !('requestVideoFrameCallback' in master)) correctFollower();
        },
        onLoadedMetadata: () => setDurationSec(playableOf(mediaA.current)?.duration ?? 0),
      }
    : {};
  const repaint = () => paintRef.current();
  const viewOf = (pane: 'a' | 'b') => (zoomLinked ? sharedView : ownViews[pane]);
  const setViewOf = (pane: 'a' | 'b') => (view: ZoomView) =>
    zoomLinked ? setSharedView(view) : setOwnViews((views) => ({ ...views, [pane]: view }));

  const dragWipe = (event: React.PointerEvent<HTMLElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const bounds = stage.getBoundingClientRect();
    const at = (clientX: number) =>
      setWipe(
        Math.round(Math.min(100, Math.max(0, ((clientX - bounds.left) / bounds.width) * 100))),
      );
    at(event.clientX);
    const move = (moveEvent: PointerEvent) => at(moveEvent.clientX);
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="compare-dialog"
        data-fps={fps ?? undefined}
        data-mode={mode}
        data-linked={linked ? 'true' : 'false'}
        className="max-w-5xl sm:max-w-5xl"
      >
        <DialogTitle className="text-sm">
          {title ?? `Compare ${a.label} and ${b.label}`}
        </DialogTitle>

        <div className="flex flex-wrap items-center gap-2">
          <SidePicker
            side="A"
            testId="compare-pick-a"
            value={a.id}
            otherValue={b.id}
            options={options}
            onChange={(id) => pick('a', id)}
          />
          <SidePicker
            side="B"
            testId="compare-pick-b"
            value={b.id}
            otherValue={a.id}
            options={options}
            onChange={(id) => pick('b', id)}
          />
          {canStack ? (
            <>
              <Button
                type="button"
                size="sm"
                variant={mode === 'overlay' ? 'default' : 'outline'}
                className="h-7 text-xs"
                aria-pressed={mode === 'overlay'}
                data-testid="compare-overlay-toggle"
                onClick={() => setMode((value) => (value === 'overlay' ? 'side' : 'overlay'))}
              >
                Overlay
              </Button>
              <Button
                type="button"
                size="sm"
                variant={difference ? 'default' : 'outline'}
                className="h-7 text-xs"
                aria-pressed={difference}
                data-testid="compare-diff-toggle"
                onClick={() => setMode((value) => (value === 'difference' ? 'side' : 'difference'))}
              >
                Difference
              </Button>
            </>
          ) : null}
          {difference && canStack ? (
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
          {difference && highlight && canStack ? (
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
          {mode === 'overlay' && canStack ? (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Wipe
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={wipe}
                aria-label="Overlay wipe position"
                data-testid="compare-overlay-slider"
                onChange={(event) => setWipe(Number(event.target.value))}
                className="w-28 accent-primary"
              />
            </label>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={linked ? 'default' : 'outline'}
            className="h-7 gap-1 text-xs"
            aria-pressed={linked}
            data-testid="compare-link-toggle"
            title={
              linked
                ? 'Linked: one zoom and one transport drive both sides'
                : 'Unlinked: each side zooms and plays on its own'
            }
            onClick={toggleLinked}
          >
            {linked ? <Link2 className="size-3.5" /> : <Unlink className="size-3.5" />}
            {linked ? 'Linked' : 'Unlinked'}
          </Button>
          {synced ? (
            <fieldset className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <legend className="sr-only">Audible side</legend>
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
          data-testid="compare-stage"
          className={cn(
            stacked && canStack
              ? 'relative isolate h-[60vh] overflow-hidden bg-black'
              : 'grid h-[60vh] grid-cols-2 gap-3',
          )}
        >
          <figure
            className={cn(
              'flex min-h-0 flex-col gap-1.5',
              stacked && canStack && 'absolute inset-0',
            )}
          >
            <figcaption
              className={cn('text-xs text-muted-foreground', stacked && canStack && 'sr-only')}
            >
              A · {a.caption}
            </figcaption>
            <div className="relative min-h-0 flex-1 overflow-hidden rounded bg-muted">
              <SideMedia
                side={a}
                pane="a"
                mediaRef={mediaA}
                muted={synced ? audible !== 'a' : false}
                synced={synced}
                view={viewOf('a')}
                onViewChange={setViewOf('a')}
                onReady={repaint}
                events={masterEvents}
              />
            </div>
          </figure>
          <figure
            data-testid={
              difference && canStack
                ? 'compare-diff-layer'
                : mode === 'overlay' && canStack
                  ? 'compare-overlay-layer'
                  : undefined
            }
            style={
              difference && canStack
                ? { mixBlendMode: 'difference' }
                : mode === 'overlay' && canStack
                  ? { clipPath: `inset(0 0 0 ${wipe}%)` }
                  : undefined
            }
            className={cn(
              'flex min-h-0 flex-col gap-1.5',
              stacked && canStack && 'absolute inset-0',
            )}
          >
            <figcaption
              className={cn('text-xs text-muted-foreground', stacked && canStack && 'sr-only')}
            >
              B · {b.caption}
            </figcaption>
            <div className="relative min-h-0 flex-1 overflow-hidden rounded bg-muted">
              <SideMedia
                side={b}
                pane="b"
                mediaRef={mediaB}
                // Unlinked, each player is the reviewer's own to unmute.
                muted={synced ? audible !== 'b' : false}
                synced={synced}
                view={viewOf('b')}
                onViewChange={setViewOf('b')}
                onReady={repaint}
                events={{}}
              />
            </div>
          </figure>
          {mode === 'overlay' && canStack ? (
            <button
              type="button"
              aria-label="Drag the overlay wipe"
              data-testid="compare-wipe-handle"
              onPointerDown={dragWipe}
              className="absolute inset-y-0 z-40 w-4 -translate-x-1/2 cursor-ew-resize"
              style={{ left: `${wipe}%` }}
            >
              <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow" />
              <span className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow" />
            </button>
          ) : null}
          {difference && highlight && canStack ? (
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
              aria-label={playing ? 'Pause both sides' : 'Play both sides'}
              data-testid="compare-play"
              onClick={togglePlay}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <input
              type="range"
              aria-label="Seek both sides"
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
