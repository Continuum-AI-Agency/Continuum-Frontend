import { expect, test } from 'bun:test';
import {
  editorAudioFadeGainAt,
  editorCaptionWordsWithText,
  editorClipAtSourceIn,
  editorClipAtSpeed,
  editorClipRateAt,
  editorClipSourceAt,
  editorClipSourceSpan,
  editorClipWindow,
  editorClipWithLocalFades,
  editorClipWithRetainedFades,
  editorTimeRemapRateAt,
} from './editor-clip-edits';
import {
  editorAudioClipSchema,
  editorNestedSequenceClipSchema,
  editorVideoClipSchema,
} from './editor-project-v2';

test('composition speed retains child span, complete own curves and independent parent clocks', () => {
  const clip = editorNestedSequenceClipSchema.parse({
    id: 'group',
    kind: 'nested_sequence',
    sequenceId: 'child',
    timelineStartSec: 2,
    durationSec: 3,
    sourceInSec: 1,
    playbackRate: 1,
    keyframeOffsetSec: 0.5,
    parentClipId: 'driver',
    keyframes: [
      {
        id: 'before',
        property: 'transform.opacity',
        timeSec: 0,
        value: 0.2,
        interpolation: 'linear',
      },
      { id: 'after', property: 'audio.volume', timeSec: 5, value: 0.8, interpolation: 'linear' },
    ],
  });
  const sped = editorNestedSequenceClipSchema.parse(editorClipAtSpeed(clip, 2));
  expect(sped.durationSec * sped.playbackRate).toBe(clip.durationSec * clip.playbackRate);
  expect(sped.sourceInSec).toBe(1);
  expect(sped.keyframeOffsetSec).toBe(0.25);
  expect(sped.parentClipId).toBe('driver');
  expect(sped.keyframes.map((key) => key.timeSec)).toEqual([0, 2.5]);
  expect(sped.audioEnabled).toBe(true);
  expect('audioFadeClock' in sped).toBe(false);
});

test('speed keeps source span and scales keyframes, fades and automation together', () => {
  const clip = editorAudioClipSchema.parse({
    id: 'sound',
    kind: 'audio',
    timelineStartSec: 3,
    durationSec: 8,
    sourceInSec: 2,
    source: { sourceType: 'library_asset', assetId: 'a' },
    fadeInSec: 2,
    fadeOutSec: 4,
    keyframes: [
      { id: 'gain', property: 'audio.volume', timeSec: 6, value: 0.5, interpolation: 'linear' },
    ],
  });
  const next = editorClipAtSpeed(clip, 2);
  expect(next.durationSec * next.playbackRate).toBe(8);
  expect(next.sourceInSec).toBe(2);
  expect(next.keyframes[0].timeSec).toBe(3);
  expect([next.fadeInSec, next.fadeOutSec]).toEqual([1, 2]);
  expect(() => editorClipAtSpeed(clip, 0)).toThrow();
  // Reverse is a direction, not a rate: the same source span plays backwards in half the time.
  const reversed = editorClipAtSpeed({ ...clip, reverse: true }, 2);
  expect([reversed.reverse, reversed.durationSec, reversed.sourceInSec]).toEqual([true, 4, 2]);
  // A remap curve carries its own rate; a constant speed would silently flatten it.
  expect(() =>
    editorClipAtSpeed(
      {
        ...clip,
        durationSec: 2,
        timeRemap: [
          { timeSec: 0, sourceSec: 2, interpolation: 'linear' },
          { timeSec: 2, sourceSec: 3, interpolation: 'linear' },
        ],
      },
      2,
    ),
  ).toThrow('speed-ramped or frozen');
});

test('caption spelling keeps timing and metadata and refuses an implicit realignment', () => {
  const words = [
    { text: 'Apollo', startSec: 0.2, endSec: 0.8, confidence: 0.9, emphasis: true },
    { text: 'eleven', startSec: 1.1, endSec: 1.6 },
  ];
  expect(editorCaptionWordsWithText(words, 'Apollo 11')).toEqual([
    { ...words[0] },
    { ...words[1], text: '11' },
  ]);
  expect(() => editorCaptionWordsWithText(words, 'Apollo mission eleven')).toThrow();
});

test('speed scales present video fades and preserves absence in legacy video documents', () => {
  const clip = editorVideoClipSchema.parse({
    id: 'v',
    kind: 'video',
    timelineStartSec: 0,
    durationSec: 8,
    source: { sourceType: 'library_asset', assetId: 'a' },
  });
  const unchanged = editorClipAtSpeed(clip, 2);
  expect('fadeInSec' in unchanged).toBe(false);
  expect('fadeOutSec' in unchanged).toBe(false);
  const edited = editorClipAtSpeed({ ...clip, volume: 0.6, fadeInSec: 2, fadeOutSec: 4 }, 2);
  expect(edited).toMatchObject({ volume: 0.6, durationSec: 4, fadeInSec: 1, fadeOutSec: 2 });
});

test('start trims and extensions retain the automation clock in output seconds', () => {
  const clip = editorVideoClipSchema.parse({
    id: 'trim-clock',
    kind: 'video',
    timelineStartSec: 0,
    durationSec: 4,
    source: { sourceType: 'library_asset', assetId: 'a' },
    sourceInSec: 3,
    playbackRate: 2,
    keyframes: [
      { id: 'key', property: 'transform.opacity', timeSec: 1, value: 0.5, interpolation: 'linear' },
    ],
  });
  expect(editorVideoClipSchema.parse(editorClipAtSourceIn(clip, 5)).keyframeOffsetSec).toBe(1);
  expect(editorVideoClipSchema.parse(editorClipAtSourceIn(clip, 1)).keyframeOffsetSec).toBe(-1);
  expect(editorClipAtSpeed({ ...clip, keyframeOffsetSec: 2 }, 4).keyframeOffsetSec).toBe(1);
});

test('retained fade clocks survive source trim, speed and explicit local reauthoring', () => {
  const original = editorAudioClipSchema.parse({
    id: 'fade',
    kind: 'audio',
    timelineStartSec: 0,
    durationSec: 10,
    source: { sourceType: 'library_asset', assetId: 'a' },
    fadeInSec: 8,
    fadeOutSec: 7,
  });
  const trimmed = editorAudioClipSchema.parse({
    ...editorClipAtSourceIn(original, 4),
    durationSec: 2,
  });
  expect(trimmed.audioFadeClock).toEqual({ offsetSec: 4, durationSec: 10 });
  const sped = editorAudioClipSchema.parse(editorClipAtSpeed(trimmed, 2));
  expect(sped.audioFadeClock).toEqual({ offsetSec: 2, durationSec: 5 });
  for (const edge of ['in', 'out'] as const) {
    expect(editorAudioFadeGainAt(trimmed, 0.5, edge)).toBeCloseTo(
      editorAudioFadeGainAt(original, 4.5, edge),
      10,
    );
    expect(editorAudioFadeGainAt(sped, 0.25, edge)).toBeCloseTo(
      editorAudioFadeGainAt(trimmed, 0.5, edge),
      10,
    );
  }
  const authored = editorAudioClipSchema.parse(
    editorClipWithLocalFades(trimmed, { fadeInSec: 0.5 }),
  );
  expect(authored.audioFadeClock).toBeUndefined();
  expect([authored.fadeInSec, authored.fadeOutSec]).toEqual([0.5, 2]);
  expect(
    editorClipWithRetainedFades({ ...original, fadeInSec: 0, fadeOutSec: 0 }),
  ).not.toHaveProperty('audioFadeClock');
  expect(() =>
    editorAudioClipSchema.parse({
      ...trimmed,
      audioFadeClock: { offsetSec: NaN, durationSec: 10 },
    }),
  ).toThrow();
});

const ramp = [
  { timeSec: 0, sourceSec: 10, interpolation: 'linear' as const },
  { timeSec: 1, sourceSec: 11, interpolation: 'linear' as const },
  { timeSec: 3, sourceSec: 11.4, interpolation: 'linear' as const },
  { timeSec: 4, sourceSec: 12.4, interpolation: 'linear' as const },
];

test('the source clock answers for constant rate, reverse and a remap curve alike', () => {
  const plain = { durationSec: 4, sourceInSec: 10, playbackRate: 2 };
  expect(editorClipSourceAt(plain, 1.5)).toBe(13);
  expect(editorClipRateAt(plain, 1.5)).toBe(2);
  expect(editorClipSourceSpan(plain)).toEqual({ startSec: 10, endSec: 18 });
  const reversed = { ...plain, reverse: true };
  expect(editorClipSourceAt(reversed, 0)).toBe(18);
  expect(editorClipSourceAt(reversed, 4)).toBe(10);
  expect(editorClipRateAt(reversed, 1)).toBe(-2);
  const remapped = { durationSec: 4, timeRemap: ramp };
  expect(editorClipSourceAt(remapped, 0.5)).toBe(10.5);
  // 20% in the middle, normal either side.
  expect(editorClipRateAt(remapped, 2)).toBeCloseTo(0.2, 9);
  expect(editorClipRateAt(remapped, 3.5)).toBe(1);
  expect(editorClipSourceAt(remapped, 99)).toBe(12.4);
  expect(editorClipSourceSpan(remapped)).toEqual({ startSec: 10, endSec: 12.4 });
});

test('a hold segment freezes the frame and a smoothstep segment eases both ends', () => {
  const held = [
    { timeSec: 0, sourceSec: 1, interpolation: 'hold' as const },
    { timeSec: 2, sourceSec: 5, interpolation: 'linear' as const },
  ];
  expect(editorClipSourceAt({ durationSec: 2, timeRemap: held }, 1.9)).toBe(1);
  expect(editorClipRateAt({ durationSec: 2, timeRemap: held }, 1)).toBe(0);
  const eased = [
    { timeSec: 0, sourceSec: 0, interpolation: 'bezier' as const },
    { timeSec: 2, sourceSec: 2, interpolation: 'linear' as const },
  ];
  expect(editorTimeRemapRateAt(eased, 0)).toBeCloseTo(0, 9);
  expect(editorTimeRemapRateAt(eased, 1)).toBeCloseTo(1.5, 9);
  expect(editorClipSourceAt({ durationSec: 2, timeRemap: eased }, 1)).toBeCloseTo(1, 9);
});

test('a window re-bases a clip so each piece shows exactly the frames it did', () => {
  const remapped = { durationSec: 4, timeRemap: ramp };
  const right = editorClipWindow(remapped, 2, 4);
  expect(right.durationSec).toBe(2);
  expect(right.timeRemap?.[0]).toEqual({ timeSec: 0, sourceSec: 11.2, interpolation: 'linear' });
  for (const local of [0, 0.5, 1, 1.5, 2])
    expect(editorClipSourceAt(right, local)).toBeCloseTo(
      editorClipSourceAt(remapped, 2 + local),
      9,
    );
  const left = editorClipWindow(remapped, 0, 2);
  for (const local of [0, 0.5, 1, 1.5, 2])
    expect(editorClipSourceAt(left, local)).toBeCloseTo(editorClipSourceAt(remapped, local), 9);
  const reversed = { durationSec: 4, sourceInSec: 10, playbackRate: 2, reverse: true };
  const tail = editorClipWindow(reversed, 3, 4);
  expect(tail.sourceInSec).toBe(10);
  expect(editorClipSourceAt(tail, 0)).toBe(editorClipSourceAt(reversed, 3));
  const bezier = [
    { timeSec: 0, sourceSec: 0, interpolation: 'bezier' as const },
    { timeSec: 4, sourceSec: 4, interpolation: 'linear' as const },
  ];
  const middle = editorClipWindow({ durationSec: 4, timeRemap: bezier }, 1, 3);
  for (const local of [0, 0.4, 1, 1.6, 2])
    expect(editorClipSourceAt(middle, local)).toBeCloseTo(
      editorClipSourceAt({ durationSec: 4, timeRemap: bezier }, 1 + local),
      1,
    );
  expect(() => editorClipWindow(remapped, 3, 3)).toThrow('inside the clip');
});

test('a clip schema holds a remap curve to the clip: start 0, end at the duration, no rate beside it', () => {
  const base = {
    id: 'v',
    kind: 'video',
    timelineStartSec: 0,
    durationSec: 4,
    source: { sourceType: 'library_asset', assetId: 'a' },
    sourceInSec: 10,
  };
  expect(editorVideoClipSchema.parse({ ...base, timeRemap: ramp }).timeRemap).toHaveLength(4);
  expect(editorVideoClipSchema.parse({ ...base, timeRemap: [] }).timeRemap).toEqual([]);
  const bad = (patch: object) => editorVideoClipSchema.safeParse({ ...base, ...patch });
  expect(bad({ timeRemap: ramp.slice(0, 3) }).success).toBe(false);
  expect(bad({ timeRemap: ramp.slice(1) }).success).toBe(false);
  expect(bad({ timeRemap: [ramp[0]] }).success).toBe(false);
  expect(bad({ timeRemap: ramp, playbackRate: 2 }).success).toBe(false);
  expect(bad({ timeRemap: ramp, reverse: true }).success).toBe(false);
  expect(bad({ timeRemap: [ramp[0], ramp[0], ramp[3]] }).success).toBe(false);
});
