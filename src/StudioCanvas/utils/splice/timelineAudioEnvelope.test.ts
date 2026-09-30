import { describe, expect, it } from 'bun:test';
import { resolveTimelineAudioEnvelope, volumeKeyframesOf } from './timelineAudioEnvelope';

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

describe('volumeKeyframesOf', () => {
  it('keeps only numeric audio.volume keys, with their interpolation and easing', () => {
    expect(
      volumeKeyframesOf([
        { id: 'a', property: 'audio.volume', timeSec: 0.5, value: 1, interpolation: 'linear' },
        {
          id: 'b',
          property: 'audio.volume',
          timeSec: 0.65,
          value: 0.25,
          interpolation: 'bezier',
          easing: { x1: 0.4, y1: 0, x2: 0.6, y2: 1 },
        },
        { id: 'c', property: 'audio.pan', timeSec: 1, value: -1, interpolation: 'linear' },
        {
          id: 'd',
          property: 'transform.position',
          timeSec: 1,
          value: { x: 0.2, y: 0.3 },
          interpolation: 'linear',
        },
      ]),
    ).toEqual([
      { timeSec: 0.5, value: 1, interpolation: 'linear' },
      {
        timeSec: 0.65,
        value: 0.25,
        interpolation: 'bezier',
        easing: { x1: 0.4, y1: 0, x2: 0.6, y2: 1 },
      },
    ]);
  });
});
