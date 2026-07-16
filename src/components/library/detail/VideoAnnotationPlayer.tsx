'use client';

// Video stage with Air-style time-pinned comments: custom transport (play/
// pause, timecodes, seek bar), comment markers riding above the scrubber at
// their timeMs, and a "comment at current time" flow that pins the timestamp
// and optionally a box drawn on the paused frame. A draft can be upgraded from
// a moment to a SPAN by setting an out-point while it is open (Frame.io-style
// range comments), which is what the reviewer reaches for when the note is
// about a passage rather than a frame.

import { ImageOff, MessageSquarePlus, Pause, Play, SquareDashedBottom, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AnnotationOverlay, type OverlayPin } from './AnnotationOverlay';
import { formatTimecode, formatTimecodeRange, type NormalizedBox } from './annotationGeometry';
import { CommentComposer } from './CommentComposer';
import { TimelineMarkerStrip, type TimeMarker } from './TimelineMarkerStrip';
import { useStageGeometry } from './useStageGeometry';

// The lane marker plus what only the annotating stage needs: the region drawn
// on the frame, and a selection the sidebar and the stage share.
export type VideoTimeMarker = TimeMarker & {
  box: NormalizedBox | null;
  selected: boolean;
};

export type PostAtTimeInput = {
  body: string;
  timeMs: number;
  endMs: number | null;
  box: NormalizedBox | null;
};

type Props = {
  src: string | null;
  durationMsHint: number | null;
  markers: VideoTimeMarker[];
  onSelectMarker: (id: string | null) => void;
  posting: boolean;
  onPostAtTime: (input: PostAtTimeInput) => void;
  /** Receives a seek function so the sidebar can jump the player to a thread's timestamp. */
  registerSeek: (seek: (ms: number) => void) => void;
  /** Playhead position, for followers (the transcript panel) that coalesce it themselves. */
  onTimeChange?: (timeMs: number) => void;
};

export function VideoAnnotationPlayer({
  src,
  durationMsHint,
  markers,
  onSelectMarker,
  posting,
  onPostAtTime,
  registerSeek,
  onTimeChange,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { containerRef, containerSize, contentRect, setNaturalSize } = useStageGeometry();
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(durationMsHint ?? 0);
  const [draftTimeMs, setDraftTimeMs] = useState<number | null>(null);
  const [draftEndMs, setDraftEndMs] = useState<number | null>(null);
  const [draftBox, setDraftBox] = useState<NormalizedBox | null>(null);
  const [mediaError, setMediaError] = useState(false);

  const seekTo = useCallback(
    (ms: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = ms / 1000;
      setCurrentMs(ms);
      onTimeChange?.(ms);
    },
    [onTimeChange],
  );

  useEffect(() => {
    registerSeek(seekTo);
  }, [registerSeek, seekTo]);

  // The live element time, not the throttled `currentMs` state: an out-point set
  // during playback must land on the frame the reviewer actually saw.
  const playheadMs = () =>
    Math.floor(videoRef.current ? videoRef.current.currentTime * 1000 : currentMs);

  const clearDraft = () => {
    setDraftTimeMs(null);
    setDraftEndMs(null);
    setDraftBox(null);
  };

  const startDraftAtCurrentTime = () => {
    videoRef.current?.pause();
    setDraftTimeMs(playheadMs());
    setDraftEndMs(null);
  };

  // Upgrade the open draft to a span, or move an out-point already set. The
  // contract requires endMs > timeMs, so a playhead at or behind the in-point
  // is not a range and is ignored.
  const setDraftOutPoint = () => {
    if (draftTimeMs === null) return;
    const end = playheadMs();
    if (end <= draftTimeMs) return;
    setDraftEndMs(end);
  };

  // The selected thread's box (if any) outlines on the frame; a draft in
  // progress enables drawing on the paused frame.
  const overlayPins: OverlayPin[] = markers
    .filter((m) => m.selected && m.box)
    .map((m) => ({
      id: m.id,
      annotation: { kind: 'box' as const, ...(m.box as NormalizedBox) },
      label: m.initials,
      title: m.title,
      selected: true,
    }));

  if (!src) {
    return (
      <div className="flex size-full items-center justify-center text-muted-foreground">
        <ImageOff className="size-8 text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <div className="flex size-full flex-col">
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
            const ms = Math.floor(e.currentTarget.currentTime * 1000);
            setCurrentMs(ms);
            onTimeChange?.(ms);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
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
          drawEnabled={draftTimeMs !== null && !playing}
          tool="box"
          draftAnnotation={draftBox ? { kind: 'box', ...draftBox } : null}
          onDraftAnnotation={(annotation) =>
            setDraftBox(annotation?.kind === 'box' ? annotation : null)
          }
        />
      </div>

      <div className="shrink-0 border-t border-border bg-background px-3 py-2">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => (playing ? videoRef.current?.pause() : void videoRef.current?.play())}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>

          <span className="text-xs tabular-nums text-muted-foreground">
            {formatTimecode(currentMs)} / {formatTimecode(durationMs)}
          </span>

          <div className="relative min-w-0 flex-1 pt-4">
            <TimelineMarkerStrip
              markers={markers}
              durationMs={durationMs}
              onSelect={(marker) => {
                seekTo(marker.timeMs);
                videoRef.current?.pause();
                onSelectMarker(marker.id);
              }}
            />
            <input
              type="range"
              aria-label="Seek"
              min={0}
              max={Math.max(durationMs, 1)}
              step={100}
              value={Math.min(currentMs, durationMs || currentMs)}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer accent-primary"
            />
          </div>

          {draftTimeMs === null ? (
            <Button type="button" variant="outline" size="sm" onClick={startDraftAtCurrentTime}>
              <MessageSquarePlus className="size-3.5" />
              Comment at {formatTimecode(currentMs)}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={setDraftOutPoint}
              disabled={currentMs <= draftTimeMs}
              title="Extend this comment into a range ending at the playhead"
            >
              <SquareDashedBottom className="size-3.5" />
              End at {formatTimecode(currentMs)}
            </Button>
          )}
        </div>

        {draftTimeMs !== null && (
          <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2.5">
            <CommentComposer
              placeholder={
                draftEndMs === null ? 'Comment at this moment...' : 'Comment on this passage...'
              }
              busy={posting}
              autoFocus
              annotationChip={
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 font-medium tabular-nums text-primary">
                    {formatTimecodeRange(draftTimeMs, draftEndMs)}
                    {draftEndMs !== null && (
                      <button
                        type="button"
                        aria-label="Clear the end point and comment on a single moment"
                        title="Back to a single moment"
                        onClick={() => setDraftEndMs(null)}
                        className="-mr-0.5 rounded-sm p-0.5 text-primary/70 transition-colors hover:text-primary"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </span>
                  {draftBox ? 'Region attached' : 'Drag on the frame to mark a region'}
                </span>
              }
              onSubmit={(body) => {
                onPostAtTime({ body, timeMs: draftTimeMs, endMs: draftEndMs, box: draftBox });
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
