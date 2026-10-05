import { expect, test } from 'bun:test';
import { editorCaptionWordsWithText, editorClipAtSpeed } from './editor-clip-edits';
import { editorAudioClipSchema } from './editor-project-v2';

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
