import { describe, expect, it } from 'bun:test';
import type { BrandMdTokens, BrandReportResult } from '@continuum/contracts';

import { resolveColorTokens, resolveFontTokens } from './brandBookIdentity';

// Only the website palette/typography path is read at runtime; cast minimal
// fixtures rather than assembling a full composite.
const compositeWith = (palette: unknown, typography: unknown): BrandReportResult =>
  ({ structured: { website: { palette, typography } } }) as unknown as BrandReportResult;

const tokensWith = (colors: unknown[], typography: unknown[]): BrandMdTokens =>
  ({ colors, typography }) as unknown as BrandMdTokens;

describe('resolveColorTokens', () => {
  it('promotes the onboarding-scraped website.palette to color tokens, skipping empty slots', () => {
    const composite = compositeWith(
      {
        primary: '#1a73e8',
        secondary: '#5c6370',
        accent: null,
        background: '#f8f8f6',
        text: '#141413',
      },
      null,
    );
    expect(resolveColorTokens(null, composite)).toEqual([
      { value: '#1a73e8', role: 'primary', name: 'Primary' },
      { value: '#5c6370', role: 'secondary', name: 'Secondary' },
      { value: '#f8f8f6', role: 'background', name: 'Background' },
      { value: '#141413', role: 'text', name: 'Text' },
    ]);
  });

  it('prefers canonical brand_tokens.colors when present (no fallback)', () => {
    const tokens = tokensWith([{ value: '#111111', role: 'primary' }], []);
    const composite = compositeWith({ primary: '#999999' }, null);
    expect(resolveColorTokens(tokens, composite)).toEqual([{ value: '#111111', role: 'primary' }]);
  });

  it('returns [] when neither tokens nor a scraped palette exist', () => {
    expect(resolveColorTokens(null, compositeWith(null, null))).toEqual([]);
    expect(resolveColorTokens(null, null)).toEqual([]);
    expect(resolveColorTokens(tokensWith([], []), compositeWith(null, null))).toEqual([]);
  });
});

describe('resolveFontTokens', () => {
  it('maps website.typography {primary,secondary} to display + body typefaces', () => {
    const composite = compositeWith(null, { primary: 'Graphik', secondary: 'Georgia' });
    expect(resolveFontTokens(null, composite)).toEqual([
      { family: 'Graphik', role: 'display' },
      { family: 'Georgia', role: 'body' },
    ]);
  });

  it('prefers canonical brand_tokens.typography when present', () => {
    const tokens = tokensWith([], [{ family: 'Inter', role: 'display' }]);
    expect(resolveFontTokens(tokens, compositeWith(null, { primary: 'Georgia' }))).toEqual([
      { family: 'Inter', role: 'display' },
    ]);
  });

  it('returns [] when no typography is available', () => {
    expect(resolveFontTokens(null, compositeWith(null, null))).toEqual([]);
    expect(resolveFontTokens(null, null)).toEqual([]);
  });
});
