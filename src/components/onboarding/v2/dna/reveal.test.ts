import { describe, expect, it } from 'bun:test';
import { deriveRevealedPalette, deriveRevealedTypography, provenanceOf } from './reveal';

describe('deriveRevealedTypography', () => {
  it('returns both slots even when only one family was read', () => {
    const rows = deriveRevealedTypography({ primary: 'Publico', secondary: null }, 'site analysis');
    expect(rows.map((row) => row.family)).toEqual(['Publico', null]);
    expect(rows[0].provenance).toEqual({ read: true, source: 'site analysis' });
    expect(rows[1].provenance).toEqual({ read: false, source: null });
  });

  it('treats a blank family as empty rather than as a name', () => {
    const rows = deriveRevealedTypography({ primary: '   ', secondary: null }, 'site analysis');
    expect(rows[0].family).toBeNull();
    expect(rows[0].provenance.read).toBe(false);
  });
});

describe('deriveRevealedPalette', () => {
  it('keeps the recorded role and restates it as the rule', () => {
    const rows = deriveRevealedPalette([], { primary: '#101010', accent: '#ffaa1c' });
    expect(rows).toEqual([
      { hex: '#101010', role: 'primary', rule: 'Read from the site as the primary colour.' },
      { hex: '#ffaa1c', role: 'accent', rule: 'Read from the site as the accent colour.' },
    ]);
  });

  it('invents no rule for a bare hex list', () => {
    const rows = deriveRevealedPalette(['#101010', '#ffaa1c'], null);
    expect(rows.every((row) => row.rule === null && row.role === null)).toBe(true);
  });
});

describe('provenanceOf', () => {
  it('reads a non-blank value and empties everything else', () => {
    expect(provenanceOf('a summary', 'brand analysis').read).toBe(true);
    expect(provenanceOf('   ', 'brand analysis').read).toBe(false);
    expect(provenanceOf([], 'brand analysis').read).toBe(false);
    expect(provenanceOf(['#fff'], 'brand analysis').read).toBe(true);
    expect(provenanceOf(null, 'brand analysis').read).toBe(false);
  });
});
