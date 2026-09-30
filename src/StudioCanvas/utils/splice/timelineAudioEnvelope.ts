import type { EditorKeyframe, NumericKeyframe } from '@continuum/contracts';

export interface TimelineAudioEnvelopeInput {
  gain?: number;
  manualFadeInSec?: number;
  manualFadeOutSec?: number;
  transitionFadeInSec?: number;
  transitionFadeOutSec?: number;
}

export interface TimelineAudioEnvelope {
  gain: number;
  fadeInSec: number;
  fadeOutSec: number;
}

/**
 * Canonical audio-envelope projection shared by interactive preview and export.
 * Transition fades and author-authored fades are not additive: the longer ramp
 * wins, matching the render mixer's behaviour.
 */
export function resolveTimelineAudioEnvelope(
  input: TimelineAudioEnvelopeInput,
): TimelineAudioEnvelope {
  return {
    gain:
      typeof input.gain === 'number' && Number.isFinite(input.gain) ? Math.max(0, input.gain) : 1,
    fadeInSec: Math.max(0, input.manualFadeInSec ?? 0, input.transitionFadeInSec ?? 0),
    fadeOutSec: Math.max(0, input.manualFadeOutSec ?? 0, input.transitionFadeOutSec ?? 0),
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
            ...(keyframe.easing ? { easing: keyframe.easing } : {}),
            ...(keyframe.spring ? { spring: { bounce: keyframe.spring.bounce } } : {}),
          },
        ]
      : [],
  );
}
