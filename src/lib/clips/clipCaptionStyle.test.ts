import { describe, expect, it } from 'bun:test';

import { buildCaptionStyle, DEFAULT_CAPTION_STYLE } from './clipCaptionStyle';

describe('buildCaptionStyle', () => {
  it('returns the default style for null/empty brand', () => {
    expect(buildCaptionStyle(null)).toEqual(DEFAULT_CAPTION_STYLE);
    expect(buildCaptionStyle({ colors: [], typography: { primary: null } })).toEqual(
      DEFAULT_CAPTION_STYLE,
    );
  });

  it("uses the brand's first valid hex as the highlight, keeps white text + black outline", () => {
    const style = buildCaptionStyle({
      colors: ['#1e90ff', '#000000'],
      typography: { primary: null },
    });
    expect(style.highlightColor).toBe('#1e90ff');
    expect(style.textColor).toBe('#ffffff');
    expect(style.outlineColor).toBe('#000000');
  });

  it('normalizes a 3-digit hex and skips invalid color tokens', () => {
    const style = buildCaptionStyle({ colors: ['nope', '#0a0'], typography: { primary: null } });
    expect(style.highlightColor).toBe('#00aa00');
  });

  it('falls back to the default highlight when the brand primary is too pale to read', () => {
    const style = buildCaptionStyle({ colors: ['#fefefe'], typography: { primary: null } });
    expect(style.highlightColor).toBe(DEFAULT_CAPTION_STYLE.highlightColor);
  });

  it('passes the brand display font family through (best-effort), even without a usable color', () => {
    expect(buildCaptionStyle({ colors: [], typography: { primary: 'Inter' } })).toEqual({
      ...DEFAULT_CAPTION_STYLE,
      fontFamily: 'Inter',
    });
    expect(
      buildCaptionStyle({ colors: ['#1e90ff'], typography: { primary: '  Poppins  ' } }).fontFamily,
    ).toBe('Poppins');
  });
});
