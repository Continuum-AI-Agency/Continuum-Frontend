import { describe, expect, test } from 'bun:test';
import { render } from '@testing-library/react';
import { RatioGlyph, ratioParts } from './RatioGlyph';

describe('RatioGlyph', () => {
  test('reads a ratio label, and anything unreadable as a square', () => {
    expect(ratioParts('9:16')).toEqual([9, 16]);
    expect(ratioParts('1920:1080')).toEqual([1920, 1080]);
    for (const bad of [null, undefined, '', 'wide', '0:9', '16:', '-1:1']) {
      expect(ratioParts(bad)).toEqual([1, 1]);
    }
  });

  test('pins the long side so a tall format draws tall and a wide one wide', () => {
    const { container, rerender } = render(<RatioGlyph ratio="9:16" />);
    const glyph = container.firstElementChild as HTMLElement;
    expect(glyph.className).toContain('h-3');
    expect(glyph.style.aspectRatio).toBe('9 / 16');

    rerender(<RatioGlyph ratio="16:9" />);
    expect((container.firstElementChild as HTMLElement).className).toContain('w-3');
  });
});
