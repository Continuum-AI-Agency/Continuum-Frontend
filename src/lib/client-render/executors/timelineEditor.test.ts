import { afterEach, describe, expect, it } from 'bun:test';
import {
  createEditorProjectV2,
  editorProjectV2Schema,
  numericKeysForProperty,
  parentPositionDelta,
  retainParentMotionForEdit,
  sampleNumericTrack,
} from '@continuum/contracts';
import { opacityFor, resolveTransformAt } from '@/StudioCanvas/utils/render/effectSpec';
import {
  assertSupportedTimelineEditorExport,
  buildTimelineEditorRenderPlan,
  clipEffectSpecFromEditorClip,
} from './timelineEditor';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('clipEffectSpecFromEditorClip', () => {
  it('maps transform.opacity keys onto sampled opacityStops', () => {
    const spec = clipEffectSpecFromEditorClip({
      timelineStartSec: 0,
      durationSec: 2,
      transform: {
        position: { x: 0.5, y: 0.5 },
        scaleX: 1,
        scaleY: 1,
        rotationDeg: 0,
        opacity: 1,
      },
      keyframes: [
        {
          property: 'transform.opacity',
          timeSec: 0,
          value: 0,
          interpolation: 'linear',
        },
        {
          property: 'transform.opacity',
          timeSec: 2,
          value: 1,
          interpolation: 'linear',
        },
      ],
    });
    expect(spec.opacityStops).toEqual([
      { t: 0, value: 0, interpolation: 'linear' },
      { t: 1, value: 1, interpolation: 'linear' },
    ]);
    expect(opacityFor(spec, 0.5)).toBe(0.5);
  });

  it('keeps scaleX and scaleY on independent motion channels', () => {
    const spec = clipEffectSpecFromEditorClip({
      timelineStartSec: 0,
      durationSec: 1,
      transform: {
        position: { x: 0.5, y: 0.5 },
        scaleX: 1,
        scaleY: 1,
        rotationDeg: 0,
        opacity: 1,
      },
      keyframes: [
        { property: 'transform.scaleX', timeSec: 0, value: 1, interpolation: 'linear' },
        { property: 'transform.scaleX', timeSec: 1, value: 2, interpolation: 'linear' },
        { property: 'transform.scaleY', timeSec: 0, value: 1, interpolation: 'linear' },
        { property: 'transform.scaleY', timeSec: 1, value: 1, interpolation: 'linear' },
      ],
    });
    expect(spec.motionChannels?.scaleX?.map((stop) => stop.value)).toEqual([1, 2]);
    expect(spec.motionChannels?.scaleY?.map((stop) => stop.value)).toEqual([1, 1]);
  });

  it('maps rotateX/rotateY keys onto independent 3D channels', () => {
    const spec = clipEffectSpecFromEditorClip({
      timelineStartSec: 0,
      durationSec: 1,
      transform: {
        position: { x: 0.5, y: 0.5 },
        scaleX: 1,
        scaleY: 1,
        rotationDeg: 0,
        rotateXDeg: 0,
        rotateYDeg: 0,
        perspective: 1,
        opacity: 1,
      },
      keyframes: [
        { property: 'transform.rotateXDeg', timeSec: 0, value: 0, interpolation: 'linear' },
        { property: 'transform.rotateXDeg', timeSec: 1, value: 30, interpolation: 'linear' },
        { property: 'transform.rotateYDeg', timeSec: 0, value: 0, interpolation: 'linear' },
        { property: 'transform.rotateYDeg', timeSec: 1, value: -20, interpolation: 'linear' },
      ],
    });
    expect(spec.transform?.rotateX).toBe(0);
    expect(spec.transform?.perspective).toBe(1);
    expect(spec.motionChannels?.rotateX?.map((stop) => stop.value)).toEqual([0, 30]);
    expect(spec.motionChannels?.rotateY?.map((stop) => stop.value)).toEqual([0, -20]);
  });
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

  it('downloads one source once for twelve clips cut from it, and every clip shares that Blob', async () => {
    const fetched: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      fetched.push(String(url));
      return new Response(new Blob(['video-bytes'], { type: 'video/mp4' }), { status: 200 });
    }) as typeof fetch;
    const created = createEditorProjectV2({
      projectId: '00000000-0000-4000-8000-000000000112',
      title: 'Twelve segments of one interview',
      width: 1080,
      height: 1920,
      now: '2026-09-30T12:00:00.000Z',
    });
    const clips = Array.from({ length: 12 }, (_, index) => ({
      id: `seg-${index + 1}`,
      timelineStartSec: index * 5,
      durationSec: 5,
      kind: 'video' as const,
      source: {
        sourceType: 'library_asset' as const,
        assetId: 'asset-1',
        renditionId: 'version-1',
      },
      sourceInSec: index * 30,
      playbackRate: 1,
    }));
    const project = editorProjectV2Schema.parse({
      ...created,
      durationSec: 60,
      tracks: [{ id: 'video-main', name: 'Main video', order: 0, kind: 'video', clips }],
    });
    const plan = await buildTimelineEditorRenderPlan({
      project,
      jobInputs: clips.map((clip) => ({
        sourceId: clip.id,
        sourceAssetId: 'asset-1',
        sourceRevision: 'version-1',
        storage: { bucket: 'media-library', path: 'brand/interview.mp4' },
      })),
      signedUrls: new Map([
        ['media-library\nbrand/interview.mp4', 'https://signed.example/interview.mp4'],
      ]),
      signal: new AbortController().signal,
    });
    expect(plan.items).toHaveLength(12);
    expect(fetched).toEqual(['https://signed.example/interview.mp4']);
    expect(new Set(plan.items.map((item) => item.blob)).size).toBe(1);
  });

  it('draws caption words at clip start + word time and keeps a muted track in picture', async () => {
    globalThis.fetch = (async () =>
      new Response(new Blob(['media-bytes'], { type: 'video/mp4' }), {
        status: 200,
      })) as typeof fetch;
    const created = createEditorProjectV2({
      projectId: '00000000-0000-4000-8000-000000000333',
      title: 'Clip-relative words',
      width: 1080,
      height: 1920,
      now: '2026-09-29T12:00:00.000Z',
    });
    const project = editorProjectV2Schema.parse({
      ...created,
      durationSec: 4,
      exportSettings: { ...created.exportSettings, captionMode: 'burn_in' },
      tracks: [
        {
          id: 'v1',
          name: 'V1',
          order: 0,
          kind: 'video',
          muted: true,
          clips: [
            {
              id: 'shot',
              timelineStartSec: 0,
              durationSec: 4,
              kind: 'video',
              source: {
                sourceType: 'library_asset',
                assetId: 'asset-shot',
                renditionId: 'version-shot',
              },
            },
          ],
        },
        {
          id: 'captions',
          name: 'Captions',
          order: 1,
          kind: 'caption',
          clips: [
            {
              id: 'caption:late',
              timelineStartSec: 2,
              durationSec: 1.5,
              kind: 'caption',
              text: 'Late words',
              language: 'en',
              words: [
                { text: 'Late', startSec: 0.25, endSec: 0.6 },
                { text: 'words', startSec: 0.7, endSec: 1.2 },
              ],
              style: { fontFamily: 'Inter', fontSizePx: 64, fontWeight: 700, color: '#ffffff' },
            },
          ],
        },
      ],
    });
    const plan = await buildTimelineEditorRenderPlan({
      project,
      jobInputs: [
        {
          sourceId: 'shot',
          sourceAssetId: 'asset-shot',
          sourceRevision: 'version-shot',
          storage: { bucket: 'media-library', path: 'brand/shot.bin' },
        },
      ],
      signedUrls: new Map([['media-library\nbrand/shot.bin', 'https://signed.example/shot']]),
      signal: new AbortController().signal,
    });
    expect(plan.items.map((item) => [item.itemId, item.muteAudio])).toEqual([['shot', true]]);
    expect(plan.captionCues[0]?.words.map((word) => [word.startSec, word.endSec])).toEqual([
      [2.25, 2.6],
      [2.7, 3.2],
    ]);
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
                {
                  id: 'vignette-hook',
                  effectType: 'custom',
                  effectId: 'vignette',
                  parameters: { amount: 0.4 },
                },
                {
                  id: 'grain-hook',
                  effectType: 'custom',
                  effectId: 'film_grain',
                  parameters: { amount: 0.3 },
                },
                {
                  id: 'pixelate-hook',
                  effectType: 'custom',
                  effectId: 'pixelate',
                  parameters: { blockPx: 12 },
                },
                {
                  id: 'aberration-hook',
                  effectType: 'custom',
                  effectId: 'chromatic_aberration',
                  parameters: { amount: 0.5 },
                },
                {
                  id: 'vhs-hook',
                  effectType: 'custom',
                  effectId: 'vhs',
                  parameters: { amount: 0.6 },
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
              keyframes: [
                {
                  id: 'duck-0',
                  property: 'audio.volume',
                  timeSec: 1,
                  value: 0.6,
                  interpolation: 'linear',
                },
                {
                  id: 'duck-1',
                  property: 'audio.volume',
                  timeSec: 1.15,
                  value: 0.15,
                  interpolation: 'linear',
                },
                {
                  id: 'pan',
                  property: 'audio.pan',
                  timeSec: 0,
                  value: 0.5,
                  interpolation: 'linear',
                },
              ],
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
              animationIn: 'pop',
              animationOut: 'float-in',
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
      vignette: { amount: 0.4 },
      filmGrain: { amount: 0.3 },
      pixelate: { blockPx: 12 },
      chromaticAberration: { amount: 0.5 },
      vhs: { amount: 0.6 },
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
      // Ducking rides as the clip's audio.volume keys, clip-local; other audio keys do not.
      volumeKeyframes: [
        { timeSec: 1, value: 0.6, interpolation: 'linear' },
        { timeSec: 1.15, value: 0.15, interpolation: 'linear' },
      ],
    });
    expect(plan.captionCues.map((cue) => cue.id)).toEqual(['caption:hook', 'text:cta']);
    expect(plan.captionCues[1]?.style).toMatchObject({
      textColor: '#ffcc00',
      backgroundColor: '#000000',
      animation: { kind: 'pop', anchor: 'cue', reveal: 'cue' },
      exitAnimation: { kind: 'floatIn', anchor: 'cue', reveal: 'cue' },
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

it('retained curve projection keeps source-clock easing, endpoints and expressions', () => {
  for (const interpolation of ['hold', 'linear', 'bezier', 'spring'] as const) {
    for (const expression of [undefined, 'loop', 'wiggle(0.7, 0.1)']) {
      const keys = [
        {
          id: 'a',
          property: 'transform.opacity' as const,
          timeSec: 1,
          value: 0.2,
          interpolation,
          ...(interpolation === 'bezier'
            ? { easing: { x1: 0.42, y1: -0.2, x2: 0.58, y2: 1.2 } }
            : {}),
          ...(interpolation === 'spring' ? { spring: { bounce: 0.7 } } : {}),
          ...(expression ? { expression } : {}),
        },
        {
          id: 'b',
          property: 'transform.opacity' as const,
          timeSec: 8,
          value: 0.8,
          interpolation: 'linear' as const,
        },
      ];
      const clip = { timelineStartSec: 0, durationSec: 2, keyframeOffsetSec: 3, keyframes: keys };
      const spec = clipEffectSpecFromEditorClip(clip);
      expect(spec.opacityStops?.map((stop) => stop.t)).toEqual([0.5, 4]);
      for (const localSec of [0, 0.1, 0.75, 1.9]) {
        const expected = sampleNumericTrack(
          numericKeysForProperty(keys, 'transform.opacity'),
          localSec + 3,
          1,
        );
        expect(opacityFor(spec, localSec / 2)).toBeCloseTo(Math.max(0, Math.min(1, expected)), 10);
      }
    }
  }
});

it('serializes separate parent curves into the same transform used by preview and worker', () => {
  for (const interpolation of ['hold', 'linear', 'bezier', 'spring'] as const) {
    const key = (id: string, timeSec: number, x: number, y: number) => ({
      id,
      property: 'transform.position',
      timeSec,
      value: { x, y },
      interpolation,
      ...(interpolation === 'bezier'
        ? { easing: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 }, expression: 'wiggle(0.7, 0.02)' }
        : {}),
      ...(interpolation === 'spring' ? { spring: { bounce: 0.7 }, expression: 'loop' } : {}),
    });
    const text = {
      kind: 'text',
      text: 'Clock',
      durationSec: 4,
      style: { fontFamily: 'Arial', fontSizePx: 64, fontWeight: 700, color: '#fff' },
    };
    const project = editorProjectV2Schema.parse({
      ...createEditorProjectV2({ projectId: 'p', title: 'Parents', width: 360, height: 640 }),
      durationSec: 6,
      tracks: [
        {
          id: 't',
          name: 'T',
          kind: 'text',
          order: 0,
          clips: [
            {
              ...text,
              id: 'grandparent',
              timelineStartSec: 0.5,
              durationSec: 1,
              keyframeOffsetSec: 0.3,
              keyframes: [key('g0', 0, 0.5, 0.5), key('g3', 3, 0.5, 0.65)],
            },
            {
              ...text,
              id: 'parent',
              timelineStartSec: 1,
              parentClipId: 'grandparent',
              keyframes: [key('p0', 0, 0.5, 0.5), key('p3', 3, 0.7, 0.5)],
            },
            {
              ...text,
              id: 'child',
              timelineStartSec: 2,
              parentClipId: 'parent',
              transform: { position: { x: 0.4, y: 0.3, unit: 'normalized' } },
            },
          ],
        },
      ],
    });
    const child = project.tracks[0]!.clips[2]!;
    const compiled = clipEffectSpecFromEditorClip(child, project);
    const spec: typeof compiled = JSON.parse(JSON.stringify(compiled));
    expect(spec.parentPositionTracks).toHaveLength(2);
    const removedParents = retainParentMotionForEdit(
      project,
      {
        ...project,
        tracks: project.tracks.map((track) => ({
          ...track,
          clips: track.clips.filter((clip) => clip.id === child.id),
        })),
      },
      new Map([[child.id, { clipId: child.id, offsetSec: 0 }]]),
    );
    const retainedChild = removedParents.tracks[0]!.clips[0]!;
    expect(retainedChild.parentClipId).toBeUndefined();
    const fallbackSpec = clipEffectSpecFromEditorClip(retainedChild, removedParents);
    expect(fallbackSpec.parentPositionTracks).toHaveLength(2);
    for (const localSec of [0, 0.2, 1.3, 2.7]) {
      const got = resolveTransformAt(spec, localSec / child.durationSec);
      const delta = parentPositionDelta(project, child.id, child.timelineStartSec + localSec);
      expect(got.offsetX).toBeCloseTo(-0.1 + delta.x, 12);
      expect(got.offsetY).toBeCloseTo(-0.2 + delta.y, 12);
      expect(resolveTransformAt(fallbackSpec, localSec / child.durationSec)).toEqual(got);
    }
  }
});
