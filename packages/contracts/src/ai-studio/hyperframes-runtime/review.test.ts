import { describe, expect, it } from 'bun:test';
import { isShownCopy } from './review';

const shown = { display: 'block', visibility: 'visible', opacity: '1' };
const box = { width: 400, height: 80 };

describe('isShownCopy', () => {
  it('measures copy the viewer can see', () => {
    expect(isShownCopy([shown, shown], box)).toBe(true);
  });

  it('skips copy in a scene that is off its window, however the scene hides it', () => {
    expect(isShownCopy([shown, { ...shown, opacity: '0' }], box)).toBe(false);
    expect(isShownCopy([shown, { ...shown, visibility: 'hidden' }], box)).toBe(false);
    expect(isShownCopy([shown, { ...shown, display: 'none' }], box)).toBe(false);
    expect(isShownCopy([{ ...shown, opacity: '0.6' }, { ...shown, opacity: '0.6' }], box)).toBe(
      false,
    );
    expect(isShownCopy([shown], { width: 0, height: 0 })).toBe(false);
  });
});
