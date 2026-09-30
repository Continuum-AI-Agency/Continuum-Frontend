import { describe, expect, test } from 'bun:test';
import { duckingKeyframes, editorKeyframeSchema, mergeSpeech, VIDEO_EDITOR_OPS } from './index';

describe('ducking a music bed under speech', () => {
  test('close lines join; far ones stay apart', () => {
    expect(
      mergeSpeech(
        [
          { startSec: 5, endSec: 6 },
          { startSec: 1, endSec: 2 },
          { startSec: 2.3, endSec: 3 },
        ],
        0.5,
      ),
    ).toEqual([
      { startSec: 1, endSec: 3 },
      { startSec: 5, endSec: 6 },
    ]);
  });

  test('one line dips the bed with attack and release, clip-local, at its own volume', () => {
    const keyframes = duckingKeyframes({
      clipStartSec: 10,
      clipDurationSec: 20,
      volume: 0.8,
      speech: [{ startSec: 14, endSec: 16 }],
      idPrefix: 'duck',
    });
    for (const keyframe of keyframes) editorKeyframeSchema.parse(keyframe);
    expect(keyframes.map((k) => [k.timeSec, k.value])).toEqual([
      [3.85, 0.8],
      [4, 0.2],
      [6, 0.2],
      [6.35, 0.8],
    ]);
  });

  test('speech at the clip edges clamps inside it; speech outside it adds nothing', () => {
    const edge = duckingKeyframes({
      clipStartSec: 0,
      clipDurationSec: 5,
      volume: 1,
      speech: [{ startSec: 0, endSec: 1 }],
      idPrefix: 'd',
    });
    expect(edge[0]).toMatchObject({ timeSec: 0, value: 0.25 });
    expect(edge.every((k) => k.timeSec >= 0 && k.timeSec <= 5)).toBe(true);
    expect(
      duckingKeyframes({
        clipStartSec: 0,
        clipDurationSec: 5,
        volume: 1,
        speech: [{ startSec: 7, endSec: 8 }],
        idPrefix: 'd',
      }),
    ).toEqual([]);
  });

  test('generate takes the audio and headless quick starts', () => {
    const projectId = '00000000-0000-4000-8000-000000000000';
    expect(
      VIDEO_EDITOR_OPS.generate.input.parse({
        projectId,
        quickStart: 'music_bed',
        prompt: 'warm lo-fi',
      }),
    ).toMatchObject({ duck: true });
    expect(
      VIDEO_EDITOR_OPS.generate.input.parse({
        projectId,
        quickStart: 'voiceover',
        prompt: 'Your first class is free.',
        voice: 'calm, confident',
      }),
    ).toMatchObject({ quickStart: 'voiceover' });
    expect(() =>
      VIDEO_EDITOR_OPS.generate.input.parse({
        projectId,
        quickStart: 'headless_concept',
        concept: 'not-a-concept',
      }),
    ).toThrow();
  });
});
