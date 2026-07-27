import { describe, expect, it } from 'bun:test';
import type { TimelineDocument } from './adapter';
import { buildTimelinePreviewAudioPlan } from './timelineAudioPreviewPlan';
import { computeLayout, effectiveItemDuration } from './useTimelineEditorModel';

const videoBlob = new Blob(['video'], { type: 'video/mp4' });
const audioBlob = new Blob(['audio'], { type: 'audio/mpeg' });

describe('buildTimelinePreviewAudioPlan', () => {
  it('projects base audio and independent voiceover onto one output clock', () => {
    const document: TimelineDocument = {
      items: [
        {
          id: 'base-a',
          order: 0,
          sourceNodeId: 'video-a',
          kind: 'video',
          trimStartSec: 2,
          trimEndSec: 8,
          volume: 0.8,
          audioFadeInSec: 0.2,
        },
      ],
      audioTracks: [
        {
          id: 'audio-1',
          kind: 'audio',
          items: [
            {
              id: 'voiceover-a',
              order: 0,
              sourceNodeId: 'voice-a',
              kind: 'audio',
              startSec: 1.5,
              trimStartSec: 3,
              trimEndSec: 7,
              volume: 0.6,
              audioFadeOutSec: 0.4,
            },
          ],
        },
      ],
    };
    const durations = new Map([
      ['video-a', 10],
      ['voice-a', 9],
    ]);
    const layout = computeLayout(
      document.items,
      (item) => effectiveItemDuration(item, durations.get(item.sourceNodeId)),
      80,
    );

    const plan = buildTimelinePreviewAudioPlan({
      document,
      layout,
      sourceDurations: durations,
      pool: [
        { nodeId: 'video-a', kind: 'video', label: 'Video', previewUrl: 'video-a.mp4' },
        { nodeId: 'voice-a', kind: 'audio', label: 'Voice', previewUrl: 'voice-a.mp3' },
      ],
      resolved: {
        base: [{ itemId: 'base-a', kind: 'video', blob: videoBlob }],
        overlays: [],
        audio: [{ itemId: 'voiceover-a', blob: audioBlob, startSec: 1.5 }],
      },
    });

    expect(plan.events).toHaveLength(2);
    expect(plan.events[0]).toMatchObject({
      id: 'base-a',
      kind: 'base',
      outputStartSec: 0,
      outputEndSec: 6,
      sourceStartSec: 2,
      sourceEndSec: 8,
      gain: 0.8,
      fadeInSec: 0.2,
    });
    expect(plan.events[1]).toMatchObject({
      id: 'voiceover-a',
      kind: 'audio',
      outputStartSec: 1.5,
      outputEndSec: 5.5,
      sourceStartSec: 3,
      sourceEndSec: 7,
      gain: 0.6,
      fadeOutSec: 0.4,
    });
  });

  it('uses cross-dissolve overlap as complementary base-audio fades', () => {
    const document: TimelineDocument = {
      items: [
        {
          id: 'a',
          order: 0,
          sourceNodeId: 'source-a',
          kind: 'video',
          trimEndSec: 4,
        },
        {
          id: 'b',
          order: 1,
          sourceNodeId: 'source-b',
          kind: 'video',
          trimEndSec: 4,
          transition: { type: 'crossDissolve', durationSec: 1 },
        },
      ],
    };
    const durations = new Map([
      ['source-a', 4],
      ['source-b', 4],
    ]);
    const layout = computeLayout(
      document.items,
      (item) => effectiveItemDuration(item, durations.get(item.sourceNodeId)),
      80,
    );
    const plan = buildTimelinePreviewAudioPlan({
      document,
      layout,
      sourceDurations: durations,
      pool: [
        { nodeId: 'source-a', kind: 'video', label: 'A' },
        { nodeId: 'source-b', kind: 'video', label: 'B' },
      ],
      resolved: {
        base: [
          { itemId: 'a', kind: 'video', blob: videoBlob },
          { itemId: 'b', kind: 'video', blob: videoBlob },
        ],
        overlays: [],
        audio: [],
      },
    });

    expect(plan.totalDurationSec).toBe(7);
    expect(plan.events.find((event) => event.id === 'a')?.fadeOutSec).toBe(1);
    expect(plan.events.find((event) => event.id === 'b')?.fadeInSec).toBe(1);
  });

  it('keeps an unprobed voiceover audible through the remaining timeline', () => {
    const document: TimelineDocument = {
      items: [
        {
          id: 'base',
          order: 0,
          sourceNodeId: 'video',
          kind: 'video',
          trimEndSec: 5,
          muteAudio: true,
        },
      ],
      audioTracks: [
        {
          id: 'audio',
          kind: 'audio',
          items: [
            {
              id: 'voice',
              order: 0,
              sourceNodeId: 'voice-source',
              kind: 'audio',
              startSec: 1,
            },
          ],
        },
      ],
    };
    const durations = new Map([['video', 5]]);
    const layout = computeLayout(
      document.items,
      (item) => effectiveItemDuration(item, durations.get(item.sourceNodeId)),
      80,
    );
    const plan = buildTimelinePreviewAudioPlan({
      document,
      layout,
      sourceDurations: durations,
      pool: [
        { nodeId: 'video', kind: 'video', label: 'Video' },
        { nodeId: 'voice-source', kind: 'audio', label: 'Voice' },
      ],
      resolved: {
        base: [],
        overlays: [],
        audio: [{ itemId: 'voice', blob: audioBlob, startSec: 1 }],
      },
    });

    expect(plan.events[0]).toMatchObject({
      id: 'voice',
      outputStartSec: 1,
      outputEndSec: 5,
      sourceStartSec: 0,
      sourceEndSec: 4,
    });
  });
});
