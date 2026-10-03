import { describe, expect, test } from 'bun:test';
import type { EditorCaptionClip, EditorTrack, EditorVideoClip } from '@continuum/contracts';
import {
  captionClipWithStyle,
  captionCueDrafts,
  clipWithEffectSpec,
  inspectorSpecFor,
} from './WorkspaceInspector';

const clip: EditorVideoClip = {
  id: 'v1',
  name: 'Shot',
  timelineStartSec: 2,
  durationSec: 4,
  enabled: true,
  locked: false,
  tags: [],
  kind: 'video',
  source: { sourceType: 'library_asset', assetId: 'a1', renditionId: 'r1' },
  sourceInSec: 1,
  playbackRate: 1,
  reverse: false,
  transform: {
    position: { x: 0.6, y: 0.4, unit: 'normalized' },
    scaleX: -1.5,
    scaleY: 0.75,
    rotationDeg: 10,
    rotateXDeg: 20,
    rotateYDeg: 0,
    perspective: 2,
    anchorX: 0.25,
    anchorY: 0.5,
    opacity: 0.8,
  },
  crop: { left: 0.1, top: 0, right: 0, bottom: 0.2 },
  blendMode: 'screen',
  audioEnabled: true,
  effects: [
    {
      id: 'stab',
      effectType: 'stabilize',
      effectId: 'stabilize',
      enabled: true,
      mix: 1,
      parameters: {},
    },
    {
      id: 'v1:effect:look',
      effectType: 'color_adjustment',
      effectId: 'vivid',
      enabled: true,
      mix: 1,
      parameters: { filterPreset: 'vivid', brightness: 1.2 },
    },
    {
      id: 'v1:effect:tint',
      effectType: 'custom',
      effectId: 'tint',
      enabled: true,
      mix: 1,
      parameters: { color: '#ff0000', amount: 0.3 },
    },
  ],
  keyframes: [
    { id: 'o0', property: 'transform.opacity', timeSec: 0, value: 0, interpolation: 'linear' },
    { id: 'o1', property: 'transform.opacity', timeSec: 2, value: 1, interpolation: 'linear' },
  ],
};

describe('visual clip ↔ effect spec', () => {
  test('legacy flip controls round-trip and can remove a canonical negative scale', () => {
    const spec = inspectorSpecFor(clip);
    expect(spec.flipH).toBe(true);
    expect(spec.transform?.scaleX).toBe(1.5);
    const next = clipWithEffectSpec(clip, { ...spec, flipH: false }, false);
    expect([next.transform.scaleX, next.transform.scaleY]).toEqual([1.5, 0.75]);
  });

  test('an untouched spec writes the clip back unchanged', () => {
    expect(clipWithEffectSpec(clip, inspectorSpecFor(clip), false)).toEqual(clip);
  });

  test('scale keeps the shape, flip, tilt, crop and effects the spec cannot see', () => {
    const spec = inspectorSpecFor(clip);
    const next = clipWithEffectSpec(
      clip,
      { ...spec, transform: { ...spec.transform, scale: 3 } },
      false,
    );
    expect([next.transform.scaleX, next.transform.scaleY]).toEqual([-3, 1.5]);
    expect(next.transform.rotateXDeg).toBe(20);
    expect(next.transform.anchorX).toBe(0.25);
    expect(next.crop).toEqual(clip.crop);
    expect(next.effects.map((effect) => effect.effectId)).toEqual(['stabilize', 'vivid', 'tint']);
  });

  test('constant speed keeps the source span and stretches keyframes with it', () => {
    const next = clipWithEffectSpec(
      { ...clip, volume: 0.6, fadeInSec: 2, fadeOutSec: 3 },
      { ...inspectorSpecFor(clip), speed: 2 },
      false,
    );
    expect([next.volume, next.fadeInSec, next.fadeOutSec]).toEqual([0.6, 1, 1.5]);
    expect([next.playbackRate, next.durationSec, next.sourceInSec]).toEqual([2, 2, 1]);
    expect(next.keyframes.map((keyframe) => keyframe.timeSec)).toEqual([0, 1]);
  });

  test('Ken Burns on adds motion keyframes; off removes only them', () => {
    const spec = inspectorSpecFor(clip);
    expect(spec.kenBurns).toBeUndefined();
    const on = clipWithEffectSpec(
      clip,
      { ...spec, kenBurns: { from: { scale: 1 }, to: { scale: 1.2 } } },
      true,
    );
    const scaleStops = on.keyframes.filter((keyframe) => keyframe.property === 'transform.scaleY');
    expect(scaleStops.map((keyframe) => keyframe.timeSec)).toEqual([0, 4]);
    expect(scaleStops[0].value).toBe(1.5);
    expect(scaleStops[1].value as number).toBeCloseTo(1.8);
    expect(inspectorSpecFor(on).kenBurns).toBeDefined();
    const off = clipWithEffectSpec(on, { ...inspectorSpecFor(on), kenBurns: undefined }, true);
    expect(off.keyframes).toEqual(clip.keyframes);
  });
});

const caption = (id: string, startSec: number, words: [string, string]): EditorCaptionClip => ({
  id,
  timelineStartSec: startSec,
  durationSec: 1,
  enabled: true,
  locked: false,
  tags: [],
  kind: 'caption',
  text: words.join(' '),
  language: 'en',
  words: [
    { text: words[0], startSec: 0, endSec: 0.5 },
    { text: words[1], startSec: 0.5, endSec: 1 },
  ],
  style: {
    fontFamily: 'Inter',
    fontSizePx: 100,
    fontWeight: 700,
    italic: false,
    underline: false,
    alignment: 'center',
    color: '#ffffff',
    outlineWidthPx: 0,
    shadowBlurPx: 0,
    lineHeight: 1.2,
    trackingEm: 0,
  },
  transform: clip.transform,
  highlightMode: 'word',
});

describe('caption cues → track drafts', () => {
  const [first, second, third] = [
    caption('c1', 0, ['hello', 'there']),
    caption('c2', 1, ['general', 'kenobi']),
    caption('c3', 2, ['you are', 'bold']),
  ];
  const track = {
    id: 'captions',
    name: 'Captions',
    order: 3,
    enabled: true,
    locked: false,
    muted: false,
    solo: false,
    kind: 'caption',
    clips: [first, second, third],
  } satisfies Extract<EditorTrack, { kind: 'caption' }>;
  // The editor works in timeline seconds; stored words count from the clip's start.
  const cueOf = (entry: EditorCaptionClip) => ({
    id: entry.id,
    startSec: entry.timelineStartSec,
    endSec: entry.timelineStartSec + entry.durationSec,
    words: entry.words.map((word) => ({
      ...word,
      startSec: entry.timelineStartSec + word.startSec,
      endSec: entry.timelineStartSec + word.endSec,
    })),
  });

  test('only the changed cue is rewritten; a dropped cue is removed', () => {
    const edited = {
      ...cueOf(first),
      words: [{ text: 'howdy', startSec: 0, endSec: 0.4, emphasis: true }],
    };
    const drafts = captionCueDrafts(track, [edited, cueOf(second)]);
    expect(drafts.map((draft) => draft.commandType)).toEqual(['upsert_clip', 'remove_clip']);
    const [upsert, remove] = drafts;
    if (upsert.commandType !== 'upsert_clip' || upsert.clip.kind !== 'caption') throw new Error();
    expect(upsert.clip.text).toBe('howdy');
    expect(upsert.clip.words).toEqual([
      { text: 'howdy', startSec: 0, endSec: 0.4, emphasis: true },
    ]);
    expect(remove).toEqual({ commandType: 'remove_clip', trackId: 'captions', clipId: 'c3' });
  });
});

test('caption style edits persist their requested highlight colour', () => {
  const caption = {
    id: 'cue',
    kind: 'caption',
    highlightMode: 'word',
    text: 'Hello',
    timelineStartSec: 0,
    durationSec: 1,
    words: [],
    style: {
      fontFamily: 'Inter',
      fontSizePx: 60,
      color: '#ffffff',
      fontWeight: 700,
      outlineWidthPx: 0,
    },
    transform: { position: { x: 0.5, y: 0.8, unit: 'normalized' } },
  } as unknown as EditorCaptionClip;
  expect(
    captionClipWithStyle(
      caption,
      {
        textColor: '#ffffff',
        highlightColor: '#20ff60',
        outlineColor: '#000000',
        fontSizeFrac: 0.055,
        outlineWidthFrac: 0.18,
      },
      1920,
    ).highlightColor,
  ).toBe('#20ff60');
});
