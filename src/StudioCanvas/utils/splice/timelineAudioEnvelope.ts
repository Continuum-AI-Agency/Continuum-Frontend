import type {
  EditorAudioFadeClock,
  EditorKeyframe,
  EditorProjectV2,
  EditorTrack,
  NumericKeyframe,
} from '@continuum/contracts';

export interface TimelineAudioEnvelopeInput {
  gain?: number;
  audioFadeClock?: EditorAudioFadeClock;
  manualFadeInSec?: number;
  manualFadeOutSec?: number;
  transitionFadeInSec?: number;
  transitionFadeOutSec?: number;
}

export interface TimelineAudioEnvelope {
  gain: number;
  audioFadeClock?: EditorAudioFadeClock;
  transitionFadeInSec?: number;
  transitionFadeOutSec?: number;
  fadeInSec: number;
  fadeOutSec: number;
}

/**
 * Canonical audio-envelope projection shared by interactive preview and export.
 * Transition fades and author-authored fades are not additive: the longer ramp
 * wins when they share an origin. Retained manual fades keep their original clock;
 * transition ramps stay on the current clip clock.
 */
export function resolveTimelineAudioEnvelope(
  input: TimelineAudioEnvelopeInput,
): TimelineAudioEnvelope {
  return {
    gain:
      typeof input.gain === 'number' && Number.isFinite(input.gain) ? Math.max(0, input.gain) : 1,
    fadeInSec: Math.max(
      0,
      input.manualFadeInSec ?? 0,
      input.audioFadeClock ? 0 : (input.transitionFadeInSec ?? 0),
    ),
    fadeOutSec: Math.max(
      0,
      input.manualFadeOutSec ?? 0,
      input.audioFadeClock ? 0 : (input.transitionFadeOutSec ?? 0),
    ),
    ...(input.audioFadeClock
      ? {
          audioFadeClock: input.audioFadeClock,
          transitionFadeInSec: Math.max(0, input.transitionFadeInSec ?? 0),
          transitionFadeOutSec: Math.max(0, input.transitionFadeOutSec ?? 0),
        }
      : {}),
  };
}

/** A clip's `audio.volume` keyframes as the numeric track the mixers sample (clip-local
 *  seconds; the value is the clip's gain at that time). */
export function volumeKeyframesOf(keyframes: readonly EditorKeyframe[]): NumericKeyframe[] {
  return keyframes.flatMap((keyframe) =>
    keyframe.property === 'audio.volume' && typeof keyframe.value === 'number'
      ? [
          {
            timeSec: keyframe.timeSec,
            value: keyframe.value,
            interpolation: keyframe.interpolation,
            ...(keyframe.expression ? { expression: keyframe.expression } : {}),
            ...(keyframe.easing ? { easing: keyframe.easing } : {}),
            ...(keyframe.spring ? { spring: { bounce: keyframe.spring.bounce } } : {}),
          },
        ]
      : [],
  );
}

/** Only the primary video and audio tracks carry sound; secondary videos are visual layers. */
export function editorAudioTracks(project: EditorProjectV2): EditorTrack[] {
  const primary = project.tracks
    .filter((track) => track.kind === 'video' && track.enabled)
    .toSorted((left, right) => left.order - right.order)[0];
  const tracks = project.tracks.filter(
    (track) =>
      track.enabled && !track.muted && (track.id === primary?.id || track.kind === 'audio'),
  );
  return tracks.some((track) => track.solo) ? tracks.filter((track) => track.solo) : tracks;
}
