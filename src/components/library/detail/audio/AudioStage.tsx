'use client';

// Stage for audio assets, reviewed the way a video is: the browser's own <audio>
// player under a waveform decoded in the browser (Mediabunny), with the comment
// lane riding above it — a chip for a moment, a span bar for a range — and the
// editor's keys:
//   Space play/pause · I/O mark a range · C comment (on the range, or the
//   playhead) · Esc clears the range.
// Clicking the waveform seeks; clicking a marker seeks to it and selects its thread.
//
// The composer is the host's (renderComposer): the Library posts a member comment,
// the public share page publishes the playhead (onPlayhead) to its guest form.
// The transcript follows the same playhead through onTimeChange and seeks it
// through registerSeek, exactly as it does for video.

import { AudioLines, MessageSquarePlus, SquareDashedBottom, X } from 'lucide-react';
import { type MouseEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatTimecode, formatTimecodeRange, seekFraction } from '../annotationGeometry';
import { TimelineMarkerStrip, type TimeMarker } from '../TimelineMarkerStrip';
import { useWaveform } from './useWaveform';

export type AudioDraft = { timeMs: number; endMs: number | null; clear: () => void };
export type AudioPlayhead = { timeMs: number; inMs: number | null; outMs: number | null };

type Range = { inMs: number; outMs: number | null };

type Props = {
  src: string | null;
  label: string;
  registerSeek?: (seek: (ms: number) => void) => void;
  onTimeChange?: (timeMs: number) => void;
  markers?: TimeMarker[];
  onSelectMarker?: (id: string | null) => void;
  /** The playhead and any I/O range, for a host whose composer lives elsewhere. */
  onPlayhead?: (playhead: AudioPlayhead) => void;
  /** The composer for an open draft; without it the stage offers no Comment button. */
  renderComposer?: (draft: AudioDraft) => ReactNode;
  /** 'always' for a stage that owns the page; 'hover' where several players share one. */
  hotkeys?: 'always' | 'hover';
};

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function AudioStage({
  src,
  label,
  registerSeek,
  onTimeChange,
  markers = [],
  onSelectMarker,
  onPlayhead,
  renderComposer,
  hotkeys = 'hover',
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef(false);
  // The first URL is kept: a refreshed asset arrives with a re-signed URL for the same
  // bytes, and swapping it in would reload the player and drop the playhead. Different
  // bytes remount the stage through its key.
  const [playSrc, setPlaySrc] = useState(src);
  useEffect(() => {
    if (!playSrc && src) setPlaySrc(src);
  }, [playSrc, src]);
  const { canvasRef, peakCount, failed } = useWaveform(playSrc);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [range, setRange] = useState<Range | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [pointMs, setPointMs] = useState<number | null>(null);

  const seekTo = useCallback((ms: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = ms / 1000;
    setCurrentMs(ms);
  }, []);

  useEffect(() => {
    registerSeek?.(seekTo);
  }, [registerSeek, seekTo]);

  useEffect(() => {
    onPlayhead?.({ timeMs: currentMs, inMs: range?.inMs ?? null, outMs: range?.outMs ?? null });
  }, [onPlayhead, currentMs, range]);

  const playheadMs = useCallback(
    () => Math.floor((audioRef.current?.currentTime ?? currentMs / 1000) * 1000),
    [currentMs],
  );

  const followPlayhead = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const ms = Math.floor(audio.currentTime * 1000);
    setCurrentMs(ms);
    onTimeChange?.(ms);
  };

  const markIn = useCallback(() => {
    const at = playheadMs();
    setRange((prev) => ({ inMs: at, outMs: prev?.outMs && prev.outMs > at ? prev.outMs : null }));
  }, [playheadMs]);

  // The contract requires endMs > timeMs: an out-point at or before the in-point
  // is not a range and is ignored.
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
  }, []);

  const openComposer = useCallback(() => {
    audioRef.current?.pause();
    setPointMs(range?.inMs ?? playheadMs());
    setComposerOpen(true);
  }, [range, playheadMs]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const focusedHere = rootRef.current?.contains(document.activeElement) ?? false;
      // :hover also covers a stage that mounted under a still pointer (no pointerenter yet).
      const hovered = hoveredRef.current || (rootRef.current?.matches(':hover') ?? false);
      if (hotkeys === 'hover' && !hovered && !focusedHere) return;
      const audio = audioRef.current;
      if (!audio) return;
      const handled = (() => {
        switch (event.key) {
          case ' ':
            if (event.target instanceof HTMLButtonElement || event.target === audio) return false;
            if (audio.paused) void audio.play();
            else audio.pause();
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
            if (!renderComposer || composerOpen) return false;
            openComposer();
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
  }, [hotkeys, markIn, markOut, openComposer, composerOpen, range, renderComposer]);

  const seekFromWaveform = (event: MouseEvent<HTMLButtonElement>) => {
    const audio = audioRef.current;
    if (!audio || !(audio.duration > 0)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = fraction * audio.duration;
    followPlayhead();
  };

  if (!playSrc) {
    return (
      <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
        This audio file has no playable URL.
      </div>
    );
  }

  const progress = durationMs > 0 ? Math.min(1, currentMs / durationMs) : 0;
  const draftInMs = range?.inMs ?? pointMs;
  const draftOutMs = range?.outMs ?? null;
  const rangeLeft = range && durationMs > 0 ? seekFraction(range.inMs, durationMs) : 0;
  const rangeRight =
    range?.outMs != null && durationMs > 0 ? seekFraction(range.outMs, durationMs) : rangeLeft;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover scopes the hotkeys on a page of players
    <div
      ref={rootRef}
      data-testid="audio-stage"
      data-current-ms={currentMs}
      data-duration-ms={durationMs}
      data-range-in={range?.inMs ?? ''}
      data-range-out={range?.outMs ?? ''}
      className="flex size-full flex-col items-center justify-center gap-3 p-8"
      onPointerEnter={() => {
        hoveredRef.current = true;
      }}
      onPointerLeave={() => {
        hoveredRef.current = false;
      }}
    >
      <p className="flex max-w-full items-center gap-2 truncate text-sm font-medium">
        <AudioLines className="size-4 shrink-0 text-muted-foreground" />
        {label}
      </p>
      <div className="relative w-full max-w-3xl pt-6">
        <div className="absolute inset-x-0 top-0 h-5">
          <TimelineMarkerStrip
            markers={markers}
            durationMs={durationMs}
            onSelect={(marker) => {
              audioRef.current?.pause();
              seekTo(marker.timeMs);
              onSelectMarker?.(marker.id);
            }}
          />
        </div>
        <button
          type="button"
          aria-label="Seek in waveform"
          onClick={seekFromWaveform}
          className="relative block h-32 w-full rounded-md bg-background/60 text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <canvas
            ref={canvasRef}
            data-testid="audio-waveform"
            data-peaks={peakCount ?? undefined}
            className="size-full"
          />
          {range && durationMs > 0 ? (
            <span
              data-testid="audio-range-selection"
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 bg-amber-400/25 ring-1 ring-amber-500/60"
              style={{
                left: `${rangeLeft * 100}%`,
                width: `${Math.max(0.002, rangeRight - rangeLeft) * 100}%`,
              }}
            />
          ) : null}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-px bg-primary"
            style={{ left: `${progress * 100}%` }}
          />
        </button>
      </div>
      {failed ? (
        <p className="text-xs text-muted-foreground">Waveform unavailable for this file.</p>
      ) : null}
      {/* biome-ignore lint/a11y/useMediaCaption: the transcript panel is this audio's text track */}
      <audio
        ref={audioRef}
        data-testid="audio-player"
        src={playSrc}
        controls
        preload="metadata"
        className="w-full max-w-3xl"
        onLoadedMetadata={(event) => {
          const seconds = event.currentTarget.duration;
          if (Number.isFinite(seconds)) setDurationMs(Math.floor(seconds * 1000));
        }}
        onDurationChange={(event) => {
          const seconds = event.currentTarget.duration;
          if (Number.isFinite(seconds)) setDurationMs(Math.floor(seconds * 1000));
        }}
        onTimeUpdate={followPlayhead}
        onSeeked={followPlayhead}
      />
      <div className="flex w-full max-w-3xl flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={markIn} title="Mark in (I)">
          In
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={markOut}
          title="Mark out (O)"
          disabled={(range?.inMs ?? pointMs) === null}
        >
          <SquareDashedBottom className="size-3.5" />
          Out
        </Button>
        {range ? (
          <span className="flex items-center gap-1 rounded bg-amber-400/15 px-1.5 py-0.5 text-xs tabular-nums text-amber-700 dark:text-amber-300">
            {formatTimecodeRange(range.inMs, range.outMs)}
            <button
              type="button"
              aria-label="Clear the range"
              onClick={() => setRange(null)}
              className="rounded-sm p-0.5 hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ) : null}
        {renderComposer && !composerOpen ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto"
            data-testid="audio-comment"
            onClick={openComposer}
            title="Comment (C) — mark a range first with I and O"
          >
            <MessageSquarePlus className="size-3.5" />
            {range
              ? `Comment on ${formatTimecodeRange(range.inMs, range.outMs)}`
              : `Comment at ${formatTimecode(currentMs)}`}
          </Button>
        ) : null}
      </div>
      {renderComposer && composerOpen && draftInMs !== null ? (
        <div className="w-full max-w-3xl rounded-lg border border-border bg-muted/30 p-2.5">
          {renderComposer({ timeMs: draftInMs, endMs: draftOutMs, clear: clearDraft })}
        </div>
      ) : null}
    </div>
  );
}
