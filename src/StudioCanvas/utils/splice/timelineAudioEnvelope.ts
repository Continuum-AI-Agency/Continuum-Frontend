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
