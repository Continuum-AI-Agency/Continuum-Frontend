// What we learned by opening an uploaded project file.
//
// One shape for every design source — After Effects, Figma, later Photoshop — so a template
// card, a font pre-flight and a search facet do not each learn a different vocabulary. The
// producers differ wildly (py_aep reads a reverse-engineered RIFX container; Figma returns
// documented JSON) and that is exactly why the shape they agree on is worth pinning here.
//
// Deliberately NOT in this shape: semantic roles. No generic role deriver exists — the only
// one in the tree is hardcoded to one client's comp names — and a guessed role is worse than
// no role, because it silently binds the wrong field. Slots come out typed and unlabelled.

import { z } from 'zod';
import { apiRenderVariableKindSchema } from '../ai-studio/api-renders';

export const templateSourceFamilySchema = z.enum([
  'after_effects',
  'after_effects_package',
  'figma',
  'photoshop',
]);
export type TemplateSourceFamily = z.infer<typeof templateSourceFamilySchema>;

export const templateParseStateSchema = z.enum([
  'pending',
  'parsed',
  // We will never read this family — not a retry, not an error the user can clear.
  'unsupported',
  // We tried and the file said no. A fact about the file.
  'failed',
]);
export type TemplateParseState = z.infer<typeof templateParseStateSchema>;

/**
 * How a slot's value is currently driven.
 *
 * `expression` is NOT the same as unwritable: rigs read `thisProperty.value` and animate
 * around it, so a write still moves the layer. It is reported, never acted on — deciding is
 * the fleet's job, and asserting either way from a static read would be a guess.
 */
export const templateSlotDriverSchema = z.enum(['static', 'expression', 'keyframed']);

/**
 * `essential` = an After Effects Essential Property, i.e. the template author saying "this is
 * a knob". `direct` = a property we inferred is bindable. Both are real slots; they are not
 * equally intended, and a mapping UI should offer the author's own knobs first.
 */
export const templateSlotOriginSchema = z.enum(['essential', 'direct']);

export const templateSlotSchema = z
  .object({
    key: z.string().min(1),
    name: z.string(),
    // The same vocabulary the render contract speaks, so a parsed slot and a promoted
    // template's variable are the same kind of thing and a UI needs one control set.
    kind: apiRenderVariableKindSchema,
    origin: templateSlotOriginSchema,
    driver: templateSlotDriverSchema,
    // Which delivery comps / frames carry this slot. A template ships one design at N ratios,
    // so a slot present in 7 comps is one slot, not seven.
    comps: z.array(z.string()).default([]),
    layerIds: z.array(z.number().int()).default([]),
    /**
     * The designer's own composed length in the tightest comp — not a limit After Effects
     * enforces. It is the only honest budget available without a render, and it is a ceiling
     * to shrink toward when `warnings` says the authored text already overflows.
     */
    charBudget: z.number().int().nonnegative().optional(),
    box: z.array(z.number()).length(4).optional(),
    sample: z.string().optional(),
  })
  .strict();
export type TemplateSlot = z.infer<typeof templateSlotSchema>;

export const templateCompSchema = z
  .object({
    name: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    // Seconds and frames-per-second, already divided out of the file's rationals. A frame rate
    // above 120 means someone read a dividend without its divisor.
    frameRate: z.number().positive().max(240).optional(),
    durationSec: z.number().nonnegative().optional(),
    workArea: z.array(z.number()).length(2).optional(),
    layerCount: z.number().int().nonnegative(),
    isTop: z.boolean(),
    /**
     * Carries a real layer stack, so it is a comp the designer delivers rather than an asset
     * precomp. Neither "top level" nor "largest" works: a wrapper comp hides the very comp
     * holding the 9:16 layout, and asset precomps dwarf the delivery comp.
     */
    isDelivery: z.boolean(),
  })
  .passthrough();
export type TemplateComp = z.infer<typeof templateCompSchema>;

export const templateRatioSchema = z
  .object({
    // '9:16' where the reduction is legible, else 'WxH' — a 1447:2160-shaped label is not a
    // filter anyone can use.
    ratio: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    comps: z.array(z.string()).default([]),
  })
  .strict();
export type TemplateRatio = z.infer<typeof templateRatioSchema>;

export const templateFontSchema = z
  .object({ family: z.string().min(1), layers: z.number().int().nonnegative() })
  .strict();
export type TemplateFont = z.infer<typeof templateFontSchema>;

export const templateParseSchema = z
  .object({
    parser: z.string().min(1),
    sourceFamily: templateSourceFamilySchema,
    appVersion: z.string().nullable().default(null),
    filename: z.string().optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
    checksum: z.string().optional(),
    comps: z.array(templateCompSchema).default([]),
    ratios: z.array(templateRatioSchema).default([]),
    slots: z.array(templateSlotSchema).default([]),
    fonts: z.array(templateFontSchema).default([]),
    staticText: z
      .array(
        z
          .object({
            value: z.string().nullable(),
            font: z.string().nullable().default(null),
            comp: z.string(),
          })
          .strict(),
      )
      .default([]),
    warnings: z.array(z.string()).default([]),
  })
  .strip();
export type TemplateParse = z.infer<typeof templateParseSchema>;

/** A `media.template_sources` row on the wire. */
export const templateSourceSchema = z
  .object({
    assetId: z.string().uuid(),
    brandId: z.string().uuid(),
    versionId: z.string().uuid(),
    family: templateSourceFamilySchema,
    parseState: templateParseStateSchema,
    parser: z.string().nullable().default(null),
    parse: templateParseSchema.nullable().default(null),
    fonts: z.array(z.string()).default([]),
    ratios: z.array(z.string()).default([]),
    slotCount: z.number().int().nonnegative().nullable().default(null),
    forgeRunId: z.string().nullable().default(null),
    forgeState: z.string().nullable().default(null),
    /**
     * Set once the fleet has promoted this source into its catalog. Until then the template is
     * browsable and pre-flightable but NOT renderable, and a card that implies otherwise is
     * lying — the fleet can finish a job against an unpromoted package and hand back a blank
     * frame, which looks exactly like success.
     */
    templateKey: z.string().nullable().default(null),
    parseError: z.string().nullable().default(null),
    parsedAt: z.string().nullable().default(null),
    createdAt: z.string(),
    updatedAt: z.string().nullable().default(null),
  })
  .strict();
export type TemplateSource = z.infer<typeof templateSourceSchema>;

/** A font the template needs, against what the brand actually holds. */
export const templateFontStatusSchema = z
  .object({
    family: z.string().min(1),
    layers: z.number().int().nonnegative(),
    held: z.boolean(),
  })
  .strict();
export type TemplateFontStatus = z.infer<typeof templateFontStatusSchema>;

export const TEMPLATE_SOURCE_FAMILIES_FROM_LIBRARY_FORMAT: Record<string, TemplateSourceFamily> = {
  after_effects: 'after_effects',
  after_effects_package: 'after_effects_package',
};

/**
 * Which uploaded files become template sources.
 *
 * `design_source` (psd/ai/svg/tiff) and `document` (pdf) are project files too, but nothing
 * reads them yet — giving them a row would put a permanently-`pending` card in the Templates
 * section, which reads as broken rather than as not-yet-built.
 */
export function templateFamilyForLibraryFormat(family: string): TemplateSourceFamily | null {
  return TEMPLATE_SOURCE_FAMILIES_FROM_LIBRARY_FORMAT[family] ?? null;
}

/** Distinct font families a parse needs, normalized and deduped for the `fonts[]` column. */
export function templateParseFontFamilies(parse: TemplateParse): string[] {
  return [...new Set(parse.fonts.map((font) => font.family.trim()).filter(Boolean))].sort();
}

/** Distinct ratio labels, for the `ratios[]` column and the facet chips. */
export function templateParseRatios(parse: TemplateParse): string[] {
  return [...new Set(parse.ratios.map((entry) => entry.ratio.trim()).filter(Boolean))].sort();
}

/**
 * Diff what a template needs against what the brand holds.
 *
 * Case- and space-insensitive on purpose: After Effects reports a PostScript name
 * (`HeadingNow-36CompBold`) and a font store keys on whatever the uploader's file said. A
 * comparison strict enough to miss that reports every font as absent, and a pre-flight that
 * always fails is one nobody reads.
 */
export function templateFontStatuses(
  needed: readonly TemplateFont[],
  held: readonly string[],
): TemplateFontStatus[] {
  const normalize = (value: string) => value.toLowerCase().replace(/[\s_-]+/g, '');
  const heldSet = new Set(held.map(normalize));
  return needed.map((font) => ({
    family: font.family,
    layers: font.layers,
    held: heldSet.has(normalize(font.family)),
  }));
}
