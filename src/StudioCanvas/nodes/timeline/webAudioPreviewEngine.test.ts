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
  volumeAutomation,
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

describe('keyed volume in the preview', () => {
  const ducked: TimelinePreviewAudioEvent = {
    ...event,
    volumeKeyframes: [
      { timeSec: 1, value: 0.8, interpolation: 'linear' },
      { timeSec: 1.2, value: 0.2, interpolation: 'linear' },
      { timeSec: 3, value: 0.2, interpolation: 'linear' },
      { timeSec: 3.4, value: 0.8, interpolation: 'linear' },
    ],
  };
  const valueAt = (points: { timelineSec: number; value: number }[], sec: number) =>
    points.find((point) => Math.abs(point.timelineSec - sec) < 1e-9)?.value;

  it('ramps through every key inside the window, valued like the export', () => {
    const points = volumeAutomation(ducked, 0);
    expect(points[0]).toEqual({ timelineSec: 4, value: 0.8 });
    expect(points.at(-1)?.timelineSec).toBe(10);
    expect(valueAt(points, 5.2)).toBeCloseTo(0.2, 6);
    expect(valueAt(points, 7)).toBeCloseTo(0.2, 6);
    expect(valueAt(points, 7.4)).toBeCloseTo(0.8, 6);
    expect(
      points.every(
        (point, index) => index === 0 || point.timelineSec > (points[index - 1]?.timelineSec ?? 0),
      ),
    ).toBe(true);
  });

  it('starts a seek mid-duck at the ducked level; an unkeyed event has no automation', () => {
    expect(volumeAutomation(ducked, 6)[0]).toEqual({ timelineSec: 6, value: 0.2 });
    expect(volumeAutomation(event, 0)).toEqual([]);
  });
});

it('retained manual fades and new transitions sample their independent clocks when seeking', () => {
  const retained = {
    ...event,
    outputEndSec: 6,
    fadeInSec: 8,
    fadeOutSec: 7,
    audioFadeClock: { offsetSec: 4, durationSec: 10 },
    transitionFadeInSec: 1,
    transitionFadeOutSec: 0.5,
  };
  for (const local of [0, 0.25, 0.75, 1, 1.75]) {
    expect(fadeInGainAt(retained, 4 + local)).toBeCloseTo(Math.min((4 + local) / 8, local, 1), 10);
    expect(fadeOutGainAt(retained, 4 + local)).toBeCloseTo(
      Math.min((6 - local) / 7, (2 - local) / 0.5, 1),
      10,
    );
  }
});
