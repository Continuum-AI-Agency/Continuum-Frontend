// The design-system token primitive.
//
// A brand that ships a real design system hands us something categorically better
// than a scraped palette: named tokens with declared KINDS, a spacing scale, a radii
// policy, and often a machine-checkable adherence config. `BrandMdTokens`
// (onboarding/brand-md.ts) deliberately stays small — five colour roles and two font
// roles are all a scrape can honestly produce. This module is the richer sibling for
// brands that authored a system, and it is a SUPERSET: `projectToBrandTokens`
// (sections.ts) narrows back down so nothing downstream has to learn two shapes.
//
// Tokens are stored flat rather than nested by kind. The source formats are flat
// (`--s-4` sits beside `--ink` in one `:root` block, and a DTCG file is one tree),
// `kind` is already carried per token, and a flat list is what both the DTCG export
// and the adherence check want to iterate. Grouping is a read-time concern.

import { z } from 'zod';

/**
 * What a token IS, which is not the same as what it looks like.
 *
 * Taken from the kinds the Claude design-system manifest emits, because agreeing
 * with the source format costs nothing and disagreeing means a lossy import. Note
 * `dimension` covers both spacing and type sizes: `--t-h1: 64px` and `--s-8: 64px`
 * are the same kind of value used for different purposes, and the purpose is
 * already recoverable from the token's own name and its section.
 */
export const designTokenKindSchema = z.enum([
  'color',
  'font',
  'dimension',
  'shadow',
  'border',
  'motion',
  'other',
]);
export type DesignTokenKind = z.infer<typeof designTokenKindSchema>;

/**
 * One token, kept as close to the source as possible.
 *
 * `value` is NOT normalized to a hex or a number. A design system's own values are
 * frequently aliases (`--accent: var(--cba-orange)`) or composites
 * (`--bd-hair: 1px solid var(--line)`), and flattening those at import time would
 * throw away the layer the brand actually reasons in — the alias IS the semantic
 * name. `resolvedValue` carries the flattened form when we can compute it, so
 * consumers that need a literal (the palette gate, the DTCG export) have one
 * without the source being rewritten.
 */
export const designTokenSchema = z
  .object({
    /** Source name, verbatim, including any leading `--`. */
    name: z.string().min(1).max(120),
    value: z.string().min(1).max(500),
    kind: designTokenKindSchema,
    /** Alias/composite chains flattened to a literal; null when unresolvable. */
    resolvedValue: z.string().min(1).max(500).nullable().default(null),
    /** Source file the token was declared in, for provenance in the editor. */
    definedIn: z.string().max(300).nullable().default(null),
    /** Human label when the source supplied one (DTCG `$description`). */
    description: z.string().max(300).nullable().default(null),
  })
  .strict();
export type DesignToken = z.infer<typeof designTokenSchema>;

/** A font family the system declares, with the tokens that point at it. */
export const designSystemFontSchema = z
  .object({
    family: z.string().min(1).max(200),
    /** Token names referencing this family, e.g. ['--font-sans', '--font-display']. */
    tokens: z.array(z.string().min(1).max(120)).max(24).default([]),
    /** Where the webfont comes from, when the source declared it. */
    source: z.string().max(500).nullable().default(null),
  })
  .strict();
export type DesignSystemFont = z.infer<typeof designSystemFontSchema>;

/**
 * The machine-checkable half of a design system.
 *
 * A system that ships an adherence config has told us, in code, what counts as a
 * violation — which is far stronger evidence of how strictly it wants to be applied
 * than any prose. It is also directly executable against generated HTML, which is
 * what makes the HyperFrames lint in Phase 7 possible.
 */
export const designAdherenceSchema = z
  .object({
    /** Raw hex outside the token set is a violation. */
    forbidRawHex: z.boolean().default(false),
    /** Raw px outside the spacing scale is a violation. */
    forbidRawPx: z.boolean().default(false),
    /** Families the system permits; empty means "unconstrained". */
    fontAllowlist: z.array(z.string().min(1).max(200)).max(24).default([]),
    /** Token names the system considers public API. */
    tokenAllowlist: z.array(z.string().min(1).max(120)).max(400).default([]),
  })
  .strict();
export type DesignAdherence = z.infer<typeof designAdherenceSchema>;

export const EMPTY_ADHERENCE: DesignAdherence = {
  forbidRawHex: false,
  forbidRawPx: false,
  fontAllowlist: [],
  tokenAllowlist: [],
};

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** True when a value is a literal hex the palette gate can compare against. */
export function isLiteralHex(value: string): boolean {
  return HEX_RE.test(value.trim());
}

/**
 * Flatten `var(--x)` alias chains against the token set.
 *
 * Bounded and cycle-safe: a self-referential or mutually-referential alias returns
 * null rather than looping. Only a WHOLE-value alias resolves — `1px solid var(--line)`
 * keeps its composite form because a border is not a colour, and pretending otherwise
 * would put `#E4DDCE` into a field that means "border shorthand".
 */
export function resolveTokenValue(
  value: string,
  byName: ReadonlyMap<string, string>,
  depth = 0,
): string | null {
  if (depth > 8) return null;
  const alias = /^var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)$/i.exec(value.trim());
  if (!alias) return value.trim();
  const next = byName.get(alias[1]);
  if (next === undefined) return null;
  return resolveTokenValue(next, byName, depth + 1);
}

/**
 * Fills `resolvedValue` across a token set, and upgrades the kind of pure aliases.
 *
 * `--accent: var(--cba-orange)` carries nothing in its own syntax that says "colour" —
 * the semantic layer of a design system is precisely the layer that looks like
 * nothing. Left unclassified, every semantic alias (`--accent`, `--bg-invert`,
 * `--fg-1`) would be invisible to the palette projection and the gate, which is most
 * of what a well-built system actually declares.
 *
 * The upgrade is deliberately conservative: it fires only when the kind is `other`,
 * so an explicit `@kind` annotation and a confident syntactic read both survive.
 * Pure; returns a new array.
 */
export function resolveTokens(tokens: readonly DesignToken[]): DesignToken[] {
  const byName = new Map(tokens.map((token) => [token.name, token.value]));
  const kindByName = new Map(tokens.map((token) => [token.name, token.kind]));
  return tokens.map((token) => {
    const resolvedValue = resolveTokenValue(token.value, byName);
    return {
      ...token,
      resolvedValue,
      kind: upgradeAliasKind(token, resolvedValue, byName, kindByName),
    };
  });
}

/** The kind an alias should inherit: the target's kind, else the resolved value's shape. */
function upgradeAliasKind(
  token: DesignToken,
  resolvedValue: string | null,
  byName: ReadonlyMap<string, string>,
  kindByName: ReadonlyMap<string, DesignTokenKind>,
): DesignTokenKind {
  if (token.kind !== 'other') return token.kind;
  const alias = /^var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)$/i.exec(token.value.trim());
  if (!alias) return token.kind;
  const targetKind = kindByName.get(alias[1]);
  if (targetKind && targetKind !== 'other') return targetKind;
  if (resolvedValue && isLiteralHex(resolvedValue)) return 'color';
  if (resolvedValue && /^(rgb|hsl|oklch|lab)a?\(/i.test(resolvedValue.trim())) return 'color';
  return token.kind;
}

/** Colour tokens whose resolved value is a literal hex, in source order. */
export function literalHexTokens(tokens: readonly DesignToken[]): DesignToken[] {
  return tokens.filter(
    (token) =>
      token.kind === 'color' && token.resolvedValue !== null && isLiteralHex(token.resolvedValue),
  );
}

/**
 * One font face the ENGINE ACTUALLY HOLDS, as a settings surface reads it.
 *
 * The distinction from {@link designSystemFontSchema} is the whole point: that one is
 * what the system DECLARES ("this brand uses Publico"), this one is what we can
 * actually render with. A brand whose design system names four families and whose
 * store holds none is not a brand with four families — it is a brand whose pieces will
 * ship in a substitute typeface — and only the second shape can say so.
 *
 * `path` is deliberately absent. The store's rule is that a brand font is never
 * publicly reachable by URL (`brand-knowledge/fonts/store.ts`), and a storage key
 * handed to a browser is one signed-URL call away from being exactly that. The panel
 * needs to know a face EXISTS, not where it lives.
 */
export const designSystemFontFaceSchema = z
  .object({
    family: z.string().min(1).max(200),
    /** Null when the stored face declared none — `@font-face` then defaults to 400. */
    weight: z.number().int().min(1).max(1000).nullable().default(null),
    style: z.enum(['normal', 'italic']),
    format: z.enum(['woff2', 'woff', 'otf', 'ttf']),
    bytes: z.number().int().nonnegative(),
  })
  .strict();
export type DesignSystemFontFace = z.infer<typeof designSystemFontFaceSchema>;
