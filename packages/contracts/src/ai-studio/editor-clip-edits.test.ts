import { expect, test } from 'bun:test';
import {
  editorAudioFadeGainAt,
  editorCaptionWordsWithText,
  editorClipAtSourceIn,
  editorClipAtSpeed,
  editorClipWithLocalFades,
  editorClipWithRetainedFades,
} from './editor-clip-edits';
import { editorAudioClipSchema, editorVideoClipSchema } from './editor-project-v2';

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
  expect(() => editorClipAtSpeed({ ...clip, reverse: true }, 2)).toThrow();
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
