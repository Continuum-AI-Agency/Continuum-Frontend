import { useCallback, useEffect, useRef, useState } from 'react';
import type { TimelineAudioPreviewController } from './useTimelineAudioPreview';
import { clipAtTime, type TimelineLayout } from './useTimelineEditorModel';

// Drives the WYSIWYG sequence preview for the Video Editor. The timeline is a
// single concatenated track, so the preview plays clips end-to-end: a video clip
// plays natively (smooth, its own clock), an image still holds for its duration
// on a wall-clock tick, and the global playhead is the source of truth shared
// with the timeline scrubber. This mirrors what composeTimeline renders, with
// DOM playback standing in for the final mediabunny encode.
//
// One <video> element serves every clip, so crossing a clip boundary means
// re-pointing that element at another source and another source-time. That
// hand-off is the whole difficulty: the element's clock is only meaningful once
// it has actually landed on the cue point, so the driver tracks the cue it issued
// and runs the playhead on wall-clock until the element catches up.

export interface ClipMedia {
  kind: 'video' | 'image';
  url?: string;
  trimStartSec: number;
  /** Playback rate for the clip; 1 when unset. */
  speed?: number;
}

const clipSpeed = (media: ClipMedia): number => (media.speed && media.speed > 0 ? media.speed : 1);

/** The subset of HTMLVideoElement the playhead driver touches, so it can be faked in tests. */
export interface PlaybackVideoElement {
  src: string;
  currentTime: number;
  playbackRate: number;
  readonly paused: boolean;
  readonly seeking: boolean;
  readonly ended: boolean;
  readonly readyState: number;
  play(): Promise<void>;
  pause(): void;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

/** The clip the shared <video> element is currently pointed at, and where. */
export interface PlaybackCue {
  clipId: string;
  /** Source-time the element was seeked to; its clock is untrustworthy until it lands here. */
  sourceSec: number;
  pending: boolean;
}

export interface PlayheadFrame {
  playheadSec: number;
  cue: PlaybackCue | null;
}

export interface PlayheadPlayback {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playheadSec: number;
  isPlaying: boolean;
  isPreparing: boolean;
  seek: (sec: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
}

const SNAP_EPSILON = 0.02;
const HAVE_METADATA = 1;
const HAVE_CURRENT_DATA = 2;
const VIDEO_DRIFT_TOLERANCE_SEC = 0.08;

// The element's clock runs in source time, so a wall-clock tolerance has to be
// scaled by the clip's speed: at 3.5x one animation frame consumes ~58ms of
// source, and an unscaled 20ms window is narrower than a single sample.
const endToleranceFor = (speed: number): number => SNAP_EPSILON * speed;

const ensureVideoSrc = (video: PlaybackVideoElement, url: string): boolean => {
  if (video.getAttribute('data-clip-src') === url) return false;
  video.src = url;
  video.setAttribute('data-clip-src', url);
  return true;
};

const seekVideo = (video: PlaybackVideoElement, sourceSec: number): void => {
  try {
    video.currentTime = sourceSec;
  } catch {
    // Before metadata, currentTime may throw; the cue stays pending and is re-applied.
  }
};

// Point the shared element at a clip's source and source-time. Cueing is keyed on
// clip identity, not on the URL: a split or a duplicate places two clips on one
// source, and the second still needs its own seek.
export function cueVideoToClip(
  video: PlaybackVideoElement,
  media: ClipMedia,
  clipId: string,
  localSec: number,
): PlaybackCue | null {
  if (media.kind !== 'video' || !media.url) return null;

  const speed = clipSpeed(media);
  const sourceSec = media.trimStartSec + Math.max(0, localSec) * speed;
  const swapped = ensureVideoSrc(video, media.url);
  video.playbackRate = speed;

  // A src swap resets the element to 0 at HAVE_NOTHING. Otherwise the element may
  // already sit on the frame we want (the far side of a split), and re-seeking it
  // would only stutter the hand-off.
  if (!swapped && Math.abs(video.currentTime - sourceSec) <= SNAP_EPSILON) {
    return { clipId, sourceSec, pending: false };
  }
  seekVideo(video, sourceSec);
  return { clipId, sourceSec, pending: true };
}

// The element has reached the cue point and has a frame there, so its clock can
// drive the playhead again.
const isCueLanded = (video: PlaybackVideoElement, sourceSec: number): boolean =>
  !video.seeking &&
  video.readyState >= HAVE_CURRENT_DATA &&
  video.currentTime >= sourceSec - SNAP_EPSILON;

// A currentTime set at HAVE_NOTHING is only a default start position and some
// browsers drop it, so the seek is re-issued once metadata exists.
const reapplyPendingCue = (video: PlaybackVideoElement, sourceSec: number): void => {
  if (video.seeking || video.readyState < HAVE_METADATA) return;
  if (video.currentTime >= sourceSec - SNAP_EPSILON) return;
  seekVideo(video, sourceSec);
};

// Advance the playhead by one animation frame, driving the shared <video> element
// as it goes. Exported so the hand-off logic can be tested against a fake element.
export function advancePlayhead(params: {
  layout: TimelineLayout;
  mediaFor: (itemId: string) => ClipMedia | undefined;
  video: PlaybackVideoElement | null;
  playheadSec: number;
  dtSec: number;
  cue: PlaybackCue | null;
}): PlayheadFrame {
  const { layout, mediaFor, video, playheadSec, dtSec, cue } = params;
  const clip = clipAtTime(layout, playheadSec);
  const media = clip ? mediaFor(clip.item.id) : undefined;

  if (!clip || !video || media?.kind !== 'video' || !media.url) {
    // Stills and gaps have no element clock: hold the frame and run on wall-clock.
    if (video && !video.paused) video.pause();
    // The cue describes where the element is pointed; it is stale the moment the
    // playhead leaves a video clip, so the next video clip re-cues from scratch.
    return { playheadSec: playheadSec + dtSec, cue: null };
  }

  let nextCue = cue;
  if (!nextCue || nextCue.clipId !== clip.item.id) {
    nextCue = cueVideoToClip(video, media, clip.item.id, playheadSec - clip.startSec);
  }

  const speed = clipSpeed(media);
  if (video.playbackRate !== speed) video.playbackRate = speed;

  if (nextCue?.pending) {
    if (!isCueLanded(video, nextCue.sourceSec)) {
      reapplyPendingCue(video, nextCue.sourceSec);
      if (video.paused) void video.play().catch(() => undefined);
      // currentTime here is the old clip's, or 0 mid-load — reading it would pin the
      // playhead to the clip start until the seek lands. Wall-clock covers the gap.
      return { playheadSec: playheadSec + dtSec, cue: nextCue };
    }
    nextCue = { ...nextCue, pending: false };
  }

  // The end of the clip is settled BEFORE play(): play() on an element whose
  // playback has ended seeks it back to 0 (HTML spec), which restarts the clip and
  // drags the playhead back to the clip start — the reported loop. `ended` is
  // authoritative because a container's last frame routinely falls short of its
  // declared duration, so currentTime alone may never reach the trim-out.
  const clipEnd = media.trimStartSec + clip.durationSec * speed;
  if (video.ended || video.currentTime >= clipEnd - endToleranceFor(speed)) {
    return { playheadSec: clip.startSec + clip.durationSec, cue: nextCue };
  }

  if (video.paused) void video.play().catch(() => undefined);
  return {
    playheadSec: clip.startSec + Math.max(0, (video.currentTime - media.trimStartSec) / speed),
    cue: nextCue,
  };
}

/**
 * Drive the visual media toward an externally-owned timeline clock. Web Audio
 * uses this path: the video element renders frames, but never decides time.
 */
export function syncVideoToTimelineTime(params: {
  layout: TimelineLayout;
  mediaFor: (itemId: string) => ClipMedia | undefined;
  video: PlaybackVideoElement | null;
  timelineSec: number;
  cue: PlaybackCue | null;
}): PlaybackCue | null {
  const { layout, mediaFor, video, timelineSec, cue } = params;
  const clip = clipAtTime(layout, timelineSec);
  const media = clip ? mediaFor(clip.item.id) : undefined;
  if (!clip || !video || media?.kind !== 'video' || !media.url) {
    if (video && !video.paused) video.pause();
    return null;
  }

  const localSec = Math.max(0, timelineSec - clip.startSec);
  const desiredSourceSec = media.trimStartSec + localSec * clipSpeed(media);
  let nextCue = cue;
  if (!nextCue || nextCue.clipId !== clip.item.id) {
    nextCue = cueVideoToClip(video, media, clip.item.id, localSec);
  } else if (
    !video.seeking &&
    video.readyState >= HAVE_METADATA &&
    Math.abs(video.currentTime - desiredSourceSec) > VIDEO_DRIFT_TOLERANCE_SEC
  ) {
    seekVideo(video, desiredSourceSec);
    nextCue = { clipId: clip.item.id, sourceSec: desiredSourceSec, pending: true };
  }

  const speed = clipSpeed(media);
  if (video.playbackRate !== speed) video.playbackRate = speed;
  if (nextCue?.pending && !isCueLanded(video, nextCue.sourceSec)) {
    reapplyPendingCue(video, nextCue.sourceSec);
  } else if (nextCue?.pending) {
    nextCue = { ...nextCue, pending: false };
  }
  if (video.paused) void video.play().catch(() => undefined);
  return nextCue;
}

export function usePlayheadPlayback(params: {
  layout: TimelineLayout;
  mediaFor: (itemId: string) => ClipMedia | undefined;
  audioPreview?: TimelineAudioPreviewController;
  revisionKey?: string;
}): PlayheadPlayback {
  const { layout, mediaFor, audioPreview, revisionKey } = params;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playheadSec, setPlayheadSecState] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);

  const playheadRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const cueRef = useRef<PlaybackCue | null>(null);
  const playRequestRef = useRef(0);
  const totalSec = layout.totalSec;

  // The animation loop re-schedules itself, so a callback that closed over the
  // layout would keep running against the geometry captured at play() — trimming or
  // changing a clip's speed mid-playback would advance the playhead against stale
  // durations. The loop reads the live layout through refs instead.
  const layoutRef = useRef(layout);
  const mediaForRef = useRef(mediaFor);
  const audioPreviewRef = useRef(audioPreview);
  useEffect(() => {
    layoutRef.current = layout;
    mediaForRef.current = mediaFor;
    audioPreviewRef.current = audioPreview;
  }, [audioPreview, layout, mediaFor]);

  const setPlayhead = useCallback((sec: number) => {
    const clamped = Math.max(0, Math.min(sec, layoutRef.current.totalSec));
    playheadRef.current = clamped;
    setPlayheadSecState(clamped);
  }, []);

  // Seek (scrub): reflect a global time on the media without playing.
  const seek = useCallback(
    (sec: number) => {
      setPlayhead(sec);
      const clip = clipAtTime(layoutRef.current, playheadRef.current);
      const video = videoRef.current;
      if (!clip || !video) return;
      const media = mediaForRef.current(clip.item.id);
      if (!media) return;
      cueRef.current = cueVideoToClip(
        video,
        media,
        clip.item.id,
        playheadRef.current - clip.startSec,
      );
      if (isPlaying && audioPreviewRef.current?.active) {
        void audioPreviewRef.current.play(playheadRef.current);
      }
    },
    [isPlaying, setPlayhead],
  );

  const stop = useCallback(() => {
    playRequestRef.current += 1;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTsRef.current = null;
    const audioTime = audioPreviewRef.current?.pause() ?? null;
    if (audioTime !== null) setPlayhead(audioTime);
    setIsPlaying(false);
    setIsPreparing(false);
    videoRef.current?.pause();
  }, [setPlayhead]);

  const tick = useCallback(
    (ts: number) => {
      const last = lastTsRef.current ?? ts;
      lastTsRef.current = ts;

      const audioTime = audioPreviewRef.current?.currentTimelineTime() ?? null;
      const frame =
        audioTime === null
          ? advancePlayhead({
              layout: layoutRef.current,
              mediaFor: mediaForRef.current,
              video: videoRef.current,
              playheadSec: playheadRef.current,
              dtSec: (ts - last) / 1000,
              cue: cueRef.current,
            })
          : {
              playheadSec: audioTime,
              cue: syncVideoToTimelineTime({
                layout: layoutRef.current,
                mediaFor: mediaForRef.current,
                video: videoRef.current,
                timelineSec: audioTime,
                cue: cueRef.current,
              }),
            };
      cueRef.current = frame.cue;

      if (frame.playheadSec >= layoutRef.current.totalSec) {
        setPlayhead(layoutRef.current.totalSec);
        stop();
        return;
      }
      setPlayhead(frame.playheadSec);
      rafRef.current = requestAnimationFrame(tick);
    },
    [setPlayhead, stop],
  );

  const startLoop = useCallback(() => {
    lastTsRef.current = null;
    setIsPreparing(false);
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const play = useCallback(() => {
    if (totalSec <= 0) return;
    const request = ++playRequestRef.current;
    // Replaying from the end re-cues the element: it is parked on the last clip's
    // trim-out, and without a seek the first tick would read that as an instant end.
    if (playheadRef.current >= totalSec - SNAP_EPSILON) seek(0);
    const preview = audioPreviewRef.current;
    if (!preview?.enabled) {
      startLoop();
      return;
    }
    setIsPreparing(true);
    void preview.play(playheadRef.current).then(() => {
      if (request !== playRequestRef.current) return;
      startLoop();
    });
  }, [seek, startLoop, totalSec]);

  const pause = useCallback(() => stop(), [stop]);
  const toggle = useCallback(() => {
    if (isPlaying || isPreparing) pause();
    else play();
  }, [isPlaying, isPreparing, pause, play]);

  // Stop playback if the timeline empties or shrinks past the playhead.
  useEffect(() => {
    if (playheadRef.current > totalSec) setPlayhead(totalSec);
  }, [setPlayhead, totalSec]);

  const previousRevisionRef = useRef(revisionKey);
  useEffect(() => {
    if (previousRevisionRef.current === revisionKey) return;
    previousRevisionRef.current = revisionKey;
    if (isPlaying || isPreparing) stop();
  }, [isPlaying, isPreparing, revisionKey, stop]);

  useEffect(
    () => () => {
      playRequestRef.current += 1;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  return { videoRef, playheadSec, isPlaying, isPreparing, seek, play, pause, toggle };
}
