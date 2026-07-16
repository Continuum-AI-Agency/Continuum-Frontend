'use client';

// Video stage for the public share page: a transport (play/pause, timecodes,
// seek bar) with the brand's open comments riding above the scrubber as
// read-only markers — a point comment is a chip at its moment, a range comment
// a bar spanning [timeMs, endMs]. Clicking a marker seeks and highlights it.
//
// Read-only by construction: this component takes no callbacks that could
// mutate a comment, and the share page renders no composer. An external
// reviewer can watch and locate feedback, never author it.
//
// The marker lane itself is the same component the authenticated player uses,
// so a comment looks and behaves identically wherever a video is reviewed.

import { Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatTimecode } from '@/components/library/detail/annotationGeometry';
import {
  TimelineMarkerStrip,
  type TimeMarker,
} from '@/components/library/detail/TimelineMarkerStrip';
import { Button } from '@/components/ui/button';

export type ShareTimeMarker = TimeMarker;

type Props = {
  src: string;
  posterUrl: string | null;
  label: string;
  durationMsHint: number | null;
  markers: ShareTimeMarker[];
};

export function ShareVideoPlayer({ src, posterUrl, label, durationMsHint, markers }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(durationMsHint ?? 0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

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

  return (
    <div className="flex flex-col rounded-lg border border-border bg-black">
      {/* biome-ignore lint/a11y/useMediaCaption: shared creative under review; no caption track exists */}
      <video
        ref={videoRef}
        src={src}
        poster={posterUrl ?? undefined}
        aria-label={label}
        playsInline
        preload="metadata"
        className="max-h-[70vh] w-full rounded-t-lg object-contain"
        onLoadedMetadata={(event) => setDurationMs(Math.floor(event.currentTarget.duration * 1000))}
        onTimeUpdate={(event) => setCurrentMs(Math.floor(event.currentTarget.currentTime * 1000))}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

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
