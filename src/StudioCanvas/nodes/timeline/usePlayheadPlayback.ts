import { useCallback, useEffect, useRef, useState } from 'react';
import { clipAtTime, type TimelineLayout } from './useTimelineEditorModel';

// Drives the WYSIWYG sequence preview for the Video Editor. The timeline is a
// single concatenated track, so the preview plays clips end-to-end: a video clip
// plays natively (smooth, its own clock), an image still holds for its duration
// on a wall-clock tick, and the global playhead is the source of truth shared
// with the timeline scrubber. This mirrors what composeTimeline renders, with
// DOM playback standing in for the final mediabunny encode.

export interface ClipMedia {
  kind: 'video' | 'image';
  url?: string;
  trimStartSec: number;
}

export interface PlayheadPlayback {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playheadSec: number;
  isPlaying: boolean;
  seek: (sec: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
}

const SNAP_EPSILON = 0.02;

export function usePlayheadPlayback(params: {
  layout: TimelineLayout;
  mediaFor: (itemId: string) => ClipMedia | undefined;
}): PlayheadPlayback {
  const { layout, mediaFor } = params;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playheadSec, setPlayheadSecState] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const playheadRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const totalSec = layout.totalSec;

  const setPlayhead = useCallback((sec: number) => {
    const clamped = Math.max(0, Math.min(sec, totalSec));
    playheadRef.current = clamped;
    setPlayheadSecState(clamped);
  }, [totalSec]);

  const ensureVideoSrc = useCallback((video: HTMLVideoElement, url: string) => {
    if (video.getAttribute('data-clip-src') !== url) {
      video.src = url;
      video.setAttribute('data-clip-src', url);
    }
  }, []);

  // Seek (scrub): reflect a global time on the media without playing.
  const seek = useCallback((sec: number) => {
    setPlayhead(sec);
    const clip = clipAtTime(layout, sec);
    const video = videoRef.current;
    if (!clip || !video) return;
    const media = mediaFor(clip.item.id);
    if (media?.kind === 'video' && media.url) {
      ensureVideoSrc(video, media.url);
      const local = Math.max(0, sec - clip.startSec);
      try {
        video.currentTime = media.trimStartSec + local;
      } catch {
        // currentTime may throw before metadata loads; ignored — re-applied on tick.
      }
    }
  }, [ensureVideoSrc, layout, mediaFor, setPlayhead]);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTsRef.current = null;
    setIsPlaying(false);
    videoRef.current?.pause();
  }, []);

  const tick = useCallback((ts: number) => {
    const last = lastTsRef.current ?? ts;
    const dt = (ts - last) / 1000;
    lastTsRef.current = ts;

    let next = playheadRef.current;
    const clip = clipAtTime(layout, next);
    const video = videoRef.current;

    if (clip && video) {
      const media = mediaFor(clip.item.id);
      if (media?.kind === 'video' && media.url) {
        ensureVideoSrc(video, media.url);
        if (video.paused) void video.play().catch(() => undefined);
        const clipEnd = media.trimStartSec + clip.durationSec;
        if (video.currentTime >= clipEnd - SNAP_EPSILON) {
          next = clip.startSec + clip.durationSec;
        } else {
          next = clip.startSec + Math.max(0, video.currentTime - media.trimStartSec);
        }
      } else {
        if (!video.paused) video.pause();
        next += dt;
      }
    } else {
      next += dt;
    }

    if (next >= totalSec) {
      setPlayhead(totalSec);
      stop();
      return;
    }
    setPlayhead(next);
    rafRef.current = requestAnimationFrame(tick);
  }, [ensureVideoSrc, layout, mediaFor, setPlayhead, stop, totalSec]);

  const play = useCallback(() => {
    if (totalSec <= 0) return;
    if (playheadRef.current >= totalSec - SNAP_EPSILON) setPlayhead(0);
    lastTsRef.current = null;
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [setPlayhead, tick, totalSec]);

  const pause = useCallback(() => stop(), [stop]);
  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play]);

  // Stop playback if the timeline empties or shrinks past the playhead.
  useEffect(() => {
    if (playheadRef.current > totalSec) setPlayhead(totalSec);
  }, [setPlayhead, totalSec]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  return { videoRef, playheadSec, isPlaying, seek, play, pause, toggle };
}
