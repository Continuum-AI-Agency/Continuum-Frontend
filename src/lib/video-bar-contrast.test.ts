import { describe, expect, test } from 'bun:test';

import { contrastFor, corsReadable, cssLuminance, pictureRect } from './video-bar-contrast';

describe('contrastFor', () => {
  test('a dark band keeps white controls and lightens the gradient', () => {
    expect(contrastFor(0.1, false)).toEqual({ invert: false, wash: 0.35 });
    expect(contrastFor(0, false)).toEqual({ invert: false, wash: 0.35 });
  });

  test('a bright band inverts the bar and lightens the gradient', () => {
    expect(contrastFor(0.9, false)).toEqual({ invert: true, wash: 0.35 });
    expect(contrastFor(1, true)).toEqual({ invert: true, wash: 0.35 });
  });

  test('the pivot keeps the full gradient', () => {
    expect(contrastFor(0.52, false).wash).toBeCloseTo(1);
    expect(contrastFor(0.52, true).wash).toBeCloseTo(1);
  });

  test('between the thresholds the bar keeps the state it has', () => {
    for (const luminance of [0.46, 0.5, 0.55, 0.58]) {
      expect(contrastFor(luminance, false).invert).toBe(false);
      expect(contrastFor(luminance, true).invert).toBe(true);
    }
  });

  test('crossing a threshold flips the bar', () => {
    expect(contrastFor(0.59, false).invert).toBe(true);
    expect(contrastFor(0.45, true).invert).toBe(false);
  });
});

describe('pictureRect', () => {
  const box = { x: 0, y: 0, w: 1600, h: 900 };

  test('contain letterboxes a portrait clip in a landscape box', () => {
    expect(pictureRect(box, 1080, 1920, 'contain')).toEqual({
      x: (1600 - 506.25) / 2,
      y: 0,
      w: 506.25,
      h: 900,
    });
  });

  test('cover overflows the box on the cropped axis', () => {
    const rect = pictureRect(box, 1080, 1920, 'cover');
    expect(rect.w).toBe(1600);
    expect(rect.h).toBeCloseTo(1600 * (1920 / 1080));
    expect(rect.y).toBeCloseTo((900 - rect.h) / 2);
  });

  test('fill, or a clip with no size yet, is the box itself', () => {
    expect(pictureRect(box, 1080, 1920, 'fill')).toEqual(box);
    expect(pictureRect(box, 0, 0, 'contain')).toEqual(box);
  });
});

describe('corsReadable', () => {
  const storage = 'https://abc.supabase.co';

  test('reads Storage, same-origin paths and blobs', () => {
    expect(corsReadable('https://abc.supabase.co/storage/v1/object/sign/x.mp4?token=t', storage)).toBe(
      true,
    );
    expect(corsReadable('/api/media/x.mp4', storage)).toBe(true);
    expect(corsReadable('blob:https://app.trycontinuum.ai/5f2c', storage)).toBe(true);
  });

  test('leaves every other host unsampled', () => {
    expect(corsReadable('https://scontent.cdninstagram.com/v/x.mp4', storage)).toBe(false);
    expect(corsReadable('//cdn.example.com/x.mp4', storage)).toBe(false);
    expect(corsReadable('https://other.supabase.co/storage/v1/x.mp4', storage)).toBe(false);
  });

  test('no source, no Storage URL, or an unparseable source is unreadable', () => {
    expect(corsReadable(undefined, storage)).toBe(false);
    expect(corsReadable('https://abc.supabase.co/x.mp4', undefined)).toBe(false);
    expect(corsReadable('not a url', storage)).toBe(false);
  });
});

describe('cssLuminance', () => {
  test('reads computed rgb and rgba colours', () => {
    expect(cssLuminance('rgb(0, 0, 0)')).toBe(0);
    expect(cssLuminance('rgb(255, 255, 255)')).toBeCloseTo(1);
    // The light theme's --muted, which repaints Loomix's black letterbox.
    expect(cssLuminance('rgb(238, 236, 252)')).toBeCloseTo(0.93, 2);
    expect(cssLuminance('rgba(255, 255, 255, 0.5)')).toBeCloseTo(0.5);
    expect(cssLuminance('rgb(255 255 255 / 50%)')).toBeCloseTo(0.5);
  });

  test('a colour it cannot read counts as black', () => {
    expect(cssLuminance('transparent')).toBe(0);
    expect(cssLuminance('lab(2.75 0 0)')).toBe(0);
  });
});
