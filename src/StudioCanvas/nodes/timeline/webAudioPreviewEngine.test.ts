import { describe, expect, it } from 'bun:test';
import type {
  TimelinePreviewAudioEvent,
  TimelinePreviewAudioPlan,
} from './timelineAudioPreviewPlan';
import {
  buildPreviewAudioSchedule,
  type DecodedPreviewAudioAsset,
  fadeInGainAt,
  fadeOutGainAt,
} from './webAudioPreviewEngine';

const buffer = {} as AudioBuffer;
const event: TimelinePreviewAudioEvent = {
  id: 'voiceover',
  sourceKey: 'voice-source:v1',
  sourceNodeId: 'voice-source',
  kind: 'audio',
  blob: new Blob(),
  outputStartSec: 4,
  outputEndSec: 10,
  sourceStartSec: 2,
  sourceEndSec: 8,
  playbackRate: 1,
  gain: 0.8,
  fadeInSec: 1,
  fadeOutSec: 2,
};

describe('Web Audio preview schedule', () => {
  it('seeks into a voiceover using the matching source offset', () => {
    const plan: TimelinePreviewAudioPlan = { events: [event], totalDurationSec: 12 };
    const decoded: DecodedPreviewAudioAsset = {
      chunks: [{ buffer, timestampSec: 0, durationSec: 12 }],
    };
    const schedule = buildPreviewAudioSchedule({
      plan,
      decodedBySource: new Map([[event.sourceKey, decoded]]),
      fromTimelineSec: 6,
      contextStartSec: 20,
    });

    expect(schedule).toHaveLength(1);
    expect(schedule[0]).toMatchObject({
      whenSec: 20,
      offsetSec: 4,
      sourceDurationSec: 4,
    });
  });

  it('schedules decoded chunks at their output-clock positions', () => {
    const plan: TimelinePreviewAudioPlan = { events: [event], totalDurationSec: 12 };
    const decoded: DecodedPreviewAudioAsset = {
      chunks: [
        { buffer, timestampSec: 0, durationSec: 3 },
        { buffer, timestampSec: 3, durationSec: 3 },
        { buffer, timestampSec: 6, durationSec: 3 },
      ],
    };
    const schedule = buildPreviewAudioSchedule({
      plan,
      decodedBySource: new Map([[event.sourceKey, decoded]]),
      fromTimelineSec: 0,
      contextStartSec: 10,
    });

    expect(schedule.map((chunk) => chunk.whenSec)).toEqual([14, 15, 18]);
    expect(schedule.map((chunk) => chunk.sourceDurationSec)).toEqual([1, 3, 2]);
  });

  it('evaluates complementary placement fades at an arbitrary clock time', () => {
    expect(fadeInGainAt(event, 4)).toBe(0);
    expect(fadeInGainAt(event, 4.5)).toBe(0.5);
    expect(fadeInGainAt(event, 5)).toBe(1);
    expect(fadeOutGainAt(event, 8)).toBe(1);
    expect(fadeOutGainAt(event, 9)).toBe(0.5);
    expect(fadeOutGainAt(event, 10)).toBe(0);
  });
});
