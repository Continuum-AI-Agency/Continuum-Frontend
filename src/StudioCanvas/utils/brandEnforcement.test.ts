import { describe, expect, it } from 'bun:test';

import { brandMdTokensSchema } from '@continuum/contracts';
import {
  brandBookAvailability,
  effectiveBrandBookPieces,
  enforcedConcretePieces,
  groundingChipLabel,
  isBrandEnforced,
  isEntireBookEnforced,
  isPieceEnforced,
  toggleBrandPiece,
} from './brandEnforcement';

describe('effective / enforced helpers', () => {
  it('treats undefined as the whole book (default-on)', () => {
    expect(effectiveBrandBookPieces(undefined)).toEqual(['full']);
    expect(isBrandEnforced(undefined)).toBe(true);
    expect(isEntireBookEnforced(undefined)).toBe(true);
  });

  it('treats an explicit empty array as off', () => {
    expect(isBrandEnforced([])).toBe(false);
    expect(isEntireBookEnforced([])).toBe(false);
  });

  it('recognizes an explicit all-concrete list as the entire book', () => {
    expect(
      isEntireBookEnforced([
        'colors',
        'typography',
        'voice',
        'imagery',
        'personality',
        'audience',
        'logo',
      ]),
    ).toBe(true);
  });

  it('isPieceEnforced covers full and single pieces', () => {
    expect(isPieceEnforced(['full'], 'colors')).toBe(true);
    expect(isPieceEnforced(['colors'], 'colors')).toBe(true);
    expect(isPieceEnforced(['colors'], 'voice')).toBe(false);
  });

  it('enforcedConcretePieces expands full', () => {
    expect(enforcedConcretePieces(['full'])).toHaveLength(7);
    expect(enforcedConcretePieces(['colors', 'voice'])).toEqual(['colors', 'voice']);
  });
});

describe('toggleBrandPiece', () => {
  it('turns the whole book off then on via the full toggle', () => {
    expect(toggleBrandPiece(['full'], 'full')).toEqual([]);
    expect(toggleBrandPiece([], 'full')).toEqual(['full']);
  });

  it('unchecking one piece from full drops to the other six', () => {
    const next = toggleBrandPiece(['full'], 'logo');
    expect(next).not.toContain('logo');
    expect(next).toEqual(['colors', 'typography', 'voice', 'imagery', 'personality', 'audience']);
  });

  it('re-adding the last piece normalizes back to full', () => {
    const six: any = ['colors', 'typography', 'voice', 'imagery', 'personality', 'audience'];
    expect(toggleBrandPiece(six, 'logo')).toEqual(['full']);
  });

  it('adds a single piece to an empty (off) selection', () => {
    expect(toggleBrandPiece([], 'colors')).toEqual(['colors']);
  });
});

describe('brandBookAvailability', () => {
  it('reports which pieces the brand carries', () => {
    const tokens = brandMdTokensSchema.parse({
      schema_version: 1,
      brand_name: 'Pizza Test',
      colors: [{ value: '#0a1f44', role: 'primary' }],
      typography: [],
      logo: { storage_path: 'x/logo.png', treatment_default: 'logo' },
      voice: { tone: 'confident', power_verbs: [], banned_words: [] },
      imagery: null,
      personality: null,
      audience: null,
    });
    const availability = brandBookAvailability(tokens);
    expect(availability.colors).toBe(true);
    expect(availability.logo).toBe(true);
    expect(availability.voice).toBe(true);
    expect(availability.typography).toBe(false);
    expect(availability.imagery).toBe(false);
    expect(availability.full).toBe(true);
  });

  it('reports nothing available for null tokens', () => {
    const availability = brandBookAvailability(null);
    expect(availability.full).toBe(false);
    expect(availability.colors).toBe(false);
  });
});

describe('groundingChipLabel', () => {
  it('shows "Brand" for the default-on whole book with no skills', () => {
    // undefined pieces = default-ON entire book (how an untagged gen node starts).
    expect(groundingChipLabel(undefined, 0)).toBe('Brand');
  });

  it('shows the concrete count for a partial book', () => {
    expect(groundingChipLabel(['voice', 'colors'], 0)).toBe('Brand 2');
  });

  it('joins brand and skills when both are present', () => {
    expect(groundingChipLabel(['voice', 'colors'], 2)).toBe('Brand 2 · Skills 2');
    expect(groundingChipLabel(['full'], 3)).toBe('Brand · Skills 3');
  });

  it('shows only skills when brand enforcement is explicitly off', () => {
    expect(groundingChipLabel([], 2)).toBe('Skills 2');
  });

  it('shows "Off" when nothing is enforced', () => {
    expect(groundingChipLabel([], 0)).toBe('Off');
  });
});
