import { describe, expect, test } from 'bun:test';
import { editorTextClipSchema } from '@continuum/contracts';
import { textCueFor } from '@/lib/client-render/executors/timelineEditor';

const clip = editorTextClipSchema.parse({
  id: 'text-1',
  kind: 'text',
  timelineStartSec: 2,
  durationSec: 3,
  text: 'Slide me in',
  style: {
    fontFamily: 'Inter',
    fontSizePx: 96,
    fontWeight: 800,
    color: '#ffffff',
    outlineColor: '#000000',
    outlineWidthPx: 6,
  },
  transform: {
    position: { x: 0.5, y: 0.3, unit: 'normalized' },
    scaleX: 1,
    scaleY: 1,
    rotationDeg: 0,
    rotateXDeg: 0,
    rotateYDeg: 0,
    perspective: 0,
    anchorX: 0.5,
    anchorY: 0.5,
    opacity: 1,
  },
  animationIn: 'pop',
  keyframes: [
    { id: 'k0', property: 'transform.opacity', timeSec: 0, value: 0, interpolation: 'linear' },
    { id: 'k1', property: 'transform.opacity', timeSec: 1, value: 1, interpolation: 'linear' },
  ],
});

describe('textCueFor', () => {
  test('a text clip becomes the cue the export draws: timing, look, entrance, keyframes', () => {
    const cue = textCueFor(clip, 1920);
    expect(cue).toMatchObject({ id: 'text-1', startSec: 2, endSec: 5 });
    expect(cue.words.map((word) => word.text)).toEqual(['Slide', 'me', 'in']);
    expect(cue.style).toMatchObject({
      fontSizeFrac: 96 / 1920,
      outlineWidthFrac: 6 / 96,
      highlightColor: '#ffffff',
      position: { xFrac: 0.5, yFrac: 0.3 },
    });
    expect(cue.style?.animation?.kind).toBe('pop');
    // The opacity keys ride along, on the cue's 0–1 clock, for the renderer to sample.
    expect(cue.motion?.motionChannels?.opacity?.map((stop) => [stop.t, stop.value])).toEqual([
      [0, 0],
      [1 / 3, 1],
    ]);
  });
});
