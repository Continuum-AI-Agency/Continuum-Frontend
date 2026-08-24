import { describe, expect, it } from 'bun:test';

import {
  type GeneratorNodeBounds,
  generatorNodeStyle,
  getAspectRatioValue,
  IMAGE_GENERATOR_NODE_BOUNDS,
  LAYER_EDITOR_NODE_BOUNDS,
  OMNI_GENERATOR_NODE_BOUNDS,
  simplifyAspectRatio,
  snapNodeDimensionsToAspectRatio,
  VIDEO_GENERATOR_NODE_BOUNDS,
} from './node-sizing';

const ENVELOPES: Array<[string, GeneratorNodeBounds]> = [
  ['image', IMAGE_GENERATOR_NODE_BOUNDS],
  ['video', VIDEO_GENERATOR_NODE_BOUNDS],
  ['omni', OMNI_GENERATOR_NODE_BOUNDS],
];

const RATIOS = ['16:9', '9:16', '1:1', '4:5', '5:4', '4:3', '3:4', '2:3', '3:2', '21:9'];

const snapWith = (
  bounds: GeneratorNodeBounds,
  aspectRatio: string,
  width: number,
  height: number,
) =>
  snapNodeDimensionsToAspectRatio({
    aspectRatio,
    currentWidth: width,
    currentHeight: height,
    minWidth: bounds.minWidth,
    minHeight: bounds.minHeight,
    fallbackWidth: bounds.fallbackWidth,
  });

describe('generatorNodeStyle — the box a generator node is BORN with', () => {
  it('keeps the historical 16:9 box for the image family', () => {
    expect(generatorNodeStyle('16:9', IMAGE_GENERATOR_NODE_BOUNDS)).toEqual({
      width: 400,
      height: 225,
    });
  });

  it('keeps the historical 16:9 box for the video family', () => {
    expect(generatorNodeStyle('16:9', VIDEO_GENERATOR_NODE_BOUNDS)).toEqual({
      width: 512,
      height: 288,
    });
  });

  it('turns a 9:16 selection into a PORTRAIT box, not the landscape default', () => {
    expect(generatorNodeStyle('9:16', IMAGE_GENERATOR_NODE_BOUNDS)).toEqual({
      width: 225,
      height: 400,
    });
    // The video family clamps to its own 300px minimum width, so the portrait box is
    // 300x533 rather than 288x512 — still 9:16 to within a pixel.
    expect(generatorNodeStyle('9:16', VIDEO_GENERATOR_NODE_BOUNDS)).toEqual({
      width: 300,
      height: 533,
    });
  });

  it('turns 1:1 into a square and 4:5 into a portrait for every envelope', () => {
    for (const [name, bounds] of ENVELOPES) {
      const square = generatorNodeStyle('1:1', bounds);
      expect(`${name}:${square.width}`).toBe(`${name}:${square.height}`);

      const portrait = generatorNodeStyle('4:5', bounds);
      expect(portrait.width).toBeLessThan(portrait.height);
      expect(portrait.width / portrait.height).toBeCloseTo(0.8, 2);
    }
  });

  it('defaults to the image envelope so an unqualified call is unchanged', () => {
    expect(generatorNodeStyle('9:16')).toEqual(
      generatorNodeStyle('9:16', IMAGE_GENERATOR_NODE_BOUNDS),
    );
  });

  it('renders every ratio at the requested shape and above the family minimums', () => {
    for (const [name, bounds] of ENVELOPES) {
      for (const ratio of RATIOS) {
        const style = generatorNodeStyle(ratio, bounds);
        const context = `${name} ${ratio} -> ${style.width}x${style.height}`;
        expect(style.width, context).toBeGreaterThanOrEqual(bounds.minWidth);
        expect(style.height, context).toBeGreaterThanOrEqual(bounds.minHeight);
        // One whole pixel of rounding slack: a 467x200 box cannot be exactly 21:9.
        expect(
          Math.abs(style.width / style.height - getAspectRatioValue(ratio)) < 0.02,
          context,
        ).toBe(true);
      }
    }
  });
});

describe('snapNodeDimensionsToAspectRatio — area-preserving and idempotent', () => {
  it('preserves the area of the box it came from', () => {
    const next = snapWith(IMAGE_GENERATOR_NODE_BOUNDS, '9:16', 400, 225);
    expect(next.width * next.height).toBeCloseTo(400 * 225, -3);
    expect(next.width / next.height).toBeCloseTo(9 / 16, 2);
  });

  it('grows a tiny box up to the family minimum instead of below it', () => {
    const next = snapWith(VIDEO_GENERATOR_NODE_BOUNDS, '9:16', 10, 10);
    expect(next.width).toBeGreaterThanOrEqual(VIDEO_GENERATOR_NODE_BOUNDS.minWidth);
    expect(next.height).toBeGreaterThanOrEqual(VIDEO_GENERATOR_NODE_BOUNDS.minHeight);
  });

  // An aspect-locked NodeResizer re-snaps on every drag and every ratio change. If
  // snap(snap(x)) !== snap(x) the node drifts a pixel per interaction, so idempotence
  // is the invariant the lock is built on — not a nicety.
  it('is a fixed point: snap(snap(x)) === snap(x)', () => {
    for (const [name, bounds] of ENVELOPES) {
      for (const ratio of RATIOS) {
        for (const width of [1, 120, 300, 400, 512, 777, 1200]) {
          for (const height of [1, 90, 225, 288, 400, 613, 900]) {
            const once = snapWith(bounds, ratio, width, height);
            const twice = snapWith(bounds, ratio, once.width, once.height);
            expect(`${name} ${ratio} ${width}x${height}: ${twice.width}x${twice.height}`).toBe(
              `${name} ${ratio} ${width}x${height}: ${once.width}x${once.height}`,
            );
          }
        }
      }
    }
  });

  it('reads a snapped box back as the ratio that produced it', () => {
    // Whole-pixel boxes cannot always reduce to the ORIGINAL fraction (a 2:3 node lands
    // on 245x367), so the round-trip invariant is numeric: what simplifyAspectRatio
    // reports must describe the same shape the node was asked for.
    for (const ratio of ['16:9', '9:16', '1:1', '4:5', '5:4', '2:3', '3:2']) {
      const style = generatorNodeStyle(ratio, IMAGE_GENERATOR_NODE_BOUNDS);
      const readBack = simplifyAspectRatio(style.width, style.height);
      expect(getAspectRatioValue(readBack)).toBeCloseTo(getAspectRatioValue(ratio), 2);
    }
  });
});

describe('LAYER_EDITOR_NODE_BOUNDS', () => {
  const RATIOS = ['16:9', '9:16', '1:1', '4:5', '21:9'];

  it('carries the frame ratio the layer document is set to', () => {
    for (const ratio of RATIOS) {
      const style = generatorNodeStyle(ratio, LAYER_EDITOR_NODE_BOUNDS);
      expect(getAspectRatioValue(simplifyAspectRatio(style.width, style.height))).toBeCloseTo(
        getAspectRatioValue(ratio),
        2,
      );
    }
  });

  // Same invariant the generator envelopes stand on: an aspect-locked NodeResizer re-snaps
  // on every drag, so a box that moved a pixel per pass would walk across the canvas.
  it('is a fixed point under re-snapping', () => {
    for (const ratio of RATIOS) {
      for (const width of [1, 200, 380, 900]) {
        for (const height of [1, 200, 380, 900]) {
          const options = {
            aspectRatio: ratio,
            minWidth: LAYER_EDITOR_NODE_BOUNDS.minWidth,
            minHeight: LAYER_EDITOR_NODE_BOUNDS.minHeight,
            fallbackWidth: LAYER_EDITOR_NODE_BOUNDS.fallbackWidth,
          };
          const once = snapNodeDimensionsToAspectRatio({
            ...options,
            currentWidth: width,
            currentHeight: height,
          });
          const twice = snapNodeDimensionsToAspectRatio({
            ...options,
            currentWidth: once.width,
            currentHeight: once.height,
          });
          expect(twice, `${ratio} ${width}x${height}`).toEqual(once);
        }
      }
    }
  });
});
