import { describe, expect, it } from 'bun:test';
import { mayKeepInKnowledge, splitVisualAssets, visualAssetKind } from './visualAssets';

const file = (name: string, type = '') => new File(['x'], name, { type });

describe('visualAssetKind', () => {
  it('names fonts, SVGs and raster images, by type or by extension', () => {
    expect(visualAssetKind(file('Brand-Bold.ttf'))).toBe('font');
    expect(visualAssetKind(file('Brand.woff2', 'font/woff2'))).toBe('font');
    expect(visualAssetKind(file('logo.svg'))).toBe('svg');
    expect(visualAssetKind(file('logo', 'image/svg+xml'))).toBe('svg');
    expect(visualAssetKind(file('team.png', 'image/png'))).toBe('image');
  });

  it('leaves documents alone', () => {
    expect(visualAssetKind(file('guidelines.pdf', 'application/pdf'))).toBeNull();
    expect(visualAssetKind(file('brief.docx'))).toBeNull();
  });
});

describe('splitVisualAssets', () => {
  it('holds visual files back and lets documents through, in order', () => {
    const pdf = file('a.pdf', 'application/pdf');
    const font = file('b.otf');
    const png = file('c.png', 'image/png');
    expect(splitVisualAssets([pdf, font, png])).toEqual({ documents: [pdf], visual: [font, png] });
  });
});

describe('mayKeepInKnowledge', () => {
  it('only a raster image may stay in Knowledge', () => {
    expect(mayKeepInKnowledge(file('c.png', 'image/png'))).toBe(true);
    expect(mayKeepInKnowledge(file('logo.svg'))).toBe(false);
    expect(mayKeepInKnowledge(file('b.ttf'))).toBe(false);
  });
});
