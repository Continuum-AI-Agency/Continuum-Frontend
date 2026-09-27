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

import type { CommentAttachment, DrawingShape, TimeAnnotation } from '@continuum/contracts';
import { ImageOff, MessageSquarePlus, Pause, Play, SquareDashedBottom, X } from 'lucide-react';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  type FrameRate,
  frameAtMs,
  framesPerSecond,
  msForFrame,
} from '@/lib/library/commentExport';
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
};

// Stepping still works on a file whose container cannot be read; it just says
// it is guessing.
const NOMINAL_RATE: FrameRate = { num: 30, den: 1 };
const SHUTTLE_SPEEDS = [1, 2, 4] as const;

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

  const stopShuttle = useCallback(() => {
    reversingRef.current = false;
    setShuttle(null);
    const video = videoRef.current;
    if (video) video.playbackRate = 1;
  }, []);

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
    >
      <div ref={containerRef} className="relative min-h-0 flex-1 select-none">
        {/* biome-ignore lint/a11y/useMediaCaption: user-uploaded creative under review; no caption track exists */}
        <video
          ref={videoRef}
          src={src}
          playsInline
          preload="metadata"
          className="absolute inset-0 size-full object-contain"
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            setDurationMs(Math.floor(el.duration * 1000));
            setNaturalSize({ width: el.videoWidth, height: el.videoHeight });
          }}
          onTimeUpdate={(e) => {
            if (shuttle?.direction === -1) return;
            publishTime(msFromSeconds(e.currentTarget.currentTime, measuredRate));
          }}
          onSeeked={(e) => publishTime(msFromSeconds(e.currentTarget.currentTime, measuredRate))}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={stopShuttle}
          onError={() => setMediaError(true)}
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

          <div ref={laneRef} className="relative min-w-0 flex-1 pt-4">
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
