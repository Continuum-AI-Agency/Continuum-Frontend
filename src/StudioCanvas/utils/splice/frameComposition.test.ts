import { describe, expect, test } from 'bun:test';
import { drawFrameComposition } from './frameComposition';

describe('drawFrameComposition', () => {
  test('draws base, overlays, color transition, then captions', async () => {
    const order: string[] = [];
    await drawFrameComposition({
      drawBase: () => order.push('base-visual-and-text'),
      drawOverlays: async () => {
        await Promise.resolve();
        order.push('overlays');
      },
      drawColorTransition: () => order.push('color-transition'),
      drawCaption: () => order.push('caption'),
    });
    expect(order).toEqual(['base-visual-and-text', 'overlays', 'color-transition', 'caption']);
  });

  test('keeps captions topmost when optional color treatment is absent', async () => {
    const order: string[] = [];
    await drawFrameComposition({
      drawBase: () => order.push('overlap-base-layers'),
      drawOverlays: () => order.push('overlays'),
      drawCaption: () => order.push('caption'),
    });
    expect(order).toEqual(['overlap-base-layers', 'overlays', 'caption']);
  });
});
