'use client';

// Video stage with Frame.io-style review: a custom transport, comment markers
// riding above the scrubber (a dot for a moment, a tailed span for a range), and
// an editor's hotkeys —
//   Space play/pause · J/K/L shuttle back/stop/forward (repeat for 2×, 4×)
//   ←/→ one frame · I/O mark a range · C comment (on the range, or the playhead)
//   ⌘Z/⇧⌘Z undo/redo a mark · Esc clears the range.
// A range can also be dragged by its handles. While a comment is open on a
// paused frame the reviewer can draw on it (arrow, line, box, freehand, in a
// colour), and the marks are saved with the comment's timecode.
//
// Frame stepping uses the file's MEASURED frame rate and lands on each frame's
// first millisecond, so the timecode a comment stores maps back to the frame the
// reviewer saw (see lib/library/commentExport frameAtMs/msForFrame).
//
// Given the asset and version, it also reads the version's playback renditions: a
// quality menu over the proxy ladder (Auto picks by stage size and HDR support), a
// speed menu, a loop toggle, sprite thumbnails over the seek lane, and a PNG still of
// the frame on screen.

import {
  type CommentAttachment,
  type DrawingShape,
  type LibraryPlaybackRung,
  SCRUB_SPRITE_GRID,
  scrubSpriteTile,
  type TimeAnnotation,
} from '@continuum/contracts';
import {
  Camera,
  ImageOff,
  MessageSquarePlus,
  Pause,
  Play,
  Repeat,
  SquareDashedBottom,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast-imperative';
import {
  type FrameRate,
  frameAtMs,
  framesPerSecond,
  msForFrame,
} from '@/lib/library/commentExport';
import { useLibraryPlayback } from '@/lib/library/libraryPlayback';
import {
  activeStageVideo,
  downloadVideoStill,
  registerStageVideo,
} from '@/lib/library/videoPoster';
import { cn } from '@/lib/utils';
import {
  formatStageRange,
  formatStageTime,
  nextTimecodeDisplay,
  setTimecodeDisplay,
  TIMECODE_MODE_LABELS,
  useTimecodeDisplay,
} from '../review/timecodeDisplay';
import { AnnotationOverlay, type OverlayPin } from './AnnotationOverlay';
import { DrawingToolbar, handleUndoRedoKey, type StageTool } from './annotation/DrawingToolbar';
import {
  DEFAULT_DRAWING_COLOR,
  drawingHistoryReducer,
  EMPTY_DRAWING,
  shapesAnchor,
} from './annotation/drawing';
import { useFrameRate, useStartTimecode } from './annotation/useFrameRate';
import { formatTimecode, type NormalizedBox, seekFraction } from './annotationGeometry';
import { CommentComposer, type ComposerExtras } from './CommentComposer';
import { detectHdrPlayback, pickPlaybackRung } from './stageMedia';
import { TimelineMarkerStrip, type TimeMarker } from './TimelineMarkerStrip';
import { useStageGeometry } from './useStageGeometry';

// The lane marker plus what only the annotating stage needs: the marks drawn on
// the frame, and a selection the sidebar and the stage share.
export type VideoTimeMarker = TimeMarker & {
  box: NormalizedBox | null;
  shapes?: DrawingShape[];
  selected: boolean;
};

export type PostAtTimeInput = {
  body: string;
  timeMs: number;
  endMs: number | null;
  box: NormalizedBox | null;
  /** The complete annotation to save, marks included. */
  annotation: TimeAnnotation;
  extras: { visibility: ComposerExtras['visibility']; attachments: CommentAttachment[] };
};

type Props = {
  src: string | null;
  durationMsHint: number | null;
  markers: VideoTimeMarker[];
  onSelectMarker: (id: string | null) => void;
  posting: boolean;
  /** Brand context enables @mention autocomplete in the time-pin composer. */
  brandId?: string;
  onPostAtTime: (input: PostAtTimeInput) => void;
  /** Receives a seek function so the sidebar can jump the player to a thread's timestamp. */
  registerSeek: (seek: (ms: number) => void) => void;
  /** Playhead position, for followers (the transcript panel) that coalesce it themselves. */
  onTimeChange?: (timeMs: number) => void;
  /** With `assetVersionId` and `brandId`, loads the version's proxy ladder and scrub sprite. */
  assetId?: string;
  assetVersionId?: string | null;
};

// Stepping still works on a file whose container cannot be read; it just says
// it is guessing.
const NOMINAL_RATE: FrameRate = { num: 30, den: 1 };
const SHUTTLE_SPEEDS = [1, 2, 4] as const;
const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75] as const;

type RungRole = LibraryPlaybackRung['role'];
/** `original` is the `src` the stage handed in; a role is one rung of the proxy ladder. */
type Quality = 'auto' | 'original' | RungRole;
type PlayingSource = { role: RungRole; src: string };

const SELECT_CLASS =
  'h-7 rounded-md border border-border bg-background px-1.5 text-2xs text-muted-foreground';

// The still is named after the asset's own file. Without playback (no asset context) the
// signed URL's last path segment is the best name there is.
function fileStem(src: string, fileName: string | undefined): string {
  if (fileName) return fileName.replace(/\.[^.]+$/, '') || 'frame';
  try {
    const name = decodeURIComponent(new URL(src).pathname.split('/').pop() ?? '');
    return name.replace(/\.[^.]+$/, '') || 'frame';
  } catch {
    return 'frame';
  }
}

type Range = { inMs: number; outMs: number | null };

// The playhead as the millisecond a comment stores. Browsers report a paused
// element's time as the frame's exact presentation time (0.1001 s at 29.97), and
// flooring that lands one millisecond BEFORE the frame; so with a measured rate
// the playhead is the first whole millisecond of the frame on screen, which
// frameAtMs maps straight back to that frame.
function msFromSeconds(seconds: number, rate: FrameRate | null): number {
  if (!rate) return Math.max(0, Math.floor(seconds * 1000 + 1e-6));
  const frame = Math.max(0, Math.floor((seconds * rate.num) / rate.den + 1e-6));
  return msForFrame(frame, rate);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'TEXTAREA' ||
    (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range') ||
    target.tagName === 'SELECT'
  );
}

export function VideoAnnotationPlayer({
  src,
  durationMsHint,
  markers,
  onSelectMarker,
  posting,
  brandId,
  onPostAtTime,
  registerSeek,
  onTimeChange,
  assetId,
  assetVersionId,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const { containerRef, containerSize, contentRect, setNaturalSize } = useStageGeometry();
  const measuredRate = useFrameRate(src);
  const startTimecode = useStartTimecode(src) ?? null;
  const timecodeMode = useTimecodeDisplay();
  const stageTime = (ms: number) => formatStageTime(ms, timecodeMode, measuredRate, startTimecode);
  const stageRange = (from: number, to: number | null) =>
    formatStageRange(from, to, timecodeMode, measuredRate, startTimecode);
  const rate = measuredRate ?? NOMINAL_RATE;
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(durationMsHint ?? 0);
  const [range, setRange] = useState<Range | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [pointMs, setPointMs] = useState<number | null>(null);
  const [shuttle, setShuttle] = useState<{ direction: 1 | -1; speed: number } | null>(null);
  const [tool, setTool] = useState<StageTool>('arrow');
  const [color, setColor] = useState<string>(DEFAULT_DRAWING_COLOR);
  const [drawing, dispatchDrawing] = useReducer(drawingHistoryReducer, EMPTY_DRAWING);
  const [mediaError, setMediaError] = useState(false);
  const playback = useLibraryPlayback({
    brandId,
    assetId,
    versionId: assetVersionId,
    enabled: Boolean(assetVersionId),
  });
  const [quality, setQuality] = useState<Quality>('auto');
  // Null plays the incoming `src`.
  const [source, setSource] = useState<PlayingSource | null>(null);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [hoverFraction, setHoverFraction] = useState<number | null>(null);
  // Where a source swap picks back up once the new bytes have their metadata.
  const resumeRef = useRef<{ atSec: number; play: boolean } | null>(null);
  const autoAppliedRef = useRef(false);
  const playingSrc = source?.src ?? src;
  const sprite = playback?.sprite ?? null;

  const publishTime = useCallback(
    (ms: number) => {
      setCurrentMs(ms);
      onTimeChange?.(ms);
    },
    [onTimeChange],
  );

  const seekTo = useCallback(
    (ms: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = ms / 1000;
      publishTime(ms);
    },
    [publishTime],
  );

  useEffect(() => {
    registerSeek(seekTo);
  }, [registerSeek, seekTo]);

  // The live element time, not the throttled `currentMs` state: an in- or
  // out-point set during playback must land on the frame the reviewer saw.
  const playheadMs = useCallback(
    () =>
      videoRef.current ? msFromSeconds(videoRef.current.currentTime, measuredRate) : currentMs,
    [currentMs, measuredRate],
  );

  // Read by the reverse loop on every frame: a tick already queued when K or a
  // frame step lands must not drag the playhead back after it.
  const reversingRef = useRef(false);

  // Back to the speed the reviewer chose, not 1×.
  const stopShuttle = useCallback(() => {
    reversingRef.current = false;
    setShuttle(null);
    const video = videoRef.current;
    if (video) video.playbackRate = speed;
  }, [speed]);

  const autoRung = useCallback(() => {
    if (!playback) return null;
    const box = containerRef.current?.getBoundingClientRect();
    const shortSide = box ? Math.min(box.width, box.height) : 0;
    return pickPlaybackRung(playback.rungs, {
      ...detectHdrPlayback(),
      stageShortSidePx: shortSide * (window.devicePixelRatio || 1),
    });
  }, [playback, containerRef]);

  // A swap keeps the playhead and the play/pause state: the new bytes seek back and
  // resume once their metadata loads.
  const switchSource = useCallback(
    (next: PlayingSource | null) => {
      const video = videoRef.current;
      if ((next?.src ?? src) === playingSrc) return;
      if (video) resumeRef.current = { atSec: video.currentTime, play: !video.paused };
      stopShuttle();
      setSource(next);
    },
    [src, playingSrc, stopShuttle],
  );

  const selectQuality = (next: Quality) => {
    setQuality(next);
    const rung =
      next === 'original'
        ? null
        : next === 'auto'
          ? autoRung()
          : (playback?.rungs.find((r) => r.role === next) ?? null);
    switchSource(rung ? { role: rung.role, src: rung.signedUrl } : null);
  };

  // Auto takes over silently only while nothing has happened yet; swapping under a
  // reviewer who already pressed play would stall them, so then the menu offers it.
  useEffect(() => {
    if (!playback || autoAppliedRef.current) return;
    autoAppliedRef.current = true;
    const video = videoRef.current;
    if (quality !== 'auto' || !video || !video.paused || video.currentTime > 0) return;
    const rung = autoRung();
    if (rung) setSource({ role: rung.role, src: rung.signedUrl });
  }, [playback, quality, autoRung]);

  const selectSpeed = (next: number) => {
    setSpeed(next);
    const video = videoRef.current;
    if (!video) return;
    // The default survives a source swap, which resets playbackRate to it.
    video.defaultPlaybackRate = next;
    if (!shuttle) video.playbackRate = next;
  };

  // The download menu in the header grabs the frame from this same element.
  useEffect(() => {
    const video = src ? videoRef.current : null;
    registerStageVideo(video, measuredRate);
    return () => {
      if (activeStageVideo() === video) registerStageVideo(null);
    };
  }, [src, measuredRate]);

  const saveStill = () => {
    const video = videoRef.current;
    if (!video || !src) return;
    downloadVideoStill(video, fileStem(src, playback?.fileName)).catch((error: unknown) => {
      console.error('[VideoAnnotationPlayer] still capture failed', error);
      toast.error('Could not save the still', {
        description: error instanceof Error ? error.message : undefined,
      });
    });
  };

  // The pause event follows asynchronously (or never, when already paused); the
  // draw tools must not wait on it.
  const pause = useCallback(() => {
    stopShuttle();
    setPlaying(false);
    videoRef.current?.pause();
  }, [stopShuttle]);

  // Browsers cannot play backwards, so reverse shuttle steps the element's time
  // down on every animation frame.
  useEffect(() => {
    if (shuttle?.direction !== -1) return;
    let frame = 0;
    let last = performance.now();
    reversingRef.current = true;
    const tick = (now: number) => {
      const video = videoRef.current;
      if (!video || !reversingRef.current) return;
      const next = Math.max(0, video.currentTime - ((now - last) / 1000) * shuttle.speed);
      last = now;
      video.currentTime = next;
      publishTime(msFromSeconds(next, measuredRate));
      if (next <= 0) {
        reversingRef.current = false;
        setShuttle(null);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [shuttle, publishTime, measuredRate]);

  const shuttleBy = useCallback(
    (direction: 1 | -1) => {
      const video = videoRef.current;
      if (!video) return;
      const speed =
        shuttle?.direction === direction
          ? (SHUTTLE_SPEEDS[SHUTTLE_SPEEDS.indexOf(shuttle.speed as 1 | 2 | 4) + 1] ??
            shuttle.speed)
          : 1;
      setShuttle({ direction, speed });
      if (direction === 1) {
        video.playbackRate = speed;
        void video.play();
      } else {
        video.pause();
      }
    },
    [shuttle],
  );

  const stepFrames = useCallback(
    (delta: number) => {
      pause();
      const frame = Math.max(0, frameAtMs(playheadMs(), rate) + delta);
      const lastFrame = durationMs > 0 ? Math.max(0, frameAtMs(durationMs, rate) - 1) : frame;
      seekTo(msForFrame(Math.min(frame, lastFrame), rate));
    },
    [pause, playheadMs, rate, durationMs, seekTo],
  );

  const markIn = useCallback(() => {
    const at = playheadMs();
    setRange((prev) => ({ inMs: at, outMs: prev?.outMs && prev.outMs > at ? prev.outMs : null }));
  }, [playheadMs]);

  // The contract requires endMs > timeMs, so an out-point at or before the
  // in-point is not a range and is ignored.
  const markOut = useCallback(() => {
    const at = playheadMs();
    setRange((prev) => {
      const inMs = prev?.inMs ?? pointMs;
      if (inMs === null || inMs === undefined || at <= inMs) return prev;
      return { inMs, outMs: at };
    });
  }, [playheadMs, pointMs]);

  const clearDraft = useCallback(() => {
    setComposerOpen(false);
    setPointMs(null);
    setRange(null);
    dispatchDrawing({ type: 'clear' });
  }, []);

  const openComposer = useCallback(() => {
    pause();
    setPointMs(range?.inMs ?? playheadMs());
    if (range) seekTo(range.inMs);
    setComposerOpen(true);
  }, [pause, playheadMs, range, seekTo]);

  const draftInMs = range?.inMs ?? pointMs;
  const draftOutMs = range?.outMs ?? null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (
        composerOpen &&
        handleUndoRedoKey(event, {
          undo: () => dispatchDrawing({ type: 'undo' }),
          redo: () => dispatchDrawing({ type: 'redo' }),
        })
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const video = videoRef.current;
      if (!video) return;
      const handled = (() => {
        switch (event.key) {
          case ' ':
            if (video.paused && !shuttle) {
              void video.play();
            } else {
              pause();
            }
            return true;
          case 'k':
          case 'K':
            pause();
            return true;
          case 'l':
          case 'L':
            shuttleBy(1);
            return true;
          case 'j':
          case 'J':
            shuttleBy(-1);
            return true;
          case 'ArrowRight':
            stepFrames(event.shiftKey ? 10 : 1);
            return true;
          case 'ArrowLeft':
            stepFrames(event.shiftKey ? -10 : -1);
            return true;
          case 'i':
          case 'I':
            markIn();
            return true;
          case 'o':
          case 'O':
            markOut();
            return true;
          case 'c':
          case 'C':
            if (!composerOpen) openComposer();
            return true;
          case 'Escape':
            if (composerOpen || !range) return false;
            setRange(null);
            return true;
          default:
            return false;
        }
      })();
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [composerOpen, range, shuttle, pause, shuttleBy, stepFrames, markIn, markOut, openComposer]);

  // Dragging a range handle: the lane maps pointer x to a time.
  const dragHandle = (edge: 'in' | 'out') => (event: React.PointerEvent<HTMLButtonElement>) => {
    const lane = laneRef.current;
    if (!lane || !range || durationMs <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    pause();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const bounds = lane.getBoundingClientRect();
    const timeAt = (clientX: number) =>
      msFromSeconds(
        (Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width)) * durationMs) / 1000,
        measuredRate,
      );
    const move = (moveEvent: PointerEvent) => {
      const at = timeAt(moveEvent.clientX);
      setRange((prev) => {
        if (!prev) return prev;
        if (edge === 'in') {
          const limit = prev.outMs === null ? durationMs : prev.outMs - 1;
          return { ...prev, inMs: Math.min(at, limit) };
        }
        return { ...prev, outMs: Math.max(at, prev.inMs + 1) };
      });
      seekTo(at);
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  const nudgeHandle = (edge: 'in' | 'out') => (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    const step = (event.key === 'ArrowRight' ? 1 : -1) * Math.ceil(1000 / framesPerSecond(rate));
    setRange((prev) => {
      if (!prev) return prev;
      if (edge === 'in') {
        const limit = prev.outMs === null ? durationMs : prev.outMs - 1;
        return { ...prev, inMs: Math.min(limit, Math.max(0, prev.inMs + step)) };
      }
      const out = prev.outMs ?? prev.inMs;
      return { ...prev, outMs: Math.min(durationMs, Math.max(prev.inMs + 1, out + step)) };
    });
  };

  // Selected threads show their marks on the frame; a legacy box shows as one.
  const overlayPins: OverlayPin[] = markers
    .filter((m) => m.selected && ((m.shapes?.length ?? 0) > 0 || m.box))
    .map((m) => {
      const shapes: DrawingShape[] = [
        ...(m.box ? [{ tool: 'box' as const, color: '#3B82F6', ...m.box }] : []),
        ...(m.shapes ?? []),
      ];
      return {
        id: m.id,
        annotation: { kind: 'point' as const, ...shapesAnchor(shapes), shapes },
        label: m.initials,
        title: m.title,
        selected: true,
      };
    });

  if (!src) {
    return (
      <div className="flex size-full items-center justify-center text-muted-foreground">
        <ImageOff className="size-8 text-muted-foreground/40" />
      </div>
    );
  }

  const drawable = composerOpen && !playing && !shuttle;
  const currentFrame = frameAtMs(currentMs, rate);
  const rangeLeft = range ? seekFraction(range.inMs, durationMs) : 0;
  const rangeRight = range?.outMs != null ? seekFraction(range.outMs, durationMs) : rangeLeft;

  return (
    <div
      className="flex size-full flex-col"
      data-testid="video-annotation-player"
      data-current-ms={currentMs}
      data-current-frame={currentFrame}
      data-playing={playing || shuttle !== null ? 'true' : 'false'}
      data-shuttle={shuttle ? `${shuttle.direction * shuttle.speed}` : '0'}
      data-frame-rate={measuredRate ? `${measuredRate.num}/${measuredRate.den}` : ''}
      data-range-in={range?.inMs ?? ''}
      data-range-out={range?.outMs ?? ''}
      data-playing-role={source?.role ?? 'original'}
      data-quality={quality}
      data-playback-rate={speed}
    >
      <div ref={containerRef} className="relative min-h-0 flex-1 select-none">
        {/* biome-ignore lint/a11y/useMediaCaption: user-uploaded creative under review; no caption track exists */}
        <video
          ref={videoRef}
          src={playingSrc ?? undefined}
          // Signed Storage URLs answer CORS; without this the still's canvas is tainted.
          crossOrigin="anonymous"
          playsInline
          preload="metadata"
          loop={loop}
          className="absolute inset-0 size-full object-contain"
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            setDurationMs(Math.floor(el.duration * 1000));
            setNaturalSize({ width: el.videoWidth, height: el.videoHeight });
            const resume = resumeRef.current;
            if (!resume) return;
            resumeRef.current = null;
            el.currentTime = resume.atSec;
            if (resume.play) void el.play();
          }}
          onTimeUpdate={(e) => {
            if (shuttle?.direction === -1) return;
            const el = e.currentTarget;
            const ms = msFromSeconds(el.currentTime, measuredRate);
            // With a range marked, loop plays the range rather than the whole clip.
            if (loop && range?.outMs != null && !el.paused && ms >= range.outMs) {
              el.currentTime = range.inMs / 1000;
              return;
            }
            publishTime(ms);
          }}
          onSeeked={(e) => publishTime(msFromSeconds(e.currentTarget.currentTime, measuredRate))}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={stopShuttle}
          // A proxy that will not play falls back to the original before calling it lost.
          onError={() => (source ? switchSource(null) : setMediaError(true))}
        />
        {mediaError ? (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-muted/80 text-muted-foreground"
            role="status"
          >
            <div className="flex flex-col items-center gap-2 text-center">
              <ImageOff className="size-8 text-muted-foreground/40" aria-hidden />
              <span className="text-xs">
                Video preview unavailable. Timeline comments remain available.
              </span>
            </div>
          </div>
        ) : null}
        <AnnotationOverlay
          containerSize={containerSize}
          contentRect={contentRect}
          pins={overlayPins}
          showPinMarkers={false}
          onSelectPin={onSelectMarker}
          drawEnabled={drawable}
          tool={tool}
          color={color}
          draftShapes={drawing.shapes}
          onShapeDrawn={(shape) => dispatchDrawing({ type: 'add', shape })}
        />
        {drawable && (
          <DrawingToolbar
            className="absolute left-3 top-3 z-20"
            tool={tool}
            onToolChange={setTool}
            allowPin={false}
            color={color}
            onColorChange={setColor}
            canUndo={drawing.shapes.length > 0}
            canRedo={drawing.redo.length > 0}
            onUndo={() => dispatchDrawing({ type: 'undo' })}
            onRedo={() => dispatchDrawing({ type: 'redo' })}
          />
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-background px-3 py-2">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => (playing || shuttle ? pause() : void videoRef.current?.play())}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="timecode-mode"
            data-mode={timecodeMode}
            className="h-6 px-1.5 text-2xs text-muted-foreground"
            title="Show time as m:ss, source timecode, or frames"
            onClick={() => setTimecodeDisplay(nextTimecodeDisplay(timecodeMode))}
          >
            {TIMECODE_MODE_LABELS[timecodeMode]}
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">
            <span data-testid="player-time">{stageTime(currentMs)}</span> /{' '}
            {timecodeMode === 'clock' ? formatTimecode(durationMs) : stageTime(durationMs)}
            <span className="ml-1.5 text-muted-foreground/70" data-testid="player-frame">
              f{currentFrame} ·{' '}
              {measuredRate ? `${framesPerSecond(measuredRate).toFixed(2)} fps` : '~30 fps'}
            </span>
            {shuttle ? (
              <span className="ml-1.5 font-medium text-primary">
                {shuttle.direction === -1 ? '◀' : '▶'} {shuttle.speed}×
              </span>
            ) : null}
          </span>

          <div
            ref={laneRef}
            className="relative min-w-0 flex-1 pt-4"
            onPointerMove={(event) => {
              if (!sprite) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              setHoverFraction(
                bounds.width > 0
                  ? Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
                  : null,
              );
            }}
            onPointerLeave={() => setHoverFraction(null)}
          >
            {sprite && hoverFraction !== null ? (
              <div
                data-testid="timeline-hover-thumb"
                data-tile-index={scrubSpriteTile(hoverFraction).index}
                className="pointer-events-none absolute bottom-full z-30 mb-1 flex -translate-x-1/2 flex-col items-center gap-1"
                // Held 80px (half the thumb) inside the lane so the ends stay on screen.
                style={{ left: `clamp(80px, ${hoverFraction * 100}%, calc(100% - 80px))` }}
              >
                <div
                  className="w-40 rounded-md bg-black bg-no-repeat shadow-md ring-1 ring-border"
                  style={{
                    aspectRatio: `${sprite.width} / ${sprite.height}`,
                    backgroundImage: `url("${sprite.signedUrl}")`,
                    backgroundSize: `${SCRUB_SPRITE_GRID * 100}% ${SCRUB_SPRITE_GRID * 100}%`,
                    backgroundPosition: scrubSpriteTile(hoverFraction).backgroundPosition,
                  }}
                />
                <span className="rounded bg-black/75 px-1.5 py-0.5 text-2xs tabular-nums text-white">
                  {stageTime(hoverFraction * durationMs)}
                </span>
              </div>
            ) : null}
            <TimelineMarkerStrip
              markers={markers}
              durationMs={durationMs}
              onSelect={(marker) => {
                pause();
                seekTo(marker.timeMs);
                onSelectMarker(marker.id);
              }}
            />
            {range && durationMs > 0 ? (
              <div
                data-testid="range-selection"
                className="pointer-events-none absolute top-4 z-10 h-1.5 rounded-full bg-amber-400/60"
                style={{
                  left: `${rangeLeft * 100}%`,
                  width: `${Math.max(0, rangeRight - rangeLeft) * 100}%`,
                }}
              >
                <button
                  type="button"
                  data-testid="range-handle-in"
                  aria-label={`Range start ${formatTimecode(range.inMs)}`}
                  onPointerDown={dragHandle('in')}
                  onKeyDown={nudgeHandle('in')}
                  className="pointer-events-auto absolute -top-1.5 left-0 h-4 w-2 -translate-x-1/2 cursor-ew-resize rounded-sm bg-amber-500 ring-1 ring-background"
                />
                {range.outMs !== null ? (
                  <button
                    type="button"
                    data-testid="range-handle-out"
                    aria-label={`Range end ${formatTimecode(range.outMs)}`}
                    onPointerDown={dragHandle('out')}
                    onKeyDown={nudgeHandle('out')}
                    className="pointer-events-auto absolute -top-1.5 right-0 h-4 w-2 translate-x-1/2 cursor-ew-resize rounded-sm bg-amber-500 ring-1 ring-background"
                  />
                ) : null}
              </div>
            ) : null}
            <input
              type="range"
              aria-label="Seek"
              min={0}
              max={Math.max(durationMs, 1)}
              step={1}
              value={Math.min(currentMs, durationMs || currentMs)}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer accent-primary"
            />
          </div>

          {playback && playback.rungs.length > 0 ? (
            <select
              data-testid="player-quality"
              aria-label="Playback quality"
              value={quality}
              className={SELECT_CLASS}
              onChange={(event) => {
                selectQuality(event.target.value as Quality);
                // A focused select swallows the transport hotkeys (it counts as typing).
                event.currentTarget.blur();
              }}
            >
              <option value="auto">Auto</option>
              {playback.rungs.map((rung) => (
                <option key={rung.role} value={rung.role}>
                  {rung.label}
                </option>
              ))}
              <option value="original">Original</option>
            </select>
          ) : null}
          <select
            data-testid="player-speed"
            aria-label="Playback speed"
            value={speed}
            className={SELECT_CLASS}
            onChange={(event) => {
              selectSpeed(Number(event.target.value));
              event.currentTarget.blur();
            }}
          >
            {PLAYBACK_SPEEDS.map((option) => (
              <option key={option} value={option}>
                {option}×
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid="player-loop"
            aria-pressed={loop}
            aria-label={range?.outMs != null ? 'Loop the marked range' : 'Loop'}
            title={range?.outMs != null ? 'Loop the marked range' : 'Loop'}
            className={cn(loop && 'bg-accent text-accent-foreground')}
            onClick={() => setLoop((on) => !on)}
          >
            <Repeat className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-testid="player-download-still"
            aria-label="Download still"
            title="Download this frame as a PNG"
            onClick={saveStill}
          >
            <Camera className="size-4" />
          </Button>

          {!composerOpen ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openComposer}
              title="Comment (C) — mark a range first with I and O"
            >
              <MessageSquarePlus className="size-3.5" />
              {range
                ? `Comment on ${stageRange(range.inMs, range.outMs)}`
                : `Comment at ${stageTime(currentMs)}`}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={markOut}
              disabled={draftInMs === null || currentMs <= draftInMs}
              title="Extend this comment into a range ending at the playhead (O)"
            >
              <SquareDashedBottom className="size-3.5" />
              End at {stageTime(currentMs)}
            </Button>
          )}
        </div>

        {composerOpen && draftInMs !== null && (
          <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2.5">
            <CommentComposer
              placeholder={
                draftOutMs === null ? 'Comment at this moment...' : 'Comment on this passage...'
              }
              busy={posting}
              autoFocus
              brandId={brandId}
              reviewOptions={Boolean(brandId)}
              annotationChip={
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    data-testid="draft-timecode"
                    className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 font-medium tabular-nums text-primary"
                  >
                    {stageRange(draftInMs, draftOutMs)}
                    {draftOutMs !== null && (
                      <button
                        type="button"
                        aria-label="Clear the end point and comment on a single moment"
                        title="Back to a single moment"
                        onClick={() => setRange((prev) => (prev ? { ...prev, outMs: null } : prev))}
                        className="-mr-0.5 rounded-sm p-0.5 text-primary/70 transition-colors hover:text-primary"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </span>
                  {drawing.shapes.length > 0
                    ? `${drawing.shapes.length} mark${drawing.shapes.length === 1 ? '' : 's'}`
                    : 'Draw on the frame'}
                </span>
              }
              onSubmit={(body, extras) => {
                const annotation: TimeAnnotation = {
                  kind: 'time',
                  timeMs: draftInMs,
                  ...(draftOutMs === null ? {} : { endMs: draftOutMs }),
                  ...(drawing.shapes.length > 0 ? { shapes: drawing.shapes } : {}),
                };
                onPostAtTime({
                  body,
                  timeMs: draftInMs,
                  endMs: draftOutMs,
                  box: null,
                  annotation,
                  extras,
                });
                clearDraft();
              }}
              onCancel={clearDraft}
            />
          </div>
        )}
      </div>
    </div>
  );
}
