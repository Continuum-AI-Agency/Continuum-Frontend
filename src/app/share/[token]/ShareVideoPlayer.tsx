'use client';

// Video stage for the public share page: a transport (play/pause, timecodes,
// seek bar) with the brand's open comments riding above the scrubber as
// read-only markers — a point comment is a chip at its moment, a range comment
// a bar spanning [timeMs, endMs]. Clicking a marker seeks and highlights it.
//
// It mutates nothing itself. When guests may comment it publishes the playhead
// and an I/O range (keys I and O, or the buttons) to sharePlayhead, which the
// guest composer pins its comment to; the selected comment's saved marks are
// drawn on the frame with the Library's own ShapeLayer.
//
// The marker lane itself is the same component the authenticated player uses,
// so a comment looks and behaves identically wherever a video is reviewed.

import type { DrawingShape } from '@continuum/contracts';
import { Pause, Play, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StaticMarks } from '@/components/library/detail/annotation/StaticMarks';
import { formatTimecode } from '@/components/library/detail/annotationGeometry';
import {
  TimelineMarkerStrip,
  type TimeMarker,
} from '@/components/library/detail/TimelineMarkerStrip';
import { Button } from '@/components/ui/button';
import { publishSharePlayhead } from './sharePlayhead';

export type ShareTimeMarker = TimeMarker & { shapes?: DrawingShape[] };

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

type Props = {
  src: string;
  posterUrl: string | null;
  label: string;
  durationMsHint: number | null;
  markers: ShareTimeMarker[];
  initialSelectedId?: string | null;
  initialTimeMs?: number | null;
  // Protected link: no picture-in-picture (it would lift the video off the watermark).
  protect?: boolean;
  /** Set when guests may comment: the playhead and I/O range feed the guest composer. */
  pinForAssetId?: string | null;
};

export function ShareVideoPlayer({
  src,
  posterUrl,
  label,
  durationMsHint,
  markers,
  initialSelectedId = null,
  initialTimeMs = null,
  protect = false,
  pinForAssetId = null,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(durationMsHint ?? 0);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [hydrated, setHydrated] = useState(false);
  const [inMs, setInMs] = useState<number | null>(null);
  const [outMs, setOutMs] = useState<number | null>(null);

  const playheadMs = useCallback(
    () => Math.floor((videoRef.current?.currentTime ?? currentMs / 1000) * 1000),
    [currentMs],
  );
  const markIn = useCallback(() => {
    const at = playheadMs();
    setInMs(at);
    setOutMs((out) => (out !== null && out > at ? out : null));
  }, [playheadMs]);
  // The contract requires endMs > timeMs: an out-point at or before the in-point
  // is not a range and is ignored.
  const markOut = useCallback(() => {
    const at = playheadMs();
    if (inMs !== null && at > inMs) setOutMs(at);
  }, [playheadMs, inMs]);

  useEffect(() => {
    if (pinForAssetId) publishSharePlayhead(pinForAssetId, { timeMs: currentMs, inMs, outMs });
  }, [pinForAssetId, currentMs, inMs, outMs]);

  useEffect(() => {
    if (!pinForAssetId) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'i' || event.key === 'I') markIn();
      else if (event.key === 'o' || event.key === 'O') markOut();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinForAssetId, markIn, markOut]);

  const seekTo = useCallback((ms: number) => {
    const video = videoRef.current;
    if (video) {
      const seconds = ms / 1000;
      video.currentTime = seconds;

      // With preload="metadata", Chromium can accept a seek while it only has
      // HAVE_METADATA and then snap the playhead back to zero as the first media
      // range arrives. Re-apply that same seek once frame data is available so
      // a public review marker always lands on the commented frame.
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        video.addEventListener(
          'loadeddata',
          () => {
            video.currentTime = seconds;
          },
          { once: true },
        );
      }
    }
    setCurrentMs(ms);
  }, []);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (initialSelectedId) return;
    if (initialTimeMs == null) return;
    seekTo(initialTimeMs);
  }, [initialSelectedId, initialTimeMs, seekTo]);

  const selectMarker = (marker: ShareTimeMarker) => {
    videoRef.current?.pause();
    setSelectedId(marker.id);
  };

  // Marker selection changes the controlled scrubber and its selected styling
  // in one commit. Seek after that commit so the old scrubber value cannot win
  // the race and snap the public-review playhead back to zero.
  useEffect(() => {
    if (!selectedId) return;
    const marker = markers.find((candidate) => candidate.id === selectedId);
    if (marker) seekTo(marker.timeMs);
  }, [markers, seekTo, selectedId]);

  const selectedShapes = markers.find((marker) => marker.id === selectedId)?.shapes ?? [];

  return (
    <div className="flex flex-col rounded-lg border border-border bg-black">
      <div className="relative">
        {/* biome-ignore lint/a11y/useMediaCaption: shared creative under review; no caption track exists */}
        <video
          ref={videoRef}
          src={src}
          poster={posterUrl ?? undefined}
          aria-label={label}
          playsInline
          disablePictureInPicture={protect}
          // The same guard as the page's native players (SharePayloadView videoGuard):
          // a protected link's media never leaves the watermarked frame.
          controlsList={protect ? 'nodownload nofullscreen noremoteplayback' : undefined}
          preload="metadata"
          className="max-h-[70vh] w-full rounded-t-lg object-contain"
          onLoadedMetadata={(event) =>
            setDurationMs(Math.floor(event.currentTarget.duration * 1000))
          }
          onTimeUpdate={(event) => setCurrentMs(Math.floor(event.currentTarget.currentTime * 1000))}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
        {selectedId && selectedShapes.length > 0 ? (
          <StaticMarks
            key={selectedId}
            marks={[{ id: selectedId, annotation: { kind: 'shapes', shapes: selectedShapes } }]}
            numbered={false}
            mediaSelector="video"
          />
        ) : null}
      </div>

      <div className="flex items-center gap-3 rounded-b-lg border-t border-border bg-background px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={playing ? 'Pause' : 'Play'}
          disabled={!hydrated}
          onClick={() => (playing ? videoRef.current?.pause() : void videoRef.current?.play())}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>

        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatTimecode(currentMs)} / {formatTimecode(durationMs)}
        </span>

        {pinForAssetId ? (
          <div className="flex shrink-0 items-center gap-1" data-share-pin-range="">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-1.5 text-2xs"
              disabled={!hydrated}
              title="Mark the start of a range (I)"
              onClick={markIn}
            >
              In{inMs !== null ? ` ${formatTimecode(inMs)}` : ''}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-1.5 text-2xs"
              disabled={!hydrated || inMs === null}
              title="Mark the end of the range (O)"
              onClick={markOut}
            >
              Out{outMs !== null ? ` ${formatTimecode(outMs)}` : ''}
            </Button>
            {inMs !== null ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label="Clear the range"
                onClick={() => {
                  setInMs(null);
                  setOutMs(null);
                }}
              >
                <X className="size-3" />
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="relative min-w-0 flex-1 pt-4">
          <TimelineMarkerStrip
            markers={markers}
            durationMs={durationMs}
            selectedId={selectedId}
            onSelect={selectMarker}
            readOnly={!hydrated}
          />
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={Math.max(durationMs, 1)}
            step={100}
            value={Math.min(currentMs, durationMs || currentMs)}
            disabled={!hydrated}
            onChange={(event) => seekTo(Number(event.target.value))}
            className="h-1.5 w-full cursor-pointer accent-primary"
          />
        </div>
      </div>
    </div>
  );
}
