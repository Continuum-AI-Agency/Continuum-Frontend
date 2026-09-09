import { z } from 'zod';

import type { BrandMdTokens } from '../onboarding/brand-md';

// Brand-book enforcement for AI Studio canvas generation. A generation node is
// tagged with the brand-book PIECES the user wants forced into the prompt; the
// Backend renders those pieces from the brand's BrandMdTokens primitive into an
// authoritative "must comply" block that is appended distinctly to the prompt
// (separate from creative-direction skills). The same renderer feeds the Organic
// creative content agent so both surfaces force brand identity identically.

// The discrete taggable pieces. "imagery" is the visual-direction ("vision")
// piece; "full" expands to every piece (and seeds the logo as a reference image).
export const brandBookPieceKindSchema = z.enum([
  'full',
  'colors',
  'typography',
  'voice',
  'imagery',
  'personality',
  'audience',
  'logo',
]);
export type BrandBookPieceKind = z.infer<typeof brandBookPieceKindSchema>;

/**
 * What a generation enforces when NOBODY made a choice: the whole brand book.
 *
 * Enforcement is default-ON, and the two states are distinguishable — `undefined`
 * means "unspecified, apply this default"; an explicit `[]` means the user turned
 * enforcement off. The Backend applies this in `resolveBrandEnforcement`, so a
 * surface that simply omits the field (the headless AI Studio runner did, and shipped
 * image generations with no `<brand_book>`, no brand colors and no logo) cannot end
 * up brand-blind while the canvas is fully enforced.
 */
export const DEFAULT_BRAND_BOOK_PIECES: readonly BrandBookPieceKind[] = ['full'];

// Attached to a canvas node / a generation request. A non-empty `pieces` array
// means the node is brand-enforced.
export const brandEnforcementSchema = z.object({
  pieces: z.array(brandBookPieceKindSchema).max(8).default([]),
});
export type BrandEnforcement = z.infer<typeof brandEnforcementSchema>;

// The concrete pieces (never "full") a token block can render, in a fixed order
// so the rendered block is deterministic.
const CONCRETE_PIECES: readonly Exclude<BrandBookPieceKind, 'full'>[] = [
  'colors',
  'typography',
  'voice',
  'imagery',
  'personality',
  'audience',
  'logo',
];

// Expands "full" to every concrete piece and dedupes/orders the result. An empty
// or all-invalid input yields an empty set (caller treats that as "not enforced").
export function expandBrandBookPieces(
  pieces: BrandBookPieceKind[],
): Exclude<BrandBookPieceKind, 'full'>[] {
  if (pieces.includes('full')) return [...CONCRETE_PIECES];
  const wanted = new Set(pieces);
  return CONCRETE_PIECES.filter((piece) => wanted.has(piece));
}

/*
 * A hex code is a MACHINE token, and an image model handed one in prose renders it as
 * prose: creatives shipped with "#eef4f6  #0a2b66" set as the headline. The colours
 * themselves now travel as a palette-swatch reference image (renderPaletteSwatchReference
 * → resolveBrandReferences), which is a visual target the model can actually match, so
 * the text says WHICH ROLE goes where and never repeats the value.
 */
function renderColors(tokens: BrandMdTokens): string | null {
  if (tokens.colors.length === 0) return null;
  const roles = tokens.colors
    .map((color, index) => {
      const qualifier = [color.role, color.name]
        .filter((part): part is string => !!part)
        .join(', ');
      return qualifier ? `band ${index + 1} = ${qualifier}` : `band ${index + 1}`;
    })
    .join('; ');
  return `Colors: use ONLY the ${tokens.colors.length} colours in the attached palette swatch reference, left to right (${roles}). Match them by eye from the swatch.`;
}

/*
 * Font FAMILIES leaked the same way — "IBM Plex Mono", "Instrument Sans" turned up set
 * into the artwork. A named licensed face is not something an image model can honour
 * anyway; it approximates. So the family name is withheld and only the semantic
 * description survives, which is the part that actually steers the render.
 */
function renderTypography(tokens: BrandMdTokens): string | null {
  if (tokens.typography.length === 0) return null;
  const described = tokens.typography
    .map((font) => [font.role, font.note].filter((part): part is string => !!part).join(' — '))
    .filter((part) => part.length > 0);
  if (described.length === 0) return null;
  return `Typography: ${described.join('; ')}.`;
}

function renderVoice(tokens: BrandMdTokens): string | null {
  const voice = tokens.voice;
  if (!voice) return null;
  const parts: string[] = [];
  if (voice.tone) parts.push(`Tone: ${voice.tone}`);
  if (voice.style) parts.push(`Style: ${voice.style}`);
  if (voice.power_verbs.length > 0) parts.push(`Power verbs: ${voice.power_verbs.join(', ')}`);
  if (voice.banned_words.length > 0) parts.push(`Never use: ${voice.banned_words.join(', ')}`);
  return parts.length > 0 ? `Voice — ${parts.join('. ')}.` : null;
}

function renderImagery(tokens: BrandMdTokens): string | null {
  const imagery = tokens.imagery;
  if (!imagery) return null;
  const parts: string[] = [];
  if (imagery.creative_direction.length > 0)
    parts.push(`Visual direction: ${imagery.creative_direction.join('; ')}`);
  if (imagery.mood.length > 0) parts.push(`Mood: ${imagery.mood.join(', ')}`);
  if (imagery.avoid.length > 0) parts.push(`Avoid: ${imagery.avoid.join('; ')}`);
  return parts.length > 0 ? parts.join('. ') + '.' : null;
}

function renderPersonality(tokens: BrandMdTokens): string | null {
  const personality = tokens.personality;
  if (!personality) return null;
  const parts: string[] = [];
  if (personality.archetype) parts.push(`Archetype: ${personality.archetype}`);
  if (personality.traits.length > 0) parts.push(`Traits: ${personality.traits.join(', ')}`);
  if (personality.descriptors.length > 0)
    parts.push(`Descriptors: ${personality.descriptors.join(', ')}`);
  return parts.length > 0 ? `Personality — ${parts.join('. ')}.` : null;
}

function renderAudience(tokens: BrandMdTokens): string | null {
  const audience = tokens.audience;
  if (!audience) return null;
  const parts: string[] = [];
  if (audience.primary_summary) parts.push(audience.primary_summary);
  if (audience.anchors.length > 0) parts.push(`Anchors: ${audience.anchors.join(', ')}`);
  return parts.length > 0 ? `Audience: ${parts.join('. ')}.` : null;
}

function renderLogo(tokens: BrandMdTokens): string | null {
  return tokens.logo?.storage_path
    ? 'Logo: include the brand logo (provided as a reference image).'
    : null;
}

const PIECE_RENDERERS: Record<
  Exclude<BrandBookPieceKind, 'full'>,
  (tokens: BrandMdTokens) => string | null
> = {
  colors: renderColors,
  typography: renderTypography,
  voice: renderVoice,
  imagery: renderImagery,
  personality: renderPersonality,
  audience: renderAudience,
  logo: renderLogo,
};

export interface ForcedBrandBlock {
  // The authoritative "<brand_book>…</brand_book>" prompt block for the tagged
  // pieces, or "" when no tagged piece carries any data.
  block: string;
  // True when the logo piece was tagged AND a logo path exists — the caller
  // signs it into the generation as a reference image.
  wantsLogo: boolean;
  // The tagged pieces that actually rendered a non-empty line (in fixed order).
  // Callers that treat certain pieces as REQUIRED (e.g. the organic media path
  // requires colors/typography/imagery) diff this against what they tagged to
  // detect a silently-dropped piece instead of shipping a partial block.
  renderedPieces: Exclude<BrandBookPieceKind, 'full'>[];
}

// Pure (no I/O): renders the tagged brand-book pieces of a fully-resolved
// BrandMdTokens primitive into an authoritative forced block. Only pieces that
// were tagged AND carry data appear; an empty result means "nothing to force".
export function renderForcedBrandBlock(
  tokens: BrandMdTokens,
  pieces: BrandBookPieceKind[],
): ForcedBrandBlock {
  const concrete = expandBrandBookPieces(pieces);
  const renderedPieces: Exclude<BrandBookPieceKind, 'full'>[] = [];
  const lines = concrete
    .filter((piece) => piece !== 'logo')
    .map((piece) => {
      const line = PIECE_RENDERERS[piece](tokens);
      if (line !== null) renderedPieces.push(piece);
      return line;
    })
    .filter((line): line is string => line !== null);

  const wantsLogo = concrete.includes('logo') && !!tokens.logo?.storage_path;
  const logoLine = wantsLogo ? renderLogo(tokens) : null;
  if (logoLine) {
    lines.push(logoLine);
    renderedPieces.push('logo');
  }

  if (lines.length === 0) return { block: '', wantsLogo, renderedPieces };

  // The block is DIRECTION, never copy. Without saying so, models set the rules
  // themselves into the artwork — which is how hex codes became headlines.
  const block = `<brand_book>(authoritative brand rules — the generation MUST comply; these are instructions, NEVER text to render. Never draw hex codes, colour names, font names, or any of this wording into the image.)\n${lines.join('\n')}\n</brand_book>`;
  return { block, wantsLogo, renderedPieces };
}
