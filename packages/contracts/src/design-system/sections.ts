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
import { interp } from './image-analysis';
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
  'formats',
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
  formats: 'Formats',
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
  // `formats` is gateable, and it is the most literally checkable section here: its content is
  // measured geometry in the render's own coordinate space, so "the headline sits inside the
  // safe zone" and "the header band is interp(aspect) of the base width" are both answerable by
  // measuring the output. `layout` stays out for the opposite reason — it is prose about grids.
  'formats',
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

// ── `formats`: the brand's measured layout geometry ───────────────────────────────────────

/** A fraction of the frame, 0..1. */
const fractionSchema = z.number().min(0).max(1);

/**
 * The region of a format where a headline may sit, as fractions of the frame.
 *
 * Structurally `FractionalBox` from image-analysis.ts, so a parsed safe zone goes straight
 * into `resolveBox` / `headlineLegibility` with no adapter in between — the zone the brand
 * declared is the zone the legibility gate measures.
 */
export const designSafeZoneSchema = z
  .object({ x0: fractionSchema, y0: fractionSchema, x1: fractionSchema, y1: fractionSchema })
  .strict()
  .refine((box) => box.x0 < box.x1 && box.y0 < box.y1, {
    message: 'safe zone must enclose area: x0 < x1 and y0 < y1',
  });
export type DesignSafeZone = z.infer<typeof designSafeZoneSchema>;

/**
 * A MEASURED interpolation curve: `[formatAspect, value]` samples taken off real artwork.
 *
 * Not a formula and not a guess. These are what a designer's finished adaptations actually
 * did — {@link VERNE_PHOTO_RATIO_CURVE} reproduces four real pieces to the pixel — and
 * {@link interp} reads between them. Two points is the floor because one point is a
 * constant, and a constant does not need a curve.
 *
 * `unit` is what keeps the no-raw-pixels rule enforceable. A `ratio` curve carries aspect
 * ratios (a photo block at 1.567..2.224); a `fraction` curve carries fractions of
 * `baseWidth` and is rejected the moment someone pastes `194` into it, which is exactly
 * the mistake that puts a pixel back into a spec meant to survive every canvas.
 */
export const designMeasuredCurveSchema = z
  .object({
    unit: z.enum(['ratio', 'fraction']),
    /** `[aspect, value]` samples, strictly ascending by aspect. */
    points: z
      .array(z.tuple([z.number().positive(), z.number()]))
      .min(2)
      .max(24),
  })
  .strict()
  .refine((curve) => curve.points.every(([x], i) => i === 0 || x > curve.points[i - 1][0]), {
    message: 'curve points must be strictly ascending by aspect',
  })
  .refine((curve) => curve.unit !== 'fraction' || curve.points.every(([, y]) => y >= 0 && y <= 1), {
    message: 'a fraction curve carries fractions of baseWidth, 0..1 — not pixels',
  });
export type DesignMeasuredCurve = z.infer<typeof designMeasuredCurveSchema>;

/**
 * One named output format, and where its headline may live.
 *
 * `width`/`height` are the only raw pixels in this section; the id is the name a recipe
 * refers to (`postIG`, `story`). The shape is `RenderFormat` from image-analysis.ts, so a
 * brand's own format list feeds `requiredUpscale` directly.
 *
 * `safeZone: null` is a STATEMENT, not a missing value — this format puts no text over
 * imagery, the way Verne's T3/T4 templates do. Making the field optional instead would
 * collapse "deliberately none" and "nobody measured it yet" into the same value, and a
 * renderer cannot tell those apart.
 */
export const designFormatSchema = z
  .object({
    id: z.string().min(1).max(80),
    width: z.number().int().positive().max(20000),
    height: z.number().int().positive().max(20000),
    safeZone: designSafeZoneSchema.nullable(),
  })
  .strict();
export type DesignFormat = z.infer<typeof designFormatSchema>;

/**
 * What a `formats` section's `content` carries.
 *
 * EVERY DIMENSION HERE IS A RATIO OR A FRACTION, never a raw pixel — the single exception
 * is a format's own `width`/`height`, which is what all the fractions are fractions OF.
 * That is the whole reason one spec can hold across every output: a header band recorded
 * as `0.18 of the base width` survives 1080x1351 and 1080x1920 unchanged, while `194px` is
 * true for exactly one canvas and silently wrong on the next. A renderer that reads this
 * stops hard-coding geometry; a brand panel that reads it can finally show it.
 *
 * Aspect ratios are DERIVED (`width / height`) and never stored, for the same reason a
 * token's resolved value is not stored twice: two copies of one number is one number and
 * one bug waiting for someone to edit only the other one.
 */
export const designFormatsContentSchema = z
  .object({
    /**
     * The canvas every fraction below is measured against, in pixels.
     *
     * Not "the biggest format" and not a constant — it is whatever width the brand's
     * artwork was actually laid out at, because that is the denominator the measurements
     * came out of.
     */
    baseWidth: z.number().int().positive().max(20000),
    formats: z.array(designFormatSchema).min(1).max(40),
    /**
     * Measured curves by name — `photoAspect`, `headerBand`, whatever this brand measured.
     *
     * Open-keyed on purpose: the closed thing is the SHAPE of a measurement, not its
     * subject. Closing the subject list would mean a brand that measured one more thing
     * has to ship a migration to say so.
     */
    curves: z.record(z.string(), designMeasuredCurveSchema).default({}),
  })
  .strict()
  .refine((content) => new Set(content.formats.map((f) => f.id)).size === content.formats.length, {
    message: 'format ids must be unique — a duplicate makes one of them unreachable by name',
  });
export type DesignFormatsContent = z.infer<typeof designFormatsContentSchema>;

/**
 * Read a measured curve at a format's aspect ratio.
 *
 * Exists so nobody re-implements the clamping: {@link interp} holds the endpoint value
 * outside the measured range rather than extrapolating, because past the last real piece
 * there is no data — only arithmetic that looks like data.
 */
export const readDesignCurve = (curve: DesignMeasuredCurve, aspect: number): number =>
  interp(aspect, curve.points);

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
  if (normalized.startsWith('format') || normalized.startsWith('adaptation')) return 'formats';
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
