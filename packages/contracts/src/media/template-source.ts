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
import { slotPlacementSchema } from '../ai-studio/api-render-fit';
import { apiRenderVariableKindSchema } from '../ai-studio/api-renders';
import { type FontLicenceScope, fontLicenceScopeSchema } from './fonts';

/**
 * The largest project file the Forge can actually accept, in bytes — the ONE number.
 *
 * There are four ceilings on this path and only the smallest is ever real:
 *
 * | Ceiling | Value | Binding? |
 * |---|---|---|
 * | Supabase **project-global** upload limit (Settings → Storage) | 50 MB | **yes, today** |
 * | `storage.buckets.file_size_limit` for `media-source` | 5 GB | no — the global silently overrides it |
 * | Template Forge's own package limit | 250 MB | only once the global is raised above it |
 * | `library-upload`'s register-time refusal | this constant | mirrors it by hand |
 *
 * The project-global cap is readable from neither SQL nor the browser — only the Management
 * API — which is why it was copied by hand into the drop zone and then drifted from the two
 * bench scripts and the edge function, giving four different answers to one question.
 *
 * So this number is NOT trusted: `forge:intake:e2e:bench` proves the effective ceiling
 * empirically by pushing one byte over it and requiring storage to refuse. Change this when
 * the dashboard changes and let the bench tell you if you are wrong.
 */
export const FORGE_PROJECT_FILE_MAX_BYTES = 50 * 1024 * 1024;

/** The same ceiling in whole MB, for the sentence a refusal shows a person. */
export const FORGE_PROJECT_FILE_MAX_MB = Math.floor(FORGE_PROJECT_FILE_MAX_BYTES / (1024 * 1024));

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
    /**
     * Where this slot lands: the projected box in comp coordinates, the footage's own pixel size,
     * and which comp the box belongs to. Null for a slot the parse could not place.
     *
     * The same `slotPlacementSchema` the render path's fit check consumes — one shape, so a box
     * measured at upload and a box measured at preflight cannot disagree.
     */
    placement: slotPlacementSchema.nullish(),
    /**
     * Every place this slot actually appears, one entry per comp.
     *
     * A template ships one design at N ratios, so the slot itself is deduped on layer name — this
     * is the un-deduped truth underneath it, and the reason a per-comp box exists at all: the same
     * knob is a different rectangle in 1:1 than in 9:16, and a fit check that used one box for
     * both would pass a headline that clips in the vertical cut.
     */
    instances: z
      .array(
        z
          .object({
            compId: z.number().int(),
            comp: z.string(),
            layerId: z.number().int(),
            layerName: z.string().optional(),
            box: z.array(z.number()).length(4).nullish(),
            compSize: z.array(z.number()).length(2).nullish(),
            charBudget: z.number().int().nonnegative().nullish(),
            sample: z.string().nullish(),
          })
          .passthrough(),
      )
      .optional(),
    /**
     * The Essential Graphics controller behind this slot, when one drives it.
     *
     * Present for a slot reached through a sourced precomp, where the family is keyed on the
     * CONTROLLER's name rather than the layer's — the controller is the thing the designer
     * actually exposed.
     */
    control: z
      .object({
        controllerType: z.number().int().nullish(),
        name: z.string().nullish(),
        uuid: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
  })
  // Passthrough, NOT strict — and the switch was not cosmetic.
  //
  // This is a mirror of a shape another repo owns and extends. It was strict, the forge added
  // `placement` (its `forge:placement` work, 2026-09-05), and `parseProjectFile` runs
  // `templateParseSchema.safeParse` and throws `template_forge_invalid_parse` on failure — so
  // from that day every real upload's parse 502'd and every row stayed `pending`. An additive
  // change upstream took the whole feature down silently.
  //
  // The drift signal is worth keeping, but it belongs somewhere loud rather than somewhere fatal:
  // `library:forge:e2e:bench` asserts the live parse carries no key this build does not know, so
  // the next added field is a red bench instead of a dead ingestion.
  .passthrough();
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
  // Passthrough for the same reason every sibling here is: this mirrors a shape the forge owns
  // and extends, and a strict mirror turns an additive upstream change into a dead ingestion.
  .passthrough();
export type TemplateRatio = z.infer<typeof templateRatioSchema>;

export const templateFontSchema = z
  .object({
    /** What After Effects reports, which is a PostScript name far more often than a family. */
    family: z.string().min(1),
    layers: z.number().int().nonnegative(),
    /**
     * The face's own PostScript name, when the parse read one.
     *
     * `family` has always carried this in practice — AE reports `HeadingNow-36CompBold`, not
     * "Heading Now" — which is why the font-gap diff is case- and separator-insensitive.
     */
    postScriptName: z.string().nullish(),
    /**
     * Whether the face is installed where the parse ran. **`null` is the normal answer**: the
     * library verb is called without `--fonts`, so it cannot know, and null means UNKNOWN rather
     * than "missing". Treating it as missing would report every template as unrenderable.
     */
    installed: z.boolean().nullish(),
  })
  .passthrough();
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
    /**
     * Every DISTINCT string the design currently contains — which is NOT what the name says.
     *
     * Measured 2026-09-20 against the real parse: 5 of 5 entries on template 133 and 14 of 15
     * on a real animated template are also slot values. That is not a bug in either producer,
     * it is what both of them do by construction: `_slot_kind` makes EVERY enabled text layer
     * in a delivery comp a slot, and `figmaTemplateParse` pushes every text node's characters
     * the same way. So "static" cannot mean "copy the API will never change" — there is
     * essentially no such copy in a delivery comp, and a caller filtering on this field to
     * find untouchable text would be wrong about nearly every line.
     *
     * Read it as: the authored copy corpus, useful for tone and length samples. To find copy
     * a render will not touch, compare against `slots[].instances[].sample` yourself.
     * Renaming it is a producer-side change across both the AEP and Figma paths.
     */
    staticText: z
      .array(
        z
          .object({
            value: z.string().nullable(),
            font: z.string().nullable().default(null),
            comp: z.string(),
          })
          .passthrough(),
      )
      .default([]),
    warnings: z.array(z.string()).default([]),
  })
  .strip();
export type TemplateParse = z.infer<typeof templateParseSchema>;

/** The geometry a gallery card needs, without the full AEP parse document. */
export const templatePreviewSchema = z
  .object({
    parser: z.string().min(1),
    sourceFamily: templateSourceFamilySchema,
    filename: z.string().optional(),
    comps: z.array(
      templateCompSchema.pick({
        name: true,
        width: true,
        height: true,
        durationSec: true,
        isDelivery: true,
      }),
    ),
    ratios: z.array(
      templateRatioSchema.pick({ ratio: true, width: true, height: true, comps: true }),
    ),
    slots: z.array(
      templateSlotSchema.pick({
        key: true,
        kind: true,
        comps: true,
        box: true,
        placement: true,
        instances: true,
      }),
    ),
  })
  .strict();
export type TemplatePreview = z.infer<typeof templatePreviewSchema>;

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
    /**
     * What a person calls this template: `media.assets.title`, which members can write. Null
     * means nobody named it — render `templateDisplayName(parse.filename)` rather than a uuid.
     */
    displayName: z.string().nullable().default(null),
    /**
     * The exact template bytes this source was PROMOTED as — the version a render is pinned to.
     *
     * Not the source revision (that is `versionId`, an upload of the file someone dropped in) and
     * not the contract hash (that is the field vocabulary). This is the digest of the package the
     * renderer opens. Null until promotion, and null for a source the fleet never published.
     *
     * A template's LIVE version can differ from this one: the graph's pointer moves during a fork
     * delivery. Where that matters, ask the fleet through the pin route rather than assuming this
     * row is current — see template-forge `docs/TEMPLATE_IDENTITY.md`.
     */
    aepSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .nullable()
      .default(null),
    /**
     * sha256 of the file someone dropped in for the CURRENT source revision (the browser computes
     * it at upload, `media.assets.checksum`). Lets a drop of the same bytes open this template
     * instead of creating a second one. Null for an upload that recorded none.
     */
    sourceChecksum: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .nullable()
      .default(null),
    parseError: z.string().nullable().default(null),
    parsedAt: z.string().nullable().default(null),
    createdAt: z.string(),
    updatedAt: z.string().nullable().default(null),
  })
  .strict();
export type TemplateSource = z.infer<typeof templateSourceSchema>;

/** `GET /api/ai-studio/templates` item: full source facts plus only card-sized parse geometry. */
export const templateSourceSummarySchema = templateSourceSchema
  .omit({ parse: true })
  .extend({ parse: templatePreviewSchema.nullable().default(null) })
  .strict();
export type TemplateSourceSummary = z.infer<typeof templateSourceSummarySchema>;

/** `PATCH /api/ai-studio/templates/:assetId` — rename the template's Library asset. */
export const renameTemplateSourceRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
  })
  .strict();
export type RenameTemplateSourceRequest = z.infer<typeof renameTemplateSourceRequestSchema>;

/** A font the template needs, against what the brand actually holds. */
export const templateFontStatusSchema = z
  .object({
    family: z.string().min(1),
    layers: z.number().int().nonnegative(),
    held: z.boolean(),
    /**
     * Which repository the held face came from. Absent when the caller only had family
     * names to compare and could not say. `house` is how a vendor face (Gotham,
     * Urbanchrome) reads once it is in the shared repository — before it existed, such a
     * face was reported missing for every brand, because no brand had "uploaded" it.
     */
    scope: fontLicenceScopeSchema.optional(),
  })
  .strict();
export type TemplateFontStatus = z.infer<typeof templateFontStatusSchema>;

export const templateFontReadinessSchema = z
  .object({
    fonts: z.array(templateFontStatusSchema),
    missing: z.number().int().nonnegative(),
    parseState: templateParseStateSchema,
  })
  .strict();
export type TemplateFontReadiness = z.infer<typeof templateFontReadinessSchema>;

/** Browser-safe request for the explicit dry-run-then-install flow. */
export const templateFontPushRequestSchema = z
  .object({
    families: z.array(z.string().trim().min(1)).min(1).optional(),
    fire: z.boolean().default(false),
  })
  .strict();
export type TemplateFontPushRequest = z.infer<typeof templateFontPushRequestSchema>;

const templateFontPushFileSchema = z
  .object({ filename: z.string().min(1), bytes: z.number().int().nonnegative() })
  .strict();
const templateFontPushOutcomeSchema = z
  .object({ filename: z.string().min(1), postScriptName: z.string().min(1) })
  .strict();

/** Public result only. Forge workspace coordinates, URLs, headers and attachment ids stay server-side. */
export const templateFontPushResponseSchema = z.discriminatedUnion('fired', [
  z
    .object({
      fired: z.literal(false),
      families: z.array(z.string().min(1)),
      files: z.array(templateFontPushFileSchema),
    })
    .strict(),
  z
    .object({
      fired: z.literal(true),
      families: z.array(z.string().min(1)),
      linked: z.array(templateFontPushOutcomeSchema),
      alreadyLinked: z.array(templateFontPushOutcomeSchema),
      refused: z.array(
        z.object({ filename: z.string().min(1), reason: z.string().min(1) }).strict(),
      ),
      wrote: z.boolean(),
    })
    .strict(),
]);
export type TemplateFontPushResponse = z.infer<typeof templateFontPushResponseSchema>;

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

/**
 * Distinct font families a parse needs, normalized and deduped for the `fonts[]` column.
 *
 * `layers: 0` faces are dropped, and that is not tidying — the `fonts[]` column IS the render
 * gate. `fleetFontsFor` refuses the whole render with "No stored face for: X. Upload them
 * before rendering" if the brand does not hold every name in it, so a face no delivery layer
 * renders is a face that can block a render nobody needed it for. Measured on production:
 * template 133's gate demanded Poppins-Bold, Poppins-Light and Poppins-SemiBold while only
 * SemiBold reaches a delivery layer (9 of them); the other two come from `used_fonts`, which
 * reads the WHOLE project — an animator keyframe or a comp that never ships.
 *
 * The guard matters more than the filter. When NOTHING reads above zero the tally itself is
 * untrustworthy — the parse counts text off delivery layers only, so a design whose copy all
 * lives one precomp down legitimately reports zero everywhere — and an empty gate list would
 * let a render go out in a substituted face, which is the failure this gate exists to prevent.
 * So: filter when the tally demonstrably counted something, keep every face when it did not.
 */
export function templateParseFontFamilies(parse: TemplateParse): string[] {
  const counted = parse.fonts.some((font) => (font.layers ?? 0) > 0);
  const used = counted ? parse.fonts.filter((font) => (font.layers ?? 0) > 0) : parse.fonts;
  return [...new Set(used.map((font) => font.family.trim()).filter(Boolean))].sort();
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
  /**
   * Licence scope per held family key, when the caller resolved from the shared font
   * repository and therefore knows. Optional so the plain family-name call sites keep
   * working unchanged.
   */
  scopeByKey?: ReadonlyMap<string, FontLicenceScope>,
): TemplateFontStatus[] {
  const heldSet = new Set(held.map(normalizeTemplateFontFamily));
  return needed.map((font) => {
    const key = normalizeTemplateFontFamily(font.family);
    const scope = scopeByKey?.get(key);
    return {
      family: font.family,
      layers: font.layers,
      held: heldSet.has(key),
      ...(scope ? { scope } : {}),
    };
  });
}

/** One comparison key for parsed PostScript names, uploaded families and install selection. */
export function normalizeTemplateFontFamily(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}
