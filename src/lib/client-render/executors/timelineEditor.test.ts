import { afterEach, describe, expect, it } from 'bun:test';
import { createEditorProjectV2, editorProjectV2Schema } from '@continuum/contracts';
import {
  assertSupportedTimelineEditorExport,
  buildTimelineEditorRenderPlan,
} from './timelineEditor';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('timeline editor client render executor', () => {
  it('projects the immutable V2 snapshot into Mediabunny worker inputs', async () => {
    globalThis.fetch = (async () =>
      new Response(new Blob(['video-bytes'], { type: 'video/mp4' }), {
        status: 200,
      })) as typeof fetch;
    const created = createEditorProjectV2({
      projectId: '00000000-0000-4000-8000-000000000111',
      title: 'Master',
      width: 1080,
      height: 1920,
      now: '2026-08-01T12:00:00.000Z',
    });
    const project = editorProjectV2Schema.parse({
      ...created,
      durationSec: 8,
      tracks: [
        {
          id: 'production-masters',
          name: 'Approved masters',
          order: 0,
          kind: 'video',
          clips: [
            {
              id: 'master:hook',
              name: 'Hook',
              timelineStartSec: 0,
              durationSec: 8,
              kind: 'video',
              source: {
                sourceType: 'library_asset',
                assetId: 'asset-1',
                renditionId: 'version-1',
              },
              sourceInSec: 0,
              playbackRate: 1,
            },
          ],
        },
      ],
    });
    const plan = await buildTimelineEditorRenderPlan({
      project,
      jobInputs: [
        {
          sourceId: 'master:hook',
          sourceAssetId: 'asset-1',
          sourceRevision: 'version-1',
          storage: { bucket: 'media-library', path: 'brand/master.mp4' },
        },
      ],
      signedUrls: new Map([
        ['media-library\nbrand/master.mp4', 'https://signed.example/master.mp4'],
      ]),
      signal: new AbortController().signal,
    });
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({
      itemId: 'master:hook',
      kind: 'video',
      durationSec: 8,
      trimStartSec: 0,
      trimEndSec: 8,
      muteAudio: false,
    });
    expect(plan.items[0]?.blob.type).toBe('video/mp4');
    expect(plan.overlays).toEqual([]);
    expect(plan.audioTracks).toEqual([]);
    expect(plan.captionCues).toEqual([]);
    await expect(
      buildTimelineEditorRenderPlan({
        project,
        jobInputs: [
          {
            sourceId: 'master:hook',
            sourceAssetId: 'asset-1',
            sourceRevision: 'head-version',
            storage: { bucket: 'media-library', path: 'brand/master.mp4' },
          },
        ],
        signedUrls: new Map([
          ['media-library\nbrand/master.mp4', 'https://signed.example/master.mp4'],
        ]),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('does not match its pinned version');
  });

  it('preserves V2 transitions, layers, audio, captions, text, looks, and keyframes', async () => {
    globalThis.fetch = (async () =>
      new Response(new Blob(['media-bytes'], { type: 'video/mp4' }), {
        status: 200,
      })) as typeof fetch;
    const created = createEditorProjectV2({
      projectId: '00000000-0000-4000-8000-000000000222',
      title: 'Layered master',
      width: 1080,
      height: 1920,
      now: '2026-08-02T12:00:00.000Z',
    });
    const source = (assetId: string, renditionId: string) => ({
      sourceType: 'library_asset' as const,
      assetId,
      renditionId,
    });
    const project = editorProjectV2Schema.parse({
      ...created,
      durationSec: 7.5,
      exportSettings: { ...created.exportSettings, captionMode: 'burn_in' },
      tracks: [
        {
          id: 'masters',
          name: 'Masters',
          order: 0,
          kind: 'video',
          clips: [
            {
              id: 'master:hook',
              timelineStartSec: 0,
              durationSec: 4,
              kind: 'video',
              source: source('asset-hook', 'version-hook'),
              sourceInSec: 0,
              playbackRate: 1,
              effects: [
                {
                  id: 'look-hook',
                  effectType: 'color_adjustment',
                  effectId: 'vivid',
                  parameters: { filterPreset: 'vivid', saturation: 1.25 },
                },
              ],
              keyframes: [
                {
                  id: 'hook-start-position',
                  property: 'transform.position',
                  timeSec: 0,
                  value: { x: 0.5, y: 0.5 },
                  interpolation: 'linear',
                },
                {
                  id: 'hook-start-scale',
                  property: 'transform.scaleX',
                  timeSec: 0,
                  value: 1,
                  interpolation: 'linear',
                },
                {
                  id: 'hook-end-position',
                  property: 'transform.position',
                  timeSec: 4,
                  value: { x: 0.55, y: 0.45 },
                  interpolation: 'linear',
                },
                {
                  id: 'hook-end-scale',
                  property: 'transform.scaleX',
                  timeSec: 4,
                  value: 1.12,
                  interpolation: 'linear',
                },
              ],
            },
            {
              id: 'master:proof',
              timelineStartSec: 3.5,
              durationSec: 4,
              kind: 'video',
              source: source('asset-proof', 'version-proof'),
              sourceInSec: 1,
              playbackRate: 1,
              keyframes: [
                {
                  id: 'proof-start',
                  property: 'transform.scaleX',
                  timeSec: 0,
                  value: 1,
                  interpolation: 'linear',
                },
                {
                  id: 'proof-end',
                  property: 'transform.scaleX',
                  timeSec: 4,
                  value: 1.2,
                  interpolation: 'linear',
                },
              ],
            },
          ],
        },
        {
          id: 'broll-track',
          name: 'B-roll',
          order: 1,
          kind: 'video',
          clips: [
            {
              id: 'broll',
              timelineStartSec: 1,
              durationSec: 2,
              kind: 'video',
              source: source('asset-broll', 'version-broll'),
              sourceInSec: 0,
            },
          ],
        },
        {
          id: 'overlay-track',
          name: 'Graphics',
          order: 2,
          kind: 'overlay',
          clips: [
            {
              id: 'logo',
              timelineStartSec: 0.5,
              durationSec: 3,
              kind: 'overlay',
              source: source('asset-logo', 'version-logo'),
              mediaKind: 'image',
            },
          ],
        },
        {
          id: 'audio-track',
          name: 'Score',
          order: 3,
          kind: 'audio',
          clips: [
            {
              id: 'score',
              timelineStartSec: 0,
              durationSec: 7.5,
              kind: 'audio',
              source: source('asset-score', 'version-score'),
              sourceInSec: 0,
              playbackRate: 1.25,
              volume: 0.6,
              fadeInSec: 0.25,
              fadeOutSec: 0.5,
            },
          ],
        },
        {
          id: 'captions',
          name: 'Captions',
          order: 4,
          kind: 'caption',
          clips: [
            {
              id: 'caption:hook',
              timelineStartSec: 0,
              durationSec: 2,
              kind: 'caption',
              text: 'Meet the future',
              language: 'en',
              words: [
                { text: 'Meet', startSec: 0, endSec: 0.5 },
                { text: 'the', startSec: 0.5, endSec: 1 },
                { text: 'future', startSec: 1, endSec: 2 },
              ],
              style: {
                fontFamily: 'Inter',
                fontSizePx: 72,
                fontWeight: 700,
                color: '#ffffff',
                outlineColor: '#000000',
                outlineWidthPx: 8,
              },
              highlightMode: 'word',
            },
          ],
        },
        {
          id: 'text',
          name: 'Text',
          order: 5,
          kind: 'text',
          clips: [
            {
              id: 'text:cta',
              timelineStartSec: 5,
              durationSec: 2,
              kind: 'text',
              text: 'Start today',
              style: {
                fontFamily: 'Inter',
                fontSizePx: 64,
                fontWeight: 800,
                color: '#ffcc00',
                backgroundColor: '#000000',
                outlineWidthPx: 0,
              },
            },
          ],
        },
      ],
      transitions: [
        {
          id: 'transition:proof',
          trackId: 'masters',
          fromClipId: 'master:hook',
          toClipId: 'master:proof',
          transitionType: 'crossfade',
          durationSec: 0.5,
        },
      ],
    });
    const ids = ['master:hook', 'master:proof', 'broll', 'logo', 'score'];
    const plan = await buildTimelineEditorRenderPlan({
      project,
      jobInputs: ids.map((sourceId) => ({
        sourceId,
        sourceAssetId: `asset-${sourceId.replace('master:', '')}`,
        sourceRevision: `version-${sourceId.replace('master:', '')}`,
        storage: { bucket: 'media-library', path: `brand/${sourceId}.bin` },
      })),
      signedUrls: new Map(
        ids.map((sourceId) => [
          `media-library\nbrand/${sourceId}.bin`,
          `https://signed.example/${sourceId}`,
        ]),
      ),
      signal: new AbortController().signal,
    });

    expect(plan.items).toHaveLength(2);
    expect(plan.items[0]?.effects).toMatchObject({
      filterPreset: 'vivid',
      adjustments: { saturation: 1.25 },
    });
    expect(plan.items[0]?.effects?.keyframes).toHaveLength(2);
    expect(plan.items[1]?.effects?.keyframes?.map((keyframe) => keyframe.t)).toEqual([0, 1]);
    expect(plan.items[1]?.transition).toEqual({ type: 'crossDissolve', durationSec: 0.5 });
    expect(plan.overlays.map((overlay) => overlay.itemId).sort()).toEqual(['broll', 'logo']);
    expect(plan.audioTracks[0]).toMatchObject({
      itemId: 'score',
      speed: 1.25,
      volume: 0.6,
      fadeInSec: 0.25,
      fadeOutSec: 0.5,
    });
    expect(plan.captionCues.map((cue) => cue.id)).toEqual(['caption:hook', 'text:cta']);
    expect(plan.captionCues[1]?.style).toMatchObject({
      textColor: '#ffcc00',
      backgroundColor: '#000000',
    });
  });

  it('fails visibly instead of rendering timeline geometry that disagrees with its transition', async () => {
    const created = createEditorProjectV2({
      projectId: '00000000-0000-4000-8000-000000000444',
      title: 'Inconsistent transition',
      width: 1080,
      height: 1920,
      now: '2026-08-02T12:00:00.000Z',
    });
    const project = editorProjectV2Schema.parse({
      ...created,
      durationSec: 8,
      tracks: [
        {
          id: 'masters',
          name: 'Masters',
          order: 0,
          kind: 'video',
          clips: [
            {
              id: 'first',
              timelineStartSec: 0,
              durationSec: 4,
              kind: 'video',
              source: { sourceType: 'library_asset', assetId: 'asset-1', renditionId: 'v1' },
            },
            {
              id: 'second',
              timelineStartSec: 4,
              durationSec: 4,
              kind: 'video',
              source: { sourceType: 'library_asset', assetId: 'asset-2', renditionId: 'v2' },
            },
          ],
        },
      ],
      transitions: [
        {
          id: 'transition',
          trackId: 'masters',
          fromClipId: 'first',
          toClipId: 'second',
          transitionType: 'crossfade',
          durationSec: 0.5,
        },
      ],
    });

    await expect(
      buildTimelineEditorRenderPlan({
        project,
        jobInputs: [],
        signedUrls: new Map(),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('canonical sequence requires 3.5s');
  });

  it('fails closed when a requested export contract cannot be honored', () => {
    const created = createEditorProjectV2({
      projectId: '00000000-0000-4000-8000-000000000555',
      title: 'Unsupported master',
      width: 1080,
      height: 1920,
      now: '2026-08-02T12:00:00.000Z',
    });
    const project = editorProjectV2Schema.parse({
      ...created,
      exportSettings: {
        ...created.exportSettings,
        frameRate: { numerator: 24, denominator: 1 },
        format: 'webm',
        videoCodec: 'vp9',
        audioCodec: 'opus',
        sampleRateHz: 44_100,
        colorSpace: 'rec2020',
        alpha: true,
        captionMode: 'sidecar',
      },
    });

    expect(() => assertSupportedTimelineEditorExport(project)).toThrow(
      'frameRate must be 30 fps; project and export frameRate must match; format must be mp4; videoCodec must be h264; audioCodec must be aac; sampleRateHz must be 48000; project and export sampleRateHz must match; colorSpace must be rec709; alpha must be false; sidecar captions are not supported',
    );
  });
});
