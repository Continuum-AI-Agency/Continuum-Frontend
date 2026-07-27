import { describe, expect, it } from 'bun:test';
import { resolveTimelineAudioEnvelope } from './timelineAudioEnvelope';

describe('resolveTimelineAudioEnvelope', () => {
  it('uses the longer transition or manual fade on each edge', () => {
    expect(
      resolveTimelineAudioEnvelope({
        gain: 0.6,
        manualFadeInSec: 0.25,
        transitionFadeInSec: 0.8,
        manualFadeOutSec: 1.2,
        transitionFadeOutSec: 0.5,
      }),
    ).toEqual({ gain: 0.6, fadeInSec: 0.8, fadeOutSec: 1.2 });
  });

  it('clamps invalid negative authoring values', () => {
    expect(
      resolveTimelineAudioEnvelope({
        gain: -4,
        manualFadeInSec: -1,
        transitionFadeOutSec: -2,
      }),
    ).toEqual({ gain: 0, fadeInSec: 0, fadeOutSec: 0 });
  });
});
