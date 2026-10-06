import { describe, expect, it } from 'bun:test';
import { needsCanvasPreview } from './TimelineShaderPreview';

describe('needsCanvasPreview', () => {
  it('draws a filtered picture through the canvas, like the export decodes it', () => {
    // A <video> shows the browser's display decode; the export draws the Canvas/WebCodecs one.
    // On the recorded NASA interview they differ by 8–13 RGB and a filter's contrast widens it.
    expect(needsCanvasPreview({ filterPreset: 'vintage', filterStrength: 0.6 })).toBe(true);
    expect(needsCanvasPreview({ adjustments: { contrast: 1.2 } })).toBe(true);
  });

  it('leaves an untouched picture on the native video element', () => {
    expect(needsCanvasPreview(undefined)).toBe(false);
    expect(needsCanvasPreview({})).toBe(false);
    expect(needsCanvasPreview({ filterPreset: 'none' })).toBe(false);
  });
});
