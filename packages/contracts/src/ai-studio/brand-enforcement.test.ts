import { describe, expect, it } from 'bun:test';

import { type BrandMdTokens, brandMdTokensSchema } from '../onboarding/brand-md';
import {
  brandBookPieceKindSchema,
  brandEnforcementSchema,
  DEFAULT_BRAND_BOOK_PIECES,
  expandBrandBookPieces,
  renderForcedBrandBlock,
} from './brand-enforcement';

function makeTokens(overrides: Record<string, unknown> = {}): BrandMdTokens {
  return brandMdTokensSchema.parse({
    schema_version: 1,
    brand_name: 'Pizza Test',
    colors: [
      { value: '#0a1f44', role: 'primary', name: 'Navy' },
      { value: '#f5a623', role: 'accent' },
    ],
    typography: [
      { family: 'Söhne', role: 'display', note: 'Semibold for headlines' },
      { family: 'Inter', role: 'body' },
    ],
    logo: { storage_path: 'brands/pizza/logo.png', treatment_default: 'logo' },
    voice: {
      tone: 'confident',
      style: 'plainspoken',
      power_verbs: ['build', 'ship'],
      banned_words: ['cheap'],
    },
    personality: { archetype: 'The Creator', traits: ['bold'], descriptors: ['modern'] },
    imagery: { creative_direction: ['editorial'], mood: ['warm'], avoid: ['stock photography'] },
    audience: { primary_summary: 'founders scaling teams', anchors: ['trust'] },
    ...overrides,
  });
}

describe('DEFAULT_BRAND_BOOK_PIECES', () => {
  // The value the canvas has always shipped (StudioCanvas/utils/brandEnforcement.ts).
  // It lives here so the Backend can apply it for callers that carry no node — a
  // headless run must not be brand-blind while the canvas is fully enforced.
  it('is the whole brand book', () => {
    expect([...DEFAULT_BRAND_BOOK_PIECES]).toEqual(['full']);
  });

  it('expands to every concrete piece, logo included', () => {
    expect(expandBrandBookPieces([...DEFAULT_BRAND_BOOK_PIECES])).toEqual([
      'colors',
      'typography',
      'voice',
      'imagery',
      'personality',
      'audience',
      'logo',
    ]);
  });
});

describe('expandBrandBookPieces', () => {
  it('expands full to every concrete piece and drops the full sentinel', () => {
    expect(expandBrandBookPieces(['full'])).toEqual([
      'colors',
      'typography',
      'voice',
      'imagery',
      'personality',
      'audience',
      'logo',
    ]);
  });

  it('keeps only requested concrete pieces in canonical order regardless of input order', () => {
    expect(expandBrandBookPieces(['voice', 'colors'])).toEqual(['colors', 'voice']);
  });

  it('returns empty for no pieces', () => {
    expect(expandBrandBookPieces([])).toEqual([]);
  });
});

describe('renderForcedBrandBlock', () => {
  it('filters to only the tagged pieces', () => {
    const { block } = renderForcedBrandBlock(makeTokens(), ['colors']);
    expect(block).toContain('band 1 = primary, Navy');
    expect(block).toContain('band 2 = accent');
    expect(block).not.toContain('Typography');
    expect(block).not.toContain('Voice');
  });

  // The defect this file used to lock in: hex codes went into the prompt as prose and
  // the image model set them as type — creatives shipped with "#eef4f6  #0a2b66" as a
  // headline. The values now travel as a palette-swatch reference image instead, so no
  // machine token may appear in the block at all.
  it('never puts a hex code in the block', () => {
    const { block } = renderForcedBrandBlock(makeTokens(), ['full']);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('names the colour roles so the swatch bands can be told apart', () => {
    const { block } = renderForcedBrandBlock(makeTokens(), ['colors']);
    expect(block).toContain('palette swatch reference');
    expect(block).toContain('band 1 = primary, Navy');
  });

  it('tells the model the block is direction, never text to render', () => {
    const { block } = renderForcedBrandBlock(makeTokens(), ['colors']);
    expect(block).toContain('NEVER text to render');
  });

  it('wraps the block in an authoritative must-comply envelope', () => {
    const { block } = renderForcedBrandBlock(makeTokens(), ['voice']);
    expect(
      block.startsWith('<brand_book>(authoritative brand rules — the generation MUST comply;'),
    ).toBe(true);
    expect(block.endsWith('</brand_book>')).toBe(true);
    expect(block).toContain(
      'Voice — Tone: confident. Style: plainspoken. Power verbs: build, ship. Never use: cheap.',
    );
  });

  // Font FAMILIES leaked exactly like hex did — "IBM Plex Mono" turned up set into the
  // artwork. A named licensed face is not something an image model can honour anyway, so
  // only the semantic description survives.
  it('describes typography by role and note, never by family name', () => {
    const { block } = renderForcedBrandBlock(makeTokens(), ['typography']);
    expect(block).toContain('Typography: display — Semibold for headlines; body.');
    expect(block).not.toContain('Söhne');
    expect(block).not.toContain('Inter');
  });

  it('renders every piece for full and reports wantsLogo when a logo path exists', () => {
    const { block, wantsLogo } = renderForcedBrandBlock(makeTokens(), ['full']);
    expect(wantsLogo).toBe(true);
    for (const marker of [
      'Colors',
      'Typography',
      'Voice',
      'Visual direction',
      'Personality',
      'Audience',
      'Logo',
    ]) {
      expect(block).toContain(marker);
    }
  });

  it('does not want the logo when it is tagged but no logo path exists', () => {
    const { block, wantsLogo } = renderForcedBrandBlock(makeTokens({ logo: null }), ['logo']);
    expect(wantsLogo).toBe(false);
    expect(block).toBe('');
  });

  it('returns an empty block when tagged pieces carry no data', () => {
    const bare = makeTokens({ colors: [], typography: [], voice: null, imagery: null });
    const { block, wantsLogo } = renderForcedBrandBlock(bare, ['colors', 'voice', 'imagery']);
    expect(block).toBe('');
    expect(wantsLogo).toBe(false);
  });
});

describe('schemas', () => {
  it('brandEnforcementSchema defaults pieces to an empty array', () => {
    expect(brandEnforcementSchema.parse({})).toEqual({ pieces: [] });
  });

  it('brandBookPieceKindSchema rejects unknown kinds', () => {
    expect(brandBookPieceKindSchema.safeParse('mascot').success).toBe(false);
  });
});
