import { describe, expect, test } from 'bun:test';
import {
  animationIdFor,
  animationPreviewLayer,
  drawPreviewFrame,
  templateLines,
  templatePreviewLayers,
} from './textPreview';

/** A 2D context that records what the caption renderer paints; everything else is a no-op. */
function recordingContext() {
  const painted: string[] = [];
  const target = {
    painted,
    font: '',
    measureText: (text: string) => ({
      width: text.length * 10,
      fontBoundingBoxAscent: 8,
      fontBoundingBoxDescent: 2,
    }),
    fillText: (text: string) => painted.push(text),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
  };
  const context = new Proxy(target, {
    get: (object, key) => (key in object ? object[key as keyof typeof object] : () => undefined),
    set: (object, key, value) => Reflect.set(object, key, value),
  });
  return { context: context as unknown as CanvasRenderingContext2D, painted };
}

describe('template preview layers', () => {
  test('each layer becomes a cue on the template clock, styled as the export styles it', () => {
    const [name, role] = templatePreviewLayers('lower_third', {
      text: 'Alex Rivera',
      secondaryText: 'Head coach',
    });
    expect(name?.cue).toMatchObject({ startSec: 0, endSec: 4 });
    expect(name?.cue.words.map((word) => word.text)).toEqual(['Alex', 'Rivera']);
    expect(name?.style).toMatchObject({
      fontSizeFrac: 0.038,
      position: { xFrac: 0.35, yFrac: 0.78 },
      backgroundColor: '#111111',
      backgroundOpacity: 1,
      outlineWidthFrac: 0,
    });
    // The role line waits its delay.
    expect(role?.cue.startSec).toBe(0.2);
    expect(role?.style.outlineWidthFrac).toBeGreaterThan(0);
  });

  test('entrances resolve through the export resolver', () => {
    const [hook] = templatePreviewLayers('hook_title', { text: 'Stop' });
    expect(hook?.style.animation?.kind).toBe('pop');
    expect(hook?.style.uppercase).toBe(true);
  });

  test('a missing second line drops only that layer', () => {
    expect(templatePreviewLayers('lower_third', { text: 'Alex' })).toHaveLength(1);
  });
});

describe('template lines', () => {
  test('typed text wins; empty falls back to the sample; one-line templates take no second', () => {
    expect(templateLines('quote', { text: ' Ship it ', secondaryText: '' })).toEqual({
      text: 'Ship it',
      secondaryText: 'Maya, member',
    });
    expect(templateLines('hook_title', { text: '', secondaryText: 'ignored' })).toEqual({
      text: 'Stop scrolling',
    });
  });
});

describe('animation ids', () => {
  test('stored camel and hyphen ids read as the contract id', () => {
    expect(animationIdFor('scaleIn')).toBe('scale-in');
    expect(animationIdFor('float-in')).toBe('float-in');
    expect(animationIdFor(undefined)).toBe('none');
    expect(animationIdFor('not-a-thing')).toBe('none');
  });

  test('an exit preview carries the animation as the exit', () => {
    const layer = animationPreviewLayer('pop', 'out');
    expect(layer.style.animation).toBeUndefined();
    expect(layer.style.exitAnimation?.kind).toBe('pop');
  });
});

describe('drawPreviewFrame', () => {
  test('paints only the layers live at that time, through the caption renderer', () => {
    const layers = templatePreviewLayers('lower_third', { text: 'Alex', secondaryText: 'Coach' });
    const early = recordingContext();
    drawPreviewFrame(early.context, layers, 0.1, 360, 640);
    expect(early.painted).toEqual(['Alex']);
    const later = recordingContext();
    drawPreviewFrame(later.context, layers, 1, 360, 640);
    expect(later.painted).toEqual(['Alex', 'Coach']);
  });
});
