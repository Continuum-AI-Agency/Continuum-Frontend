// Elements — a named, reusable subject (a model, a product, a place, a style) that a
// canvas node can point at instead of re-attaching the same images every time.
//
// An Element is stored as a `media.asset_groups` row with `kind='element'`: its members
// are ordinary Library assets in `asset_group_members` (position-ordered, <=8), and
// everything else lives in the group's existing `origin_ref` jsonb bag. There is no
// Element table and no `metadata` column — see the migration
// 20260824100000_asset_groups_element_kind.sql for why.
//
// WHY the interesting parts of this file are PURE FUNCTIONS rather than backend code:
//
//   * `buildElementReferencePrompt` turns nine categories into one unit test over a
//     string instead of nine paid image generations, and it lets the panel show the
//     operator exactly what will be sent.
//   * `resolveElementRefs` and `buildElementReferenceLabel` are the emission rules. The
//     canvas node (Frontend) and the backend must agree about them exactly — an Element
//     that emits a different ref set on each side is the drift this package exists to
//     prevent.
//
// Reference material: docs/research/element-reference-generation.md — §2 the call
// shape, §3 the prompt skeleton, §4 per-category format, §5 these templates, §8.6 and
// §9 the emission/fallback semantics.

import { z } from 'zod';
import { type LibraryImageRef, libraryImageRefSchema } from './library-reference';

// --- Vocabulary --------------------------------------------------------------

export const ELEMENT_CATEGORIES = [
  'model',
  'character',
  'product',
  'object',
  'material',
  'setting',
  'style',
  'moodboard',
  'general',
] as const;

export const elementCategorySchema = z.enum(ELEMENT_CATEGORIES);
export type ElementCategory = z.infer<typeof elementCategorySchema>;

/**
 * Members per Element. Enforced in the ROUTE — nothing below it enforces anything:
 * `media.asset_group_members` has no cap and `assetGroupSchema` is `.min(1)` with no
 * `.max`. Chosen to sit under the provider's 10 high-fidelity object slots with room
 * left for the palette, logo and environment plate the same node usually also carries.
 */
export const ELEMENT_MEMBER_LIMIT = 8;

/**
 * The ceiling on FALLBACK member refs for the two person categories.
 * `gemini-3.1-flash-image` carries four character slots, not ten — a `model` Element
 * with five raw members is over the model's budget before any other reference is added.
 * This is the strongest argument for generating a person Element's reference eagerly.
 */
export const ELEMENT_PERSON_FALLBACK_LIMIT = 4;

/** Categories whose reference is a person, and which therefore need a rights basis. */
export const ELEMENT_PERSON_CATEGORIES: readonly ElementCategory[] = ['model', 'character'];

export const isElementPersonCategory = (category: ElementCategory): boolean =>
  ELEMENT_PERSON_CATEGORIES.includes(category);

/**
 * Seeded on every generated Element reference asset. Registered assets are real Library
 * rows, so without a tag a brand with twenty Elements would find its Library full of
 * near-identical studio shots; the browse surfaces exclude this tag by default
 * (HIDDEN_LIBRARY_TAGS in ./library-browse). Search still finds them.
 */
export const ELEMENT_REFERENCE_TAG = 'element-reference';

// --- The stored shape --------------------------------------------------------

/**
 * `media.asset_groups.origin_ref` for an Element. The two existing writers of this
 * column stamp `{ kind, <sourceId> }`; this adds the Element's own state.
 *
 * `referenceHistory` is an ordered list of ASSET ids, not asset_versions: the version
 * RPC guards its storage path (`{brand}/{asset}/…`) and Studio writes to
 * `{brand}/canvas-creations/…`, so a regenerated reference cannot become v2 of the
 * existing asset without a bigger change. Each regeneration is therefore a new asset,
 * and set-default flips one field.
 */
export const elementOriginRefSchema = z
  .object({
    kind: z.literal('element').optional(),
    category: elementCategorySchema,
    guidelines: z.string().max(2000).nullable().optional(),
    rightsNote: z.string().max(500).nullable().optional(),
    referenceHistory: z.array(z.string().uuid()).default([]),
    defaultReferenceAssetId: z.string().uuid().nullable().default(null),
  })
  .passthrough();
export type ElementOriginRef = z.infer<typeof elementOriginRefSchema>;

export const elementMemberSchema = z
  .object({
    assetId: z.string().uuid(),
    position: z.number().int().nonnegative(),
  })
  .strict();
export type ElementMember = z.infer<typeof elementMemberSchema>;

export const elementRecordSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    name: z.string().min(1).max(200),
    slug: z.string().min(1).max(200),
    category: elementCategorySchema,
    guidelines: z.string().nullable(),
    rightsNote: z.string().nullable(),
    members: z.array(elementMemberSchema).max(ELEMENT_MEMBER_LIMIT),
    referenceHistory: z.array(z.string().uuid()),
    defaultReferenceAssetId: z.string().uuid().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type ElementRecord = z.infer<typeof elementRecordSchema>;

// --- Failure codes -----------------------------------------------------------

// Named, not numbered: the caller needs to know what to DO about it. A member that is a
// video and a member that belongs to another brand are both "bad member" to an HTTP 422
// and completely different to a person fixing it.
export const elementErrorCodeSchema = z.enum([
  'element_not_found',
  'element_name_conflict',
  'element_member_limit_exceeded',
  'element_member_not_image',
  'element_member_wrong_brand',
  'element_member_not_found',
  'element_rights_note_required',
  'element_reference_not_in_history',
  'element_reference_generation_failed',
]);
export type ElementErrorCode = z.infer<typeof elementErrorCodeSchema>;

// --- Wire envelopes ----------------------------------------------------------

const memberIdsSchema = z
  .array(z.string().uuid())
  .min(1)
  .max(ELEMENT_MEMBER_LIMIT, { message: 'element_member_limit_exceeded' });

export const createElementRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    name: z.string().min(1).max(200),
    category: elementCategorySchema,
    guidelines: z.string().max(2000).nullable().optional(),
    rightsNote: z.string().max(500).nullable().optional(),
    memberAssetIds: memberIdsSchema,
  })
  .strict();
export type CreateElementRequest = z.infer<typeof createElementRequestSchema>;

export const updateElementRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    name: z.string().min(1).max(200).optional(),
    guidelines: z.string().max(2000).nullable().optional(),
    rightsNote: z.string().max(500).nullable().optional(),
    memberAssetIds: memberIdsSchema.optional(),
  })
  .strict();
export type UpdateElementRequest = z.infer<typeof updateElementRequestSchema>;

export const elementResponseSchema = z.object({ element: elementRecordSchema }).strict();
export const listElementsResponseSchema = z
  .object({ elements: z.array(elementRecordSchema) })
  .strict();
export type ListElementsResponse = z.infer<typeof listElementsResponseSchema>;

export const generateElementReferenceResponseSchema = z
  .object({
    element: elementRecordSchema,
    referenceAssetId: z.string().uuid(),
    /** True when this generation also became the default (i.e. there was none before). */
    becameDefault: z.boolean(),
  })
  .strict();
export type GenerateElementReferenceResponse = z.infer<
  typeof generateElementReferenceResponseSchema
>;

/** `assetId: null` CLEARS the default — the same endpoint sets and unsets. */
export const setElementDefaultReferenceRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    assetId: z.string().uuid().nullable(),
  })
  .strict();
export type SetElementDefaultReferenceRequest = z.infer<
  typeof setElementDefaultReferenceRequestSchema
>;

// --- Identity ----------------------------------------------------------------

/**
 * `external_key = 'element:{slug}'`, matching the existing `'paid_creative:{runId}'`
 * convention, so the group's `unique (brand_id, kind, external_key)` does the
 * duplicate-detection. Derived ONCE at create and immutable afterwards: renaming edits
 * the `title` column, never the key, so a rename cannot orphan the Element's identity.
 */
export const elementSlug = (name: string): string => {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : 'element';
};

export const elementExternalKey = (slug: string): string => `element:${slug}`;

// --- Emission ----------------------------------------------------------------

/**
 * What an Element node actually sends downstream.
 *
 * With a generated reference: exactly ONE ref — that is the whole point, since an
 * Element in fallback otherwise monopolises the node's reference budget and two
 * Elements cannot be composed at all.
 *
 * Without one: the raw members, in `position` order (the prompt manifest depends on
 * that order), truncated to the model's budget for the category. Fallback is a real
 * mode, not an error path — an Element is usable the moment its members exist.
 */
export const resolveElementRefs = (element: {
  category: ElementCategory;
  members: readonly ElementMember[];
  defaultReferenceAssetId: string | null;
}): LibraryImageRef[] => {
  if (element.defaultReferenceAssetId) {
    return [{ asset_id: element.defaultReferenceAssetId }];
  }
  const limit = isElementPersonCategory(element.category)
    ? ELEMENT_PERSON_FALLBACK_LIMIT
    : ELEMENT_MEMBER_LIMIT;
  return [...element.members]
    .sort((left, right) => left.position - right.position)
    .slice(0, limit)
    .map((member) => ({ asset_id: member.assetId }));
};

/**
 * The prompt line that rides WITH the emitted image.
 *
 * An Element that contributes an image but no words has handed the model an ambiguity
 * it will resolve on its own — Google's own rule is that unlabelled references make
 * "the robot" mean any of the robots in the inputs. The second sentence is the shipped
 * house wording from the compiled `<references>` block, so the literal canvas path
 * stops being the weaker of the two.
 */
export const buildElementReferenceLabel = (params: {
  category: ElementCategory;
  name: string;
  slot: number;
}): string =>
  `Reference image #${params.slot} is the ${params.category} reference for "${params.name}". ` +
  'Preserve it exactly; do not redraw, restyle or improve it.';

// --- Reference generation prompt ---------------------------------------------

/**
 * The residue that resists positive phrasing. Load-bearing prohibitions live in each
 * template's FRAMING line instead, phrased as what the frame CONTAINS — Google's
 * documented practice is that "an empty, deserted street" beats "no cars".
 *
 * The first two clusters are the two things a multi-image reference call actually does
 * wrong: it pastes the inputs into a collage, and it burns text into the frame.
 */
const UNIVERSAL_NEGATIVES =
  'collage, grid, contact sheet, split frame, montage, duplicated subject, second subject, ' +
  'text, letters, numbers, captions, watermark, border, frame, colour-checker chart, ruler, ' +
  'mockup template';

/**
 * Forcing an inventory step before the image step measurably reduces the "paste the
 * inputs together" reading, and the explicit single-output clause is DeepMind's own
 * idiom inverted.
 */
const UNIVERSAL_CLOSE =
  'First, silently identify what all of the attached photographs have in common about ' +
  'the subject. Then produce ONE new image of that subject. Produce exactly one image — ' +
  'not a composite, not a set, not a copy of any attached photograph.';

const MANIFEST_NOUN: Record<ElementCategory, string> = {
  model: 'source photograph of the person',
  character: 'source photograph of the character',
  product: 'source photograph of the product',
  object: 'source photograph of the object',
  material: 'source photograph of the material',
  setting: 'source photograph of the place',
  style: 'source image carrying the style',
  moodboard: 'moodboard tile',
  general: 'source image of the subject',
};

interface CategoryTemplate {
  /** ALWAYS sent. Omit it and Gemini inherits the aspect ratio of the LAST input image. */
  aspectRatio: string;
  body: (memberCount: number) => string;
  negatives: string;
}

const TEMPLATES: Record<ElementCategory, CategoryTemplate> = {
  model: {
    aspectRatio: '4:5',
    negatives:
      'alternate outfit, dramatic pose, beauty retouching, skin smoothing, waxy skin, ' +
      'age change, second person, product, packaging, logo',
    body: (n) => `Create a clean casting reference photograph of one recurring person.

The ${n} attached photographs are all of the SAME person, photographed on
different days, in different clothes, in different places.

Preserve exactly: facial structure and proportions, hair colour, length and
style, skin tone, eye colour, apparent age, body build, and any distinguishing
marks such as freckles, scars, moles or facial hair. The person's features must
remain completely unchanged from the attached photographs.

Everything that differs between the attached photographs is free to change and
should: clothing, pose, expression, background, location, lighting mood, camera
angle, crop and colour grade. None of those describe this person.

Show exactly one adult, waist-up with the face large in frame, facing camera,
neutral relaxed expression, arms down, even soft daylight from the front, a plain
uncluttered mid-grey background and nothing else in frame. Natural skin texture
with visible pores.`,
  },

  character: {
    aspectRatio: '4:5',
    negatives:
      'cropped limbs, feet out of frame, second figure, alternate costume, prop, scene, ' +
      'environment, turnaround, multiple views',
    body: (n) => `Create a character reference photograph of one recurring costumed figure.

The ${n} attached photographs are all of the SAME character.

Preserve exactly: facial structure and proportions, hair colour, length and
style, skin tone, apparent age, body build, and the costume — garment colourway,
cut, seam placement, silhouette, footwear, and every fixed accessory. The
character's features and costume must remain completely unchanged from the
attached photographs.

Everything that differs between the attached photographs is free to change:
background, location, pose, expression, lighting mood, camera angle, colour
grade.

Show exactly one figure, full body head to toe with the whole silhouette inside
the frame and a small even margin on every side, standing relaxed in an A-pose
facing camera, under even soft frontal light, on a plain pure white background
with nothing else in frame.`,
  },

  product: {
    aspectRatio: '1:1',
    negatives:
      'hands, model, prop, second unit, multiple views, packaging variant, alternate flavour, ' +
      'invented label text, mockup template, reflective floor, grey background, coloured ' +
      'background, gradient backdrop, swing tag, promotional text',
    body: (n) => `Create a clean product reference photograph of one physical product.

The ${n} attached photographs are all of the SAME product unit, photographed in
different settings.

Preserve exactly: silhouette and proportions, packaging geometry, cap or closure,
material and finish, colourway, label placement and label proportions, logo
position, and every distinctive functional detail. The product must remain
completely unchanged from the attached photographs.

Reproduce the label artwork exactly as it appears in the attached photographs.
Where label text is not legible in every attached photograph, keep it visually
faithful rather than inventing wording.

Everything that differs between the attached photographs is free to change:
scene, props, surface, hands, background, lighting style, reflections, shadows
and retouching.

Show exactly one unit, upright and centred at a three-quarter hero angle, filling
at least eighty-five percent of the frame, on a pure white (#FFFFFF) seamless
background under soft even studio light, with a soft contact shadow directly
beneath it and nothing else in frame.`,
  },

  object: {
    aspectRatio: '1:1',
    negatives:
      'room, scene, prop, second object, multiple views, turnaround, dramatic perspective, ' +
      'wide-angle distortion, hard cast shadow, styling, decoration, vignette',
    body: (n) => `Create a clean reference photograph of one object.

The ${n} attached photographs are all of the SAME object, photographed in
different settings.

Preserve exactly: silhouette and proportions, construction and joinery, material,
surface finish, colour, and every distinctive functional detail. The object must
remain completely unchanged from the attached photographs.

Everything that differs between the attached photographs is free to change:
scene, props, surface, hands, background, lighting style, reflections, shadows
and retouching.

Show exactly one object, centred at a three-quarter view with natural, near-
orthographic perspective and no wide-angle exaggeration, on a plain neutral
mid-grey (#808080) seamless background under flat even lighting, with no strong
directional shadow and nothing else in frame.`,
  },

  material: {
    aspectRatio: '1:1',
    negatives:
      'object, product, garment shape, silhouette, sample edge, seam, background, vignette, ' +
      'hard shadow, perspective, tilt, measuring tape, colour chart',
    body: (n) => `Create a clean material swatch reference.

The ${n} attached photographs all show the SAME material.

Preserve exactly: surface texture, weave, grain or pattern, the scale of the
repeat, colour, and finish — how matte or glossy it is and how it takes light.

Everything that differs between the attached photographs is free to change: the
object the material was photographed on, its silhouette and edges, background,
directional shadow, and perspective.

Show the material flat on, filling the entire frame edge to edge, photographed
square to the surface so there is no perspective, evenly lit with no directional
shadow and no hotspot, at one consistent scale, reading as a continuous sample of
the material rather than a photograph of a thing made from it.`,
  },

  setting: {
    aspectRatio: '16:9',
    negatives:
      'person, people, crowd, product, foreground subject, fisheye, extreme wide angle, ' +
      'tilt-shift, HDR halo',
    body: (n) => `Create a clean environment plate of one place.

The ${n} attached photographs are all of the SAME place.

Preserve exactly: architecture and structure, spatial layout and the relationship
between areas, surfaces and materials, the characteristic quality and direction
of light, time of day, and the ambient palette.

Everything that differs between the attached photographs is free to change: the
specific framing of any one shot, and the vantage point.

Show the place empty with no person, product or foreground subject present, as a
wide establishing view at eye level, with a normal lens and natural perspective.`,
  },

  style: {
    aspectRatio: '1:1',
    negatives:
      'recognisable subject, person, face, product, building, landscape, logo, letterform, ' +
      'composition, focal point, depicted object',
    body: (n) => `Create a style reference field.

The ${n} attached images all share ONE visual style.

Preserve exactly: the palette and how the colours relate, the rendering technique
and mark-making, texture and grain, contrast and tonal grade, edge quality, and
the level of abstraction.

Discard every recognisable subject, object, face, place, composition and piece of
text in the attached images. None of them are the style.

Produce an abstract, non-representational field — colour, texture, edge and grade
only — such that a viewer could correctly describe the style of the attached
images from it without being able to name a single thing depicted in it.`,
  },

  moodboard: {
    aspectRatio: '1:1',
    negatives:
      'board, panel, tile, pinboard, mood board layout, torn paper, polaroid, swatch card, ' +
      'arrangement of images, quoted photograph',
    body: (n) => `Create a single unified direction image from a set of references.

The ${n} attached images are a moodboard: separate references collected because
together they express one creative direction.

Preserve exactly: the palette and its proportions, the texture family, the tonal
range and contrast, and the overall register and feeling.

Discard the literal content of every tile. Do not reproduce, arrange or quote any
individual image.

Produce one continuous image — a single unbroken field, not a board, not a grid,
not an arrangement of panels. A viewer must not be able to point at which
attached image any part of it came from.`,
  },

  general: {
    aspectRatio: '1:1',
    negatives: 'scene, prop, second subject, dramatic lighting, background detail',
    body: (n) => `Create a clean reference image of one subject.

The ${n} attached images are all of the SAME subject.

Preserve everything the attached images agree on: the subject's shape,
proportions, colour, material and distinctive details.

Everything that differs between them is free to change: setting, background,
lighting, framing and styling.

Show exactly one subject, centred, on a plain neutral background under even
light, with nothing else in frame.`,
  },
};

export interface ElementReferencePrompt {
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
}

/**
 * Build the reference-generation call's prompt for one category.
 *
 * The manifest opens the prompt because the backend passes images UNLABELLED and purely
 * positional — the provider emits prompt text first, then image parts in array order —
 * so `- Image 1: …` lines are the only thing telling the model that several photographs
 * are one subject rather than several. This is the single cheapest mitigation for
 * duplicated-subject output.
 *
 * Operator guidelines go LAST, on purpose: the last words are the ones that must survive
 * a careless reader. The block is omitted entirely when empty — an empty section is a
 * question the model has to answer.
 */
export const buildElementReferencePrompt = (
  category: ElementCategory,
  memberCount: number,
  guidelines?: string | null,
): ElementReferencePrompt => {
  const template = TEMPLATES[category];
  const noun = MANIFEST_NOUN[category];
  const manifest = Array.from(
    { length: Math.max(memberCount, 0) },
    (_unused, index) => `- Image ${index + 1}: ${noun}.`,
  ).join('\n');

  const trimmedGuidelines = guidelines?.trim();
  const sections = [
    manifest,
    template.body(memberCount),
    UNIVERSAL_CLOSE,
    ...(trimmedGuidelines ? [`Operator guidance (highest priority): ${trimmedGuidelines}`] : []),
  ].filter((section) => section.length > 0);

  return {
    prompt: sections.join('\n\n'),
    negativePrompt: `${UNIVERSAL_NEGATIVES}, ${template.negatives}`,
    aspectRatio: template.aspectRatio,
  };
};

/** Exposed so the panel can preview the framing without building the whole prompt. */
export const elementReferenceAspectRatio = (category: ElementCategory): string =>
  TEMPLATES[category].aspectRatio;

export { libraryImageRefSchema as elementImageRefSchema };
