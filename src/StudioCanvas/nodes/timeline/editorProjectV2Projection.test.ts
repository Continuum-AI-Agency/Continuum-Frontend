import { describe, expect, test } from 'bun:test';
import type { TimelineDocument } from './adapter';
import { projectTimelineDocumentToEditorProjectV2 } from './editorProjectV2Projection';

function timelineFixture(): TimelineDocument {
  return {
    items: [
      {
        id: 'video-item',
        order: 0,
        sourceNodeId: 'video-node',
        kind: 'video',
        trimStartSec: 1,
        trimEndSec: 5,
        volume: 0.8,
        audioFadeInSec: 0.25,
        audioFadeOutSec: 0.5,
        effects: {
          opacity: 0.9,
          transform: { scale: 1.2, offsetX: 0.1, offsetY: -0.1, rotate: 5 },
          adjustments: { brightness: 1.1, saturation: 1.2 },
          filterPreset: 'warm',
          keyframes: [
            { t: 0, transform: { scale: 1, offsetX: 0 } },
            { t: 1, transform: { scale: 1.2, offsetX: 0.1 } },
          ],
          text: [
            {
              id: 'hook',
              text: 'Meet your new favorite',
              xFrac: 0.5,
              yFrac: 0.15,
              sizeFrac: 0.06,
              color: '#ffffff',
              fontWeight: 800,
            },
          ],
        },
      },
      {
        id: 'still-item',
        order: 1,
        sourceNodeId: 'product-node',
        kind: 'image',
        durationSec: 2,
        transition: { type: 'crossDissolve', durationSec: 0.5 },
      },
    ],
    overlayTracks: [
      {
        id: 'logo-lane',
        kind: 'overlay',
        items: [
          {
            id: 'logo-item',
            order: 0,
            sourceNodeId: 'logo-node',
            kind: 'image',
            startSec: 1,
            durationSec: 3,
            effects: { transform: { scale: 0.25, offsetX: 0.3, offsetY: 0.3 } },
          },
        ],
      },
    ],
    audioTracks: [
      {
        id: 'voiceover-lane',
        kind: 'audio',
        items: [
          {
            id: 'voiceover-item',
            order: 0,
            sourceNodeId: 'voiceover-node',
            kind: 'audio',
            startSec: 0.75,
            trimStartSec: 0.5,
            trimEndSec: 3.5,
            volume: 0.7,
            audioFadeInSec: 0.2,
            audioFadeOutSec: 0.4,
          },
        ],
      },
    ],
    exportPresetId: 'vertical-1080',
    markers: [1.25, 4.2],
    captionsEnabled: true,
    captionCues: [
      {
        id: 'cue-1',
        startSec: 0,
        endSec: 2,
        words: [
          { text: 'This', startSec: 0, endSec: 0.4 },
          { text: 'works', startSec: 0.4, endSec: 0.9 },
        ],
        style: { highlightColor: '#00ff00' },
      },
    ],
    captionStyle: {
      textColor: '#ffffff',
      highlightColor: '#ffd400',
      outlineColor: '#000000',
      fontFamily: 'Inter',
      fontSizeFrac: 0.05,
      outlineWidthFrac: 0.1,
      position: { xFrac: 0.5, yFrac: 0.85 },
    },
  };
}

const canvasPool = [
  {
    nodeId: 'video-node',
    sourceAssetId: 'video-asset',
    kind: 'video' as const,
    label: 'Talking head',
    durationSec: 8,
  },
  {
    nodeId: 'product-node',
    sourceAssetId: 'product-asset',
    kind: 'image' as const,
    label: 'Product still',
  },
  {
    nodeId: 'logo-node',
    sourceAssetId: 'logo-asset',
    kind: 'image' as const,
    label: 'Logo',
  },
  {
    nodeId: 'voiceover-node',
    sourceAssetId: 'voiceover-asset',
    kind: 'audio' as const,
    label: 'Voiceover',
    durationSec: 6,
  },
];

describe('projectTimelineDocumentToEditorProjectV2', () => {
  test('projects the current timeline without creating a second canonical store', () => {
    const document = timelineFixture();
    const original = structuredClone(document);
    const input = {
      document,
      pool: canvasPool,
      sourceScope: 'canvas' as const,
      projectId: 'canvas-room-1',
      sequenceId: 'editor-node-1',
      title: 'AI UGC product spot',
    };

    const first = projectTimelineDocumentToEditorProjectV2(input);
    const second = projectTimelineDocumentToEditorProjectV2(input);

    expect(first).toEqual(second);
    expect(document).toEqual(original);
    expect(first.project.schemaVersion).toBe(2);
    expect(first.project.legacyTimelineFingerprint).toBe(first.project.fingerprint);
    expect(first.project.createdAt).toBe('1970-01-01T00:00:00.000Z');
    expect(first.project.durationSec).toBe(5.5);
    expect(first.project.tracks.map((track) => track.kind)).toEqual([
      'video',
      'audio',
      'overlay',
      'audio',
      'overlay',
      'text',
      'caption',
    ]);
  });

  test('projects absolute-time music and voiceover lanes as typed V2 audio tracks', () => {
    const { project } = projectTimelineDocumentToEditorProjectV2({
      document: timelineFixture(),
      pool: canvasPool,
      sourceScope: 'canvas',
      projectId: 'canvas-room-1',
    });
    const voiceoverTrack = project.tracks.find(
      (track) => track.id === 'canvas-room-1:main:audio:voiceover-lane',
    );
    const voiceover = voiceoverTrack?.kind === 'audio' ? voiceoverTrack.clips[0] : undefined;

    expect(voiceover).toMatchObject({
      timelineStartSec: 0.75,
      durationSec: 3,
      sourceInSec: 0.5,
      volume: 0.7,
      fadeInSec: 0.2,
      fadeOutSec: 0.4,
      source: {
        sourceType: 'canvas_node',
        nodeId: 'voiceover-node',
        assetId: 'voiceover-asset',
      },
    });
  });

  test('preserves Canvas node identity and associated Library asset identity', () => {
    const { project } = projectTimelineDocumentToEditorProjectV2({
      document: timelineFixture(),
      pool: canvasPool,
      sourceScope: 'canvas',
      projectId: 'canvas-room-1',
    });
    const videoTrack = project.tracks.find((track) => track.kind === 'video');
    const video = videoTrack?.kind === 'video' ? videoTrack.clips[0] : undefined;

    expect(video?.source).toEqual({
      sourceType: 'canvas_node',
      nodeId: 'video-node',
      assetId: 'video-asset',
    });
    expect(video?.sourceInSec).toBe(1);
    expect(video?.audioEnabled).toBe(false);

    const audioTrack = project.tracks.find((track) => track.kind === 'audio');
    const audio = audioTrack?.kind === 'audio' ? audioTrack.clips[0] : undefined;
    expect(audio?.source).toEqual(video?.source);
    expect(audio?.volume).toBe(0.8);
    expect(audio?.fadeInSec).toBe(0.25);
    expect(audio?.fadeOutSec).toBe(0.5);
  });

  test('uses Library asset refs rather than treating asset ids as Canvas nodes', () => {
    const document: TimelineDocument = {
      items: [
        {
          id: 'library-video-item',
          order: 0,
          sourceNodeId: 'library-asset-1',
          kind: 'video',
          trimEndSec: 3,
        },
      ],
    };
    const { project } = projectTimelineDocumentToEditorProjectV2({
      document,
      pool: [
        {
          nodeId: 'library-asset-1',
          sourceAssetId: 'library-asset-1',
          kind: 'video',
          label: 'Library video',
          durationSec: 3,
        },
      ],
      sourceScope: 'library',
      projectId: 'library-draft-1',
    });
    const videoTrack = project.tracks.find((track) => track.kind === 'video');
    const video = videoTrack?.kind === 'video' ? videoTrack.clips[0] : undefined;

    expect(video?.source).toEqual({
      sourceType: 'library_asset',
      assetId: 'library-asset-1',
    });
  });

  test('maps overlays, captions, markers, transitions, text, and export settings', () => {
    const { project, warnings } = projectTimelineDocumentToEditorProjectV2({
      document: timelineFixture(),
      pool: canvasPool,
      sourceScope: 'canvas',
      projectId: 'canvas-room-1',
      revision: 42,
    });

    expect(project.revision).toBe(42);
    expect(project.exportSettings).toMatchObject({
      presetId: 'vertical-1080',
      width: 1080,
      height: 1920,
      format: 'mp4',
      videoCodec: 'h264',
      captionMode: 'burn_in',
    });
    expect(project.markers.map((marker) => marker.timeSec)).toEqual([1.25, 4.2]);
    expect(project.transitions).toMatchObject([
      {
        fromClipId: 'video-item',
        toClipId: 'image:still-item',
        transitionType: 'crossfade',
        durationSec: 0.5,
      },
    ]);

    const overlayTracks = project.tracks.filter((track) => track.kind === 'overlay');
    expect(overlayTracks.flatMap((track) => track.clips.map((clip) => clip.source))).toContainEqual(
      {
        sourceType: 'canvas_node',
        nodeId: 'logo-node',
        assetId: 'logo-asset',
      },
    );
    const textTrack = project.tracks.find((track) => track.kind === 'text');
    expect(textTrack?.kind === 'text' ? textTrack.clips[0]?.text : undefined).toBe(
      'Meet your new favorite',
    );
    const captionTrack = project.tracks.find((track) => track.kind === 'caption');
    expect(captionTrack?.kind === 'caption' ? captionTrack.clips[0]?.text : undefined).toBe(
      'This works',
    );
    expect(warnings).toEqual([]);
  });

  test('content-addresses the fallback revision and reports missing pool sources', () => {
    const first = projectTimelineDocumentToEditorProjectV2({
      document: timelineFixture(),
      pool: canvasPool.slice(0, 2),
      sourceScope: 'canvas',
      projectId: 'canvas-room-1',
    });
    const changed = timelineFixture();
    changed.markers = [...(changed.markers ?? []), 5];
    const second = projectTimelineDocumentToEditorProjectV2({
      document: changed,
      pool: canvasPool.slice(0, 2),
      sourceScope: 'canvas',
      projectId: 'canvas-room-1',
    });

    expect(first.project.fingerprint).not.toBe(second.project.fingerprint);
    expect(first.project.revision).not.toBe(second.project.revision);
    expect(first.warnings).toContain('Timeline source "logo-node" is absent from the media pool.');
  });
});

// The projection is one half of a pair: `clipEffectSpecFromEditorClip` in
// `lib/client-render/executors/timelineEditor.ts` reads these instances back. Before
// this wave neither half existed for chroma/tint/corners, so an effect the renderer
// implements was dropped the moment a timeline became a durable project.
describe('effect instances that used to be dropped', () => {
  function withEffects(effects: Record<string, unknown>): TimelineDocument {
    const document = timelineFixture();
    return {
      ...document,
      items: [{ ...document.items[0], effects: effects as never }, document.items[1]],
    };
  }

  function videoEffectsOf(document: TimelineDocument) {
    const { project } = projectTimelineDocumentToEditorProjectV2({
      document,
      pool: canvasPool,
      sourceScope: 'canvas',
      projectId: 'canvas-room-1',
    });
    const track = project.tracks.find((candidate) => candidate.kind === 'video');
    return track?.kind === 'video' ? track.clips[0].effects : [];
  }

  test('projects a chroma key with the parameters chromaKeyImageData consumes', () => {
    const effects = videoEffectsOf(
      withEffects({ chromaKey: { color: '#00ff00', tolerance: 0.4, softness: 0.15 } }),
    );
    const chroma = effects.find((effect) => effect.effectType === 'chroma_key');
    expect(chroma).toBeDefined();
    expect(chroma?.enabled).toBe(true);
    expect(chroma?.parameters).toEqual({ color: '#00ff00', tolerance: 0.4, softness: 0.15 });
  });

  test('projects a tint and a corner radius as custom instances', () => {
    const effects = videoEffectsOf(
      withEffects({ tint: { color: '#ff0000', amount: 0.35 }, cornerRadiusFrac: 0.2 }),
    );
    const tint = effects.find((effect) => effect.effectId === 'tint');
    expect(tint?.parameters).toEqual({ color: '#ff0000', amount: 0.35 });
    const corner = effects.find((effect) => effect.effectId === 'corner_radius');
    expect(corner?.parameters).toEqual({ radiusFrac: 0.2 });
  });

  test('clamps the projected corner radius the way the draw does', () => {
    const effects = videoEffectsOf(withEffects({ cornerRadiusFrac: 4 }));
    expect(effects.find((effect) => effect.effectId === 'corner_radius')?.parameters).toEqual({
      radiusFrac: 0.5,
    });
  });

  test('omits a tint at amount 0 and a zero corner radius', () => {
    const effects = videoEffectsOf(
      withEffects({ tint: { color: '#ff0000', amount: 0 }, cornerRadiusFrac: 0 }),
    );
    expect(effects.find((effect) => effect.effectId === 'tint')).toBeUndefined();
    expect(effects.find((effect) => effect.effectId === 'corner_radius')).toBeUndefined();
  });

  test('still projects the colour look alongside a key, not instead of it', () => {
    const effects = videoEffectsOf(
      withEffects({
        filterPreset: 'noir',
        chromaKey: { color: '#0000ff', tolerance: 0.2, softness: 0 },
      }),
    );
    expect(effects.map((effect) => effect.effectType).sort()).toEqual([
      'chroma_key',
      'color_adjustment',
    ]);
  });

  test('emits nothing for a clip with no effects at all', () => {
    const document = timelineFixture();
    const bare: TimelineDocument = {
      ...document,
      items: [{ ...document.items[0], effects: undefined }, document.items[1]],
    };
    expect(videoEffectsOf(bare)).toEqual([]);
  });
});

describe('the export quality ladder rides the preset id', () => {
  test('scales videoBitrateKbps without a second document field', () => {
    const document = timelineFixture();
    const bitrateFor = (exportPresetId: string): number =>
      projectTimelineDocumentToEditorProjectV2({
        document: { ...document, exportPresetId },
        pool: canvasPool,
        sourceScope: 'canvas',
        projectId: 'canvas-room-1',
      }).project.exportSettings.videoBitrateKbps;

    const standard = bitrateFor('vertical-1080');
    expect(bitrateFor('vertical-1080@high')).toBeGreaterThan(standard);
    expect(bitrateFor('vertical-1080@compact')).toBeLessThan(standard);
  });

  test('keeps the bare geometry id in exportSettings.presetId', () => {
    const { project } = projectTimelineDocumentToEditorProjectV2({
      document: { ...timelineFixture(), exportPresetId: 'square-1080@high' },
      pool: canvasPool,
      sourceScope: 'canvas',
      projectId: 'canvas-room-1',
    });
    expect(project.exportSettings.presetId).toBe('square-1080');
    expect(project.exportSettings.width).toBe(1080);
  });
});
