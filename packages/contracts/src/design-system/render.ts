// Rendering a design system into the two forms a generator can actually use:
// a prompt block, and a stylesheet.
//
// `<brand_book>` (ai-studio/brand-enforcement.ts) already carries the small primitive —
// five colour roles and two families. This block carries what only a real design system
// has: the rules. "Radios pequeños o cero, editorial = rectos" is a constraint no
// palette can express, and it is the difference between output that uses the brand's
// colours and output that looks like the brand.
//
// The stylesheet exists because one surface — HyperFrames — does not sample pixels, it
// AUTHORS HTML. For that surface a token is not a hint to be approximated; it is a
// value to be used literally, and handing it `--accent: #FFAA1C` is categorically
// stronger than telling it the accent is orange.

import type { DesignSystemSnapshot } from './manifest';
import { effectiveRigorTier } from './manifest';
import type { DesignSection, DesignSystemSection } from './sections';
import { type DesignToken, literalHexTokens } from './tokens';

/**
 * Sections the caller wants applied.
 *
 * `undefined` means "everything the brand enabled", matching how `brandBookPieces`
 * treats absence — the two controls sit next to each other in the same popover, and
 * one reading absence as "all" while the other read it as "none" is exactly the trap
 * HyperFrames fell into.
 */
export type DesignSectionSelection = readonly DesignSection[] | undefined;

export interface RenderedDesignSystem {
  /** The `<design_system>` prompt block, or "" when nothing applies. */
  block: string;
  /** Sections that contributed a line, for the receipt. */
  renderedSections: DesignSection[];
  /** True when the tier makes these rules gate rather than merely shape. */
  gating: boolean;
}

export interface RenderDesignSystemOptions {
  /**
   * The prompt already carries a `<brand_book>` built from `brand_tokens`.
   *
   * `brand_tokens` is DOWNSTREAM of this system — `projectToBrandTokens` writes the
   * system's own colours and families into it at ingest, and `reconcile.ts` resolves
   * every disagreement in the system's favour before that write. So when a brand book
   * is present its palette IS this palette, narrowed, and emitting the token lines
   * again states the same identity twice with two different scopes: the book's five
   * roles say "use ONLY these" and this block's sixteen tokens say "use ONLY these" of
   * a superset. A model cannot satisfy both, and the pair is also pure prompt mass on
   * the surface that already carries the most.
   *
   * Rules are unaffected — a rule is what no palette can express, and it is the whole
   * reason this block exists next to the book rather than instead of it.
   *
   * HyperFrames needs no exemption despite authoring HTML: its `:root{}` stylesheet is
   * rendered from the SNAPSHOT by `renderDesignSystemStylesheet`, not from this block,
   * and it states every token literally under its original name. Suppressing the prose
   * copy there removes a restatement of something the stylesheet already says better.
   *
   * Defaults to false, so a caller that has not thought about it keeps the old, whole
   * block rather than silently losing the palette.
   */
  brandBlockCarriesTokens?: boolean;
}

function selected(
  snapshot: DesignSystemSnapshot,
  selection: DesignSectionSelection,
): DesignSystemSection[] {
  return snapshot.sections.filter(
    (section) =>
      section.enabled && (selection === undefined || selection.includes(section.section)),
  );
}

/** `--accent (#FFAA1C)` — the name matters; it is the layer the brand reasons in. */
function describeToken(token: DesignToken): string {
  const value = token.resolvedValue ?? token.value;
  return token.name.startsWith('--') ? `${token.name} (${value})` : `${token.name}: ${value}`;
}

function paletteLine(snapshot: DesignSystemSnapshot): string | null {
  const hexes = literalHexTokens(snapshot.tokens).slice(0, 16);
  if (hexes.length === 0) return null;
  return `Palette (use ONLY these): ${hexes.map(describeToken).join(', ')}`;
}

function typographyLine(snapshot: DesignSystemSnapshot): string | null {
  if (snapshot.fonts.length === 0) return null;
  const families = snapshot.fonts.map((font) => font.family).join(', ');
  const allowlist = snapshot.adherence.fontAllowlist;
  const closed = allowlist.length > 0 ? ' No other family belongs to this system.' : '';
  return `Typefaces: ${families}.${closed}`;
}

/**
 * The prompt block.
 *
 * Rules are rendered before token lists per section because a rule is the part a model
 * can act on across a whole composition, while a token list is a lookup it consults.
 * Leading with 30 hex values buries the one sentence that says not to use more than two
 * of them in a single piece.
 */
export function renderDesignSystemBlock(
  snapshot: DesignSystemSnapshot,
  selection: DesignSectionSelection = undefined,
  options: RenderDesignSystemOptions = {},
): RenderedDesignSystem {
  const sections = selected(snapshot, selection);
  const tier = effectiveRigorTier(snapshot);
  const gating = tier === 'strict';
  if (sections.length === 0) return { block: '', renderedSections: [], gating };

  const tokenLines = options.brandBlockCarriesTokens !== true;
  const renderedSections: DesignSection[] = [];
  const lines: string[] = [];

  for (const section of sections) {
    const parts: string[] = [];
    if (tokenLines && section.section === 'palette') {
      const line = paletteLine(snapshot);
      if (line) parts.push(line);
    }
    if (tokenLines && section.section === 'typography') {
      const line = typographyLine(snapshot);
      if (line) parts.push(line);
    }
    for (const rule of section.rules) {
      // A hard rule reads differently from a preference, and flattening the two would
      // make the model treat "nunca gradientes" and "prefer generous margins" alike.
      parts.push(`${rule.strength === 'hard' ? '- MUST:' : '- Prefer:'} ${rule.statement}`);
    }
    if (parts.length === 0) continue;
    renderedSections.push(section.section);
    lines.push(`[${section.title}]`, ...parts);
  }

  if (lines.length === 0) return { block: '', renderedSections: [], gating };

  const preamble =
    tier === 'strict'
      ? 'authoritative design system — hard rules are mandatory'
      : 'the brand design system — follow it unless the brief explicitly overrides';

  return {
    block: `<design_system>(${preamble})\n${lines.join('\n')}\n</design_system>`,
    renderedSections,
    gating,
  };
}

/* -------------------------------------------------------------------------- */
/*  Stylesheet                                                                 */
/* -------------------------------------------------------------------------- */

/** Google Fonts is the only remote origin a generated composition may reference. */
function fontImport(snapshot: DesignSystemSnapshot): string | null {
  const declared = snapshot.fonts
    .map((font) => font.source)
    .find((source) => source && /fonts\.googleapis\.com/.test(source));
  if (declared) return `@import url('${declared}');`;
  // Reconstructing the URL when the source did not carry one is what makes a
  // DTCG/Figma import — which has family names but no webfont link — still render in
  // the right typeface rather than silently falling back to a system stack.
  const families = snapshot.fonts.map((font) => font.family).filter(Boolean);
  if (families.length === 0) return null;
  const query = families
    .map(
      (family) =>
        `family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@300;400;500;600;700`,
    )
    .join('&');
  return `@import url('https://fonts.googleapis.com/css2?${query}&display=swap');`;
}

/**
 * The design system as a `:root` block a composition can inline verbatim.
 *
 * Emits the tokens under their ORIGINAL names. A renamed token (`--brand-accent`) would
 * be useless to the exemplar HTML shipped alongside it, which references `--accent` —
 * and those exemplars are the strongest signal we can give an HTML author about what
 * the brand's work looks like. Values are emitted unresolved so alias chains keep
 * working exactly as the brand authored them.
 */
export function renderDesignSystemStylesheet(
  snapshot: DesignSystemSnapshot,
  options: {
    /**
     * Emit the webfont `@import`. Default true.
     *
     * HyperFrames passes false: its compositions render inside a sandboxed srcdoc
     * iframe that cannot fetch anything from the network, and its agent is explicitly
     * instructed that it "cannot load a font file". Emitting an import there would
     * contradict a standing instruction and silently resolve to a fallback stack
     * anyway. The token values — colours, scale, radii, motion — are the part that
     * carries, and they are unaffected.
     */
    includeFontImport?: boolean;
  } = {},
): string {
  if (snapshot.tokens.length === 0) return '';
  const namedTokens = snapshot.tokens.filter((token) => token.name.startsWith('--'));
  if (namedTokens.length === 0) return '';

  const importLine = options.includeFontImport === false ? null : fontImport(snapshot);
  const declarations = namedTokens.map((token) => `  ${token.name}: ${token.value};`).join('\n');

  return [importLine, ':root {', declarations, '}']
    .filter((part): part is string => part !== null)
    .join('\n');
}

/**
 * The adherence rules as instructions a lint pass and a model can both follow.
 *
 * Returned as sentences rather than as the config object because the consumer is a
 * prompt. The executable form of the same rules lives with the linter; this is the
 * half that has to be readable.
 */
export function renderAdherenceRules(snapshot: DesignSystemSnapshot): string[] {
  const rules: string[] = [];
  const { adherence } = snapshot;
  if (adherence.forbidRawHex) {
    rules.push(
      'Never write a raw hex colour. Every colour must be a var() reference to a token declared in the stylesheet above.',
    );
  }
  if (adherence.forbidRawPx) {
    rules.push('Never write a raw px value for spacing. Use the spacing-scale tokens via var().');
  }
  if (adherence.fontAllowlist.length > 0) {
    rules.push(
      `Set type only in ${adherence.fontAllowlist.join(' or ')} — name the family first in every font stack, then a same-classification fallback.`,
    );
  }
  return rules;
}
