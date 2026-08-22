// Canvas-side helpers for brand-book and creative-skill enforcement on
// generation nodes. The stored values are `brandBookPieces` and `skillIds` on
// node data; these helpers give brandBookPieces default-ON semantics (undefined
// ⇒ the whole brand book) and the toggle logic the grounding popover uses for
// both. The Backend renders the tagged pieces into an authoritative forced
// block (App/ai-studio/services/brand-enforcement.ts).

import {
  type BrandBookPieceKind,
  type BrandDirectionPiece,
  type BrandMdTokens,
  type DesignSection,
  expandBrandBookPieces,
} from '@continuum/contracts';

// Default-ON: a generation node with no explicit selection enforces the whole
// brand book. An explicit empty array means the user turned enforcement off.
export const DEFAULT_BRAND_BOOK_PIECES: BrandBookPieceKind[] = ['full'];

// The concrete pieces in canonical order (no "full"). Sourced from the contract so
// FE and BE agree on the set.
export const CONCRETE_BRAND_BOOK_PIECES = expandBrandBookPieces(['full']);

// Menu rows for the individual pieces, in the order they render. Each carries a
// short description — what the piece forces into the generation — shown as the
// hover tooltip in the skill/brand menus and in the grounding chip.
export const BRAND_BOOK_PIECE_OPTIONS: {
  kind: BrandBookPieceKind;
  label: string;
  description: string;
}[] = [
  {
    kind: 'colors',
    label: 'Colors',
    description: 'Force the exact brand palette (hex values) into the generation.',
  },
  {
    kind: 'typography',
    label: 'Typography',
    description: 'Reference the brand typefaces so any lettering stays on-brand.',
  },
  {
    kind: 'voice',
    label: 'Voice',
    description: 'Apply the brand tone, style, and power/banned words to any copy.',
  },
  {
    kind: 'imagery',
    label: 'Vision / Imagery',
    description: 'Enforce the visual direction, mood, and things to avoid.',
  },
  {
    kind: 'personality',
    label: 'Personality',
    description: 'Carry the brand archetype, traits, and descriptors.',
  },
  {
    kind: 'audience',
    label: 'Audience',
    description: 'Ground the output in the primary audience and anchors.',
  },
  {
    kind: 'logo',
    label: 'Logo',
    description: 'Attach the brand logo as a reference image for the generation.',
  },
];

// Label for a piece kind (including the "full" sentinel), for badges and tooltips.
export const BRAND_BOOK_PIECE_LABELS: Record<BrandBookPieceKind, string> = {
  full: 'Entire brand book',
  colors: 'Colors',
  typography: 'Typography',
  voice: 'Voice',
  imagery: 'Vision / Imagery',
  personality: 'Personality',
  audience: 'Audience',
  logo: 'Logo',
};

// Compact one-line summary of a node's grounding for the chip label, e.g.
// "Brand · Skills 2" (entire book), "Brand 3 · Skills 2" (partial), "Skills 2"
// (brand off), or "Off" (nothing enforced). Pure — unit tested.
/**
 * The label on the Style control.
 *
 * "Style" rather than "Brand": what this control governs is how the output LOOKS, and the
 * brand book is one of three sources feeding that — alongside creative direction and
 * creative skills. Naming it after one of its inputs made the other two look like
 * unrelated settings that happened to share a popover.
 *
 * `directionCount` is `null` when the caller expressed no preference, which is the
 * tri-state's "everything the plan admits" and needs no badge. A number means the user
 * narrowed it, and a narrowing nobody can see is a control nobody trusts.
 */
export function groundingChipLabel(
  pieces: BrandBookPieceKind[] | undefined,
  skillCount: number,
  directionCount: number | null = null,
): string {
  const brandPart = isEntireBookEnforced(pieces)
    ? 'Style'
    : isBrandEnforced(pieces)
      ? `Style ${enforcedConcretePieces(pieces).length}`
      : null;
  const directionPart = directionCount === null ? null : `Direction ${directionCount}`;
  const skillPart = skillCount > 0 ? `Skills ${skillCount}` : null;
  const parts = [brandPart, directionPart, skillPart].filter(
    (part): part is string => part !== null,
  );
  return parts.length > 0 ? parts.join(' · ') : 'Off';
}

export function effectiveBrandBookPieces(
  pieces: BrandBookPieceKind[] | undefined,
): BrandBookPieceKind[] {
  return pieces ?? DEFAULT_BRAND_BOOK_PIECES;
}

export function isBrandEnforced(pieces: BrandBookPieceKind[] | undefined): boolean {
  return effectiveBrandBookPieces(pieces).length > 0;
}

// True when every concrete piece is covered — either via the "full" sentinel or an
// explicit list of all pieces.
export function isEntireBookEnforced(pieces: BrandBookPieceKind[] | undefined): boolean {
  const effective = effectiveBrandBookPieces(pieces);
  if (effective.includes('full')) return true;
  return CONCRETE_BRAND_BOOK_PIECES.every((kind) => effective.includes(kind));
}

export function isPieceEnforced(
  pieces: BrandBookPieceKind[] | undefined,
  kind: BrandBookPieceKind,
): boolean {
  if (kind === 'full') return isEntireBookEnforced(pieces);
  const effective = effectiveBrandBookPieces(pieces);
  return effective.includes('full') || effective.includes(kind);
}

// The concrete pieces currently enforced (expanding "full"), for badge summaries.
export function enforcedConcretePieces(
  pieces: BrandBookPieceKind[] | undefined,
): BrandBookPieceKind[] {
  return expandBrandBookPieces(effectiveBrandBookPieces(pieces));
}

export type BrandPieceAvailability = Record<BrandBookPieceKind, boolean>;

// Which pieces the brand actually carries — drives disabling menu rows the brand
// has not built yet, so the UI can nudge the user to finish their brand book.
export function brandBookAvailability(
  tokens: BrandMdTokens | null | undefined,
): BrandPieceAvailability {
  const concrete = {
    colors: !!tokens && tokens.colors.length > 0,
    typography: !!tokens && tokens.typography.length > 0,
    voice: !!tokens?.voice,
    imagery: !!tokens?.imagery,
    personality: !!tokens?.personality,
    audience: !!tokens?.audience,
    logo: !!tokens?.logo?.storage_path,
  };
  return { full: Object.values(concrete).some(Boolean), ...concrete };
}

// Pure toggle used by the grounding popover. "full" is the master switch —
// enforcement on in any form (whole book OR a partial selection) turns it all off,
// so the user can always clear in one click; off turns the whole book on. Toggling
// a concrete piece expands the current selection to concrete pieces, flips that
// one, and re-normalizes to "full" when all are selected.
export function toggleBrandPiece(
  pieces: BrandBookPieceKind[] | undefined,
  kind: BrandBookPieceKind,
): BrandBookPieceKind[] {
  if (kind === 'full') {
    return isBrandEnforced(pieces) ? [] : DEFAULT_BRAND_BOOK_PIECES;
  }

  const effective = effectiveBrandBookPieces(pieces);
  const concrete = new Set(
    effective.includes('full')
      ? CONCRETE_BRAND_BOOK_PIECES
      : effective.filter((piece) => piece !== 'full'),
  );

  if (concrete.has(kind)) concrete.delete(kind);
  else concrete.add(kind);

  const next = CONCRETE_BRAND_BOOK_PIECES.filter((piece) => concrete.has(piece));
  return next.length === CONCRETE_BRAND_BOOK_PIECES.length ? ['full'] : next;
}

// Pure toggle used by each node's updateNode callback for the skillIds half of
// grounding — the mirror of toggleBrandPiece above, structured for the other
// half of the same setting.
export function toggleSkillId(skillIds: string[] | undefined, skillId: string): string[] {
  const current = skillIds ?? [];
  return current.includes(skillId) ? current.filter((id) => id !== skillId) : [...current, skillId];
}

/**
 * Toggle one member of a tri-state selection, preserving the tri-state.
 *
 * `undefined` means "no preference", which the Backend reads as everything `available`
 * admits. So the FIRST toggle has to materialise that full set and remove one from it —
 * otherwise switching one member off would land on `[member]`, quietly turning every other
 * one off as a side effect of touching one.
 *
 * `available` is what the brand actually HAS, which is the only correct starting set:
 * expanding to the full vocabulary would select members this brand has no rules for, and
 * the selection would then read as deliberate.
 */
export function toggleTriStateSelection<T extends string>(
  selected: T[] | undefined,
  member: T,
  available: readonly T[],
): T[] {
  const current = selected ?? [...available];
  const next = current.includes(member)
    ? current.filter((entry) => entry !== member)
    : [...current, member];
  /* Available order, so the same set always serialises identically. */
  return available.filter((entry) => next.includes(entry));
}

/** The v2 creative-direction half. `authored` is what the brand has written. */
export function toggleDirectionPiece(
  selected: BrandDirectionPiece[] | undefined,
  piece: BrandDirectionPiece,
  authored: readonly BrandDirectionPiece[],
): BrandDirectionPiece[] {
  return toggleTriStateSelection(selected, piece, authored);
}

/** The design-system half. `enabled` is the sections the brand left switched on. */
export function toggleDesignSection(
  selected: DesignSection[] | undefined,
  section: DesignSection,
  enabled: readonly DesignSection[],
): DesignSection[] {
  return toggleTriStateSelection(selected, section, enabled);
}
