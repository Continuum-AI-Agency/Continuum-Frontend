import { describe, expect, it } from 'bun:test';
import { createEditorProjectV2, editorProjectV2Schema } from '@continuum/contracts';
import type { TimelineDocument } from './adapter';
import { buildTimelinePreviewAudioPlan } from './timelineAudioPreviewPlan';
import {
  buildEditorProjectV2AudioPreviewPlan,
  editorProjectV2AudioClipIds,
} from './useEditorProjectV2AudioPreview';
import { computeLayout, effectiveItemDuration } from './useTimelineEditorModel';
import { volumeAutomation } from './webAudioPreviewEngine';

const videoBlob = new Blob(['video'], { type: 'video/mp4' });
const audioBlob = new Blob(['audio'], { type: 'audio/mpeg' });

it('maps repeated nested video and audio sources, retaining independent child and group gain clocks', () => {
  const base = createEditorProjectV2({
    projectId: 'p',
    title: 'Nested sound',
    width: 320,
    height: 180,
  });
  const project = editorProjectV2Schema.parse({
    ...base,
    durationSec: 6,
    nestedSequences: [
      {
        id: 'child',
        name: 'Child',
        canvas: base.canvas,
        durationSec: 8,
        tracks: [
          {
            id: 'child-video',
            kind: 'video',
            name: 'Picture',
            order: 0,
            clips: [
              {
                id: 'v',
                kind: 'video',
                timelineStartSec: 1,
                durationSec: 4,
                source: { sourceType: 'library_asset', assetId: 'video', renditionId: 'video-v1' },
                sourceInSec: 2,
                playbackRate: 0.5,
                fadeInSec: 3,
                fadeOutSec: 3,
                keyframes: [
                  {
                    id: 'v0',
                    property: 'audio.volume',
                    timeSec: 0,
                    value: 0.2,
                    interpolation: 'linear',
                  },
                  {
                    id: 'v1',
                    property: 'audio.volume',
                    timeSec: 4,
                    value: 0.8,
                    interpolation: 'linear',
                  },
                ],
              },
            ],
          },
          {
            id: 'child-audio',
            kind: 'audio',
            name: 'Bed',
            order: 1,
            clips: [
              {
                id: 'a',
                kind: 'audio',
                timelineStartSec: 4,
                durationSec: 2,
                source: { sourceType: 'library_asset', assetId: 'audio', renditionId: 'audio-v1' },
                sourceInSec: 1,
                playbackRate: 1.5,
                volume: 0.25,
                fadeOutSec: 1,
              },
            ],
          },
        ],
      },
    ],
    tracks: [
      {
        id: 'groups',
        name: 'Groups',
        kind: 'nested_sequence',
        order: 0,
        clips: [
          {
            id: 'g1',
            kind: 'nested_sequence',
            sequenceId: 'child',
            timelineStartSec: 1,
            durationSec: 2,
            sourceInSec: 2,
            playbackRate: 2,
            keyframeOffsetSec: 0.25,
            keyframes: [
              { id: 'g0', property: 'audio.volume', timeSec: 0, value: 1, interpolation: 'linear' },
              {
                id: 'g1',
                property: 'audio.volume',
                timeSec: 2,
                value: 0.5,
                interpolation: 'linear',
              },
            ],
          },
          {
            id: 'g2',
            kind: 'nested_sequence',
            sequenceId: 'child',
            timelineStartSec: 4,
            durationSec: 1,
            sourceInSec: 2,
            playbackRate: 2,
          },
        ],
      },
    ],
  });
  expect(editorProjectV2AudioClipIds(project).sort()).toEqual(['a', 'v']);
  const input = {
    project,
    layout: { ...computeLayout([], effectiveItemDuration, 80), totalSec: 6 },
    blobsByClipId: new Map([
      ['v', videoBlob],
      ['a', audioBlob],
    ]),
  };
  const events = buildEditorProjectV2AudioPreviewPlan(input).events;
  expect(events).toHaveLength(3);
  expect(events[0]).toMatchObject({
    id: 'g1:v',
    sourceNodeId: 'v',
    outputStartSec: 1,
    outputEndSec: 2.5,
    sourceStartSec: 2.5,
    sourceEndSec: 4,
    playbackRate: 1,
    fadeInSec: 1.5,
    fadeOutSec: 1.5,
    audioFadeClock: { offsetSec: 0.5, durationSec: 2 },
    keyframeOffsetSec: 0.5,
    groupKeyframeOffsetSec: 0.25,
  });
  expect(events[1]).toMatchObject({
    id: 'g1:a',
    outputStartSec: 2,
    outputEndSec: 3,
    sourceStartSec: 1,
    sourceEndSec: 4,
    playbackRate: 3,
    gain: 0.25,
  });
  expect(events[2]).toMatchObject({ id: 'g2:v', outputStartSec: 4, outputEndSec: 5 });
  expect(volumeAutomation(events[0]!, 1.5)[0]?.value).toBeCloseTo(0.40625, 6);
  const childVideo = project.nestedSequences[0]!.tracks[0]!.clips[0]!;
  const host = project.tracks[0]!.clips[0]!;
  if (childVideo.kind !== 'video' || host.kind !== 'nested_sequence')
    throw new Error('fixture kinds');
  childVideo.reverse = true;
  expect(editorProjectV2AudioClipIds(project).sort()).toEqual(['a', 'v']);
  expect(() => buildEditorProjectV2AudioPreviewPlan(input)).toThrow('reversed or time-remapped');
  childVideo.reverse = false;
  childVideo.playbackRate = 20;
  host.playbackRate = 20;
  expect(buildEditorProjectV2AudioPreviewPlan(input).events[0]?.playbackRate).toBe(400);
  project.tracks[0]!.muted = true;
  expect(buildEditorProjectV2AudioPreviewPlan(input).events).toHaveLength(0);
});

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
