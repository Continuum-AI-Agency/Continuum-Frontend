// The editable unit of a design system.
//
// Two levels exist deliberately. A SECTION is semantic and closed — it is what a user
// edits as one card, what the Studio compiler switches on and off, and what MCP reads
// by name. An EXEMPLAR is a renderable artifact (a preview card, a channel UI kit, a
// slide template) that hangs off a section and is consumed verbatim by HyperFrames.
//
// The enum is closed because an open one is how "typography" and "type" and "fonts"
// end up as three sections nobody can toggle coherently. Source formats group cards
// their own way (the Claude export uses Brand/Colors/Type/Spacing/Components/UI Kit);
// `sectionForSourceGroup` maps those in, and anything unrecognized becomes a rule
// list on the closest section rather than inventing a new one.

import { z } from 'zod';
import type { BrandColorRole, BrandFontToken, BrandMdTokens } from '../onboarding/brand-md';
import { type DesignToken, literalHexTokens } from './tokens';

export const designSectionSchema = z.enum([
  'palette',
  'typography',
  'spacing',
  'radii',
  'shadows',
  'layout',
  'components',
  'iconography',
  'motion',
  'voice',
  'imagery',
  'logo',
]);
export type DesignSection = z.infer<typeof designSectionSchema>;

export const DESIGN_SECTIONS = designSectionSchema.options;

export const DESIGN_SECTION_LABELS: Record<DesignSection, string> = {
  palette: 'Palette',
  typography: 'Typography',
  spacing: 'Spacing',
  radii: 'Radii',
  shadows: 'Shadows',
  layout: 'Layout',
  components: 'Components',
  iconography: 'Iconography',
  motion: 'Motion',
  voice: 'Voice',
  imagery: 'Imagery',
  logo: 'Logo',
};

/**
 * Sections whose content can be checked against a generated pixel or DOM.
 *
 * The distinction is load-bearing for the compiler: a `hard` rule on a checkable
 * section becomes a gate, while a `hard` rule on `voice` can only ever shape the
 * prompt. Promising to enforce what cannot be observed is how a gate starts lying.
 */
export const GATEABLE_SECTIONS: readonly DesignSection[] = Object.freeze([
  'palette',
  'typography',
  'radii',
  'shadows',
]);

export const isGateableSection = (section: DesignSection): boolean =>
  GATEABLE_SECTIONS.includes(section);

/**
 * How hard a rule binds.
 *
 * Mirrors the compiler's own vocabulary (`brand-hard` vs `brand-preferred` in
 * creative-system/creative-spec.ts) rather than inventing a third scale, so a rule
 * can be handed to `resolveAuthority` without a translation table in between.
 */
export const designRuleStrengthSchema = z.enum(['hard', 'preferred']);
export type DesignRuleStrength = z.infer<typeof designRuleStrengthSchema>;

/**
 * One imperative statement the brand made about itself.
 *
 * `statement` is kept as prose because that is what reaches the model, and rewriting
 * a brand's own wording into a DSL loses the thing that makes it followable
 * ("radios pequeños o cero — editorial = rectos" survives; `radius: [0,2]` does not).
 * `target` is the optional structured hook: when a rule names a compiler field path,
 * it can additionally become a gate.
 */
export const designRuleSchema = z
  .object({
    statement: z.string().min(1).max(600),
    strength: designRuleStrengthSchema.default('preferred'),
    /** Dotted compiler path when this rule maps to one, e.g. artDirection.palette.accent. */
    target: z.string().max(120).nullable().default(null),
    /** Literal the target must take (a hex, a family name); null for prose-only rules. */
    value: z.string().max(300).nullable().default(null),
    /** Where in the source this came from, for the editor's provenance line. */
    sourceRef: z.string().max(300).nullable().default(null),
  })
  .strict();
export type DesignRule = z.infer<typeof designRuleSchema>;

/** A renderable artifact attached to a section. */
export const designExemplarSchema = z
  .object({
    name: z.string().min(1).max(200),
    /** Storage path, relative to the design system's own prefix. */
    path: z.string().min(1).max(500),
    mediaType: z.string().min(1).max(120),
    kind: z.enum(['preview_card', 'ui_kit', 'slide', 'asset', 'thumbnail']),
    /** Channel a ui_kit targets (landing, linkedin, email…), when it declares one. */
    channel: z.string().max(80).nullable().default(null),
    /** Authored viewport, e.g. "1280x720", when the source declared one. */
    viewport: z.string().max(40).nullable().default(null),
    subtitle: z.string().max(300).nullable().default(null),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable()
      .default(null),
  })
  .strict();
export type DesignExemplar = z.infer<typeof designExemplarSchema>;

/**
 * Confidence in a section, on the evidence we actually have.
 *
 * `declared` = read from a machine-readable source (a manifest, a `:root` block, a
 * DTCG file) with no interpretation. `inferred` = a model read it out of prose.
 * `scraped` = harvested from the live site. The distinction drives the warning bar:
 * a scraped palette losing to a declared one is normal and silent; an INFERRED
 * palette losing to a declared one is worth showing, because it means the document
 * and the tokens disagree.
 */
export const designProvenanceSchema = z.enum(['declared', 'inferred', 'scraped', 'edited']);
export type DesignProvenance = z.infer<typeof designProvenanceSchema>;

export const designSystemSectionSchema = z
  .object({
    section: designSectionSchema,
    title: z.string().min(1).max(200),
    summary: z.string().max(2000).default(''),
    /** Section-specific structured payload; shape varies by section, validated per-section. */
    content: z.record(z.string(), z.unknown()).default({}),
    rules: z.array(designRuleSchema).max(60).default([]),
    exemplars: z.array(designExemplarSchema).max(60).default([]),
    provenance: designProvenanceSchema.default('inferred'),
    confidence: z.number().min(0).max(1).default(0.5),
    /** False when the brand switched this section off for generation. */
    enabled: z.boolean().default(true),
    /** Set once a human edits the card; re-ingest must not clobber it. */
    editedAt: z.string().nullable().default(null),
  })
  .strict();
export type DesignSystemSection = z.infer<typeof designSystemSectionSchema>;

/**
 * Map a source format's own grouping onto our closed enum.
 *
 * Returns null rather than guessing for a group we do not recognize — the caller
 * attaches those to `components`, which is the honest bucket for "a renderable thing
 * whose category we could not determine", instead of minting a section the compiler
 * has no switch for.
 */
export function sectionForSourceGroup(group: string): DesignSection | null {
  const normalized = group.trim().toLowerCase();
  if (normalized.startsWith('ui kit') || normalized === 'slides') return 'components';
  if (normalized.startsWith('color')) return 'palette';
  if (normalized.startsWith('type')) return 'typography';
  if (normalized.startsWith('spacing')) return 'spacing';
  if (normalized.startsWith('component')) return 'components';
  if (normalized.startsWith('brand')) return 'logo';
  if (normalized.startsWith('motion') || normalized.startsWith('anim')) return 'motion';
  if (normalized.startsWith('icon')) return 'iconography';
  if (normalized.startsWith('shadow') || normalized.startsWith('elevation')) return 'shadows';
  if (normalized.startsWith('radi')) return 'radii';
  if (normalized.startsWith('layout') || normalized.startsWith('grid')) return 'layout';
  return null;
}

/**
 * Which section owns a token, from its kind and its name.
 *
 * Name beats kind where they disagree, because a design system's naming is a
 * deliberate statement of intent while `kind` is often a lossy import-time guess —
 * `--t-h1: 64px` arrives from the Claude manifest annotated `spacing`, but it is a
 * type-scale step and belongs on the typography card where someone would look for it.
 */
export function sectionForToken(token: DesignToken): DesignSection {
  const name = token.name.toLowerCase().replace(/^--/, '');
  if (/^(t-|text-|fs-|font|lh-|track-|w-(light|book|medium|semi|bold))/.test(name))
    return 'typography';
  if (/^(r-|radius|rounded)/.test(name)) return 'radii';
  if (/^(shadow|elevation)/.test(name)) return 'shadows';
  if (/^(ease|dur|transition|motion)/.test(name)) return 'motion';
  if (/^(s-|space|gap|size)/.test(name)) return 'spacing';
  if (token.kind === 'color') return 'palette';
  if (token.kind === 'font') return 'typography';
  if (token.kind === 'shadow') return 'shadows';
  if (token.kind === 'motion') return 'motion';
  if (token.kind === 'border') return 'radii';
  return 'spacing';
}

/**
 * Narrow a design system down to the `BrandMdTokens` every existing generator reads.
 *
 * This is what keeps the design system from becoming a second, parallel brand
 * primitive that half the codebase knows about. The system stays authoritative and
 * complete in its own tables; this projection is how it reaches everything already
 * wired to `brand_tokens` without those call sites changing at all.
 *
 * Colour roles are assigned by token NAME first (a system that named something
 * `--accent` has told us its role) and by source order only as a fallback, which is
 * the same precedence `extractBrandTokens` uses for a scrape.
 */
const ROLE_PATTERNS: ReadonlyArray<readonly [BrandColorRole, RegExp]> = [
  ['primary', /^(--)?(primary|brand|accent-primary)$/],
  ['accent', /^(--)?accent$/],
  ['background', /^(--)?(bg-1|background|surface|paper|bone)$/],
  ['text', /^(--)?(fg-1|text|ink|foreground)$/],
  ['secondary', /^(--)?(secondary|bg-2|support)$/],
];

export function projectSectionsToBrandTokens(args: {
  brandName: string;
  tokens: readonly DesignToken[];
  fontFamilies: readonly string[];
}): Pick<BrandMdTokens, 'brand_name' | 'colors' | 'typography'> {
  const hexes = literalHexTokens(args.tokens);
  const taken = new Set<BrandColorRole>();
  const colors: BrandMdTokens['colors'] = [];

  for (const token of hexes) {
    const bare = token.name.toLowerCase();
    const matched = ROLE_PATTERNS.find(([, re]) => re.test(bare));
    const role = matched && !taken.has(matched[0]) ? matched[0] : undefined;
    if (role) taken.add(role);
    colors.push({
      value: (token.resolvedValue ?? token.value).toLowerCase(),
      ...(role ? { role } : {}),
      name: token.name,
    });
    if (colors.length >= 24) break;
  }

  const typography: BrandFontToken[] = args.fontFamilies.slice(0, 12).map((family, index) => ({
    family,
    role: index === 0 ? ('display' as const) : ('body' as const),
  }));

  return { brand_name: args.brandName, colors, typography };
}
