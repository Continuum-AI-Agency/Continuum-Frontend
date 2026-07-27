import { describe, expect, it } from 'bun:test';
import type { AudioPlanItem } from './audioMix';
import { buildAudioBedPlanItems, type PreparedTimelineAudio } from './composeTimeline';

describe('buildAudioBedPlanItems', () => {
  it('includes absolute timing, trim, gain, and fades in the master mix plan', () => {
    const fakeInput = {} as AudioPlanItem['input'];
    const plan = buildAudioBedPlanItems([
      {
        input: fakeInput,
        sourceStartSec: 1.25,
        sourceEndSec: 6,
        outputStartSec: 3.5,
        gain: 0.65,
        fadeInSec: 0.4,
        fadeOutSec: 0.8,
      } satisfies PreparedTimelineAudio,
    ]);

    expect(plan).toEqual([
      {
        input: fakeInput,
        sourceStartSec: 1.25,
        sourceEndSec: 6,
        speed: 1,
        outputStartSec: 3.5,
        gain: 0.65,
        fadeInSec: 0.4,
        fadeOutSec: 0.8,
      },
    ]);
  });
});
