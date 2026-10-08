import { describe, expect, it } from 'bun:test';
import type { BrandBookPieceKind, BrandDirectionPiece } from '@continuum/contracts';

import { brandMdTokensSchema } from '@continuum/contracts';
import {
  brandBookAvailability,
  brandBookMode,
  brandBookModeDetail,
  brandBookModeLabel,
  effectiveBrandBookPieces,
  enforcedConcretePieces,
  groundingChipLabel,
  isBrandEnforced,
  isEntireBookEnforced,
  isPieceEnforced,
  toggleBrandPiece,
  toggleDirectionPiece,
  toggleSkillId,
} from './brandEnforcement';

describe('effective / enforced helpers', () => {
  it('treats undefined as the light canvas book: colors, type, logo (default-on)', () => {
    expect(effectiveBrandBookPieces(undefined)).toEqual(['colors', 'typography', 'logo']);
    expect(isBrandEnforced(undefined)).toBe(true);
    expect(isEntireBookEnforced(undefined)).toBe(false);
    expect(isPieceEnforced(undefined, 'logo')).toBe(true);
    expect(isPieceEnforced(undefined, 'voice')).toBe(false);
  });

  it('keeps an explicit selection as-is, including an explicit full book', () => {
    expect(effectiveBrandBookPieces(['full'])).toEqual(['full']);
    expect(effectiveBrandBookPieces(['voice'])).toEqual(['voice']);
    expect(effectiveBrandBookPieces([])).toEqual([]);
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

  it('clears a partial selection in one click via the full toggle', () => {
    expect(toggleBrandPiece(['colors'], 'full')).toEqual([]);
    expect(toggleBrandPiece(['colors', 'voice'], 'full')).toEqual([]);
  });

  it('turns the default-on (undefined) state off', () => {
    expect(toggleBrandPiece(undefined, 'full')).toEqual([]);
  });

  it('toggles a piece against the light default, not the full book', () => {
    expect(toggleBrandPiece(undefined, 'voice')).toEqual(['colors', 'typography', 'voice', 'logo']);
    expect(toggleBrandPiece(undefined, 'logo')).toEqual(['colors', 'typography']);
  });

  it('unchecking one piece from full drops to the other six', () => {
    const next = toggleBrandPiece(['full'], 'logo');
    expect(next).not.toContain('logo');
    expect(next).toEqual(['colors', 'typography', 'voice', 'imagery', 'personality', 'audience']);
  });

  it('re-adding the last piece normalizes back to full', () => {
    const six: BrandBookPieceKind[] = ['colors', 'typography', 'voice', 'imagery', 'personality', 'audience'];
    expect(toggleBrandPiece(six, 'logo')).toEqual(['full']);
  });

  it('adds a single piece to an empty (off) selection', () => {
    expect(toggleBrandPiece([], 'colors')).toEqual(['colors']);
  });
});

describe('toggleSkillId', () => {
  it('adds a skill to an empty (undefined) selection', () => {
    expect(toggleSkillId(undefined, 'skill-1')).toEqual(['skill-1']);
  });

  it('adds a skill to an existing selection', () => {
    expect(toggleSkillId(['skill-1'], 'skill-2')).toEqual(['skill-1', 'skill-2']);
  });

  it('removes a skill already in the selection', () => {
    expect(toggleSkillId(['skill-1', 'skill-2'], 'skill-1')).toEqual(['skill-2']);
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

describe('brandBookMode', () => {
  it('names the four states the chip can be in', () => {
    expect(brandBookMode(undefined)).toBe('light');
    expect(brandBookMode(['full'])).toBe('full');
    expect(brandBookMode([])).toBe('off');
    expect(brandBookMode(['colors', 'voice'])).toBe('custom');
  });

  it('reads an explicit colors/type/logo pick as Light, in any order', () => {
    expect(brandBookMode(['logo', 'colors', 'typography'])).toBe('light');
  });

  it('reads every concrete piece as Full', () => {
    expect(
      brandBookMode(['colors', 'typography', 'voice', 'imagery', 'personality', 'audience', 'logo']),
    ).toBe('full');
  });

  it('labels and details each mode', () => {
    expect(brandBookModeLabel(undefined)).toBe('Light');
    expect(brandBookModeDetail(undefined)).toBe('colors, type, logo');
    expect(brandBookModeLabel(['full'])).toBe('Full');
    expect(brandBookModeDetail(['full'])).toBe('the whole brand book');
    expect(brandBookModeLabel([])).toBe('Off');
    expect(brandBookModeDetail([])).toBe('no brand guidance');
    expect(brandBookModeLabel(['voice', 'colors'])).toBe('2 pieces');
    expect(brandBookModeDetail(['voice', 'colors'])).toBe('colors, voice');
    expect(brandBookModeLabel(['voice'])).toBe('1 piece');
  });
});

describe('groundingChipLabel', () => {
  it('shows "Brand · Light" for an untouched node with no skills', () => {
    expect(groundingChipLabel(undefined, 0)).toBe('Brand · Light');
  });

  it('shows the full, custom and off states', () => {
    expect(groundingChipLabel(['full'], 0)).toBe('Brand · Full');
    expect(groundingChipLabel(['voice', 'colors'], 0)).toBe('Brand · 2 pieces');
    expect(groundingChipLabel([], 0)).toBe('Brand · Off');
  });

  it('appends skills after the brand mode', () => {
    expect(groundingChipLabel(['voice', 'colors'], 2)).toBe('Brand · 2 pieces · Skills 2');
    expect(groundingChipLabel(['full'], 3)).toBe('Brand · Full · Skills 3');
    expect(groundingChipLabel([], 2)).toBe('Brand · Off · Skills 2');
  });

  it('shows a narrowed creative-direction selection, and stays quiet when there is none', () => {
    // `null` is the tri-state's "no preference" — everything the plan admits — and a badge
    // for it would report a choice the user never made.
    expect(groundingChipLabel(['full'], 0, null)).toBe('Brand · Full');
    expect(groundingChipLabel(['full'], 0, 3)).toBe('Brand · Full · Direction 3');
    // Zero is a real selection: the user switched every authored piece off.
    expect(groundingChipLabel(['full'], 0, 0)).toBe('Brand · Full · Direction 0');
  });
});

/*
 * The compiler half of the control. The tri-state is the whole contract: `undefined` means
 * "no preference", and the trap is that a naive toggle collapses it to a one-element list the
 * first time somebody switches a single piece off.
 */
describe('toggleDirectionPiece', () => {
  const AUTHORED: BrandDirectionPiece[] = [
    'visual-thesis',
    'colour-behaviour',
    'photography',
    'prohibition',
  ];

  it('expands "no preference" to the AUTHORED set before removing one', () => {
    const next = toggleDirectionPiece(undefined, 'photography', AUTHORED);

    expect(next).toEqual(['visual-thesis', 'colour-behaviour', 'prohibition']);
  });

  it('does not expand to the full vocabulary — only what this brand wrote', () => {
    const next = toggleDirectionPiece(undefined, 'photography', AUTHORED);

    expect(next).not.toContain('motion');
    expect(next).not.toContain('typography-behaviour');
  });

  it('adds a piece back', () => {
    const next = toggleDirectionPiece(['visual-thesis'], 'prohibition', AUTHORED);

    expect(next).toEqual(['visual-thesis', 'prohibition']);
  });

  it('keeps authored order, so one set always serialises identically', () => {
    const a = toggleDirectionPiece(['prohibition'], 'visual-thesis', AUTHORED);
    const b = toggleDirectionPiece(['visual-thesis'], 'prohibition', AUTHORED);

    expect(a).toEqual(b);
  });

  it('can reach empty — "no brand direction" is a real selection', () => {
    let selection = toggleDirectionPiece(undefined, 'visual-thesis', AUTHORED);
    for (const piece of ['colour-behaviour', 'photography', 'prohibition'] as const) {
      selection = toggleDirectionPiece(selection, piece, AUTHORED);
    }

    expect(selection).toEqual([]);
  });

  it('ignores a piece this brand has not authored', () => {
    const next = toggleDirectionPiece(undefined, 'motion', AUTHORED);

    /* Turning on something the brand never wrote must not manufacture a selection for it. */
    expect(next).toEqual(AUTHORED);
  });
});
