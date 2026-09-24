// What a brand decided about one dynamic variable in its own template.
//
// The parse produces slots that are TYPED AND UNLABELLED, on purpose: no generic role deriver
// exists, and a guessed role is worse than no role because it silently binds the wrong field.
// This is the other half — the part a person supplies, and the input to the `slots[]` the forge
// sends at promote, which is what writes a role with `role_source: 'human'`, the top of the
// precedence chain (human > agent > declared > detected).
//
// It is a separate record from the parse because it has a different owner. `media.template_sources`
// is member-read-only and stays that way: a client that could edit a parse could claim a template
// needs no fonts and turn a pre-flight refusal into a blank render. Intent is not a parse.

import { z } from 'zod';
import { apiRenderVariableKindSchema } from '../ai-studio/api-renders';
import { slotRoleSchema } from '../ai-studio/slot-roles';

/**
 * Where a value comes from per render, when it is not static.
 *
 * Shaped after the render contract's own `x-record.bindings[]`. `source` is open rather than an
 * enum because the product-feed table this will mostly address does not exist yet, and an enum
 * written now would have to be widened to add the first real source — the migration says the same
 * thing about its CHECK constraint.
 */
export const templateSlotBindingSchema = z
  .object({
    source: z.string().min(1),
    path: z.string().min(1),
    label: z.string().optional(),
  })
  .strict();
export type TemplateSlotBinding = z.infer<typeof templateSlotBindingSchema>;

/**
 * A pinned Library asset, for a media slot's default.
 *
 * Version-pinned like every other Library reference on the render path: an unpinned default would
 * silently change what renders when someone uploads a new version of the same asset.
 */
export const templateSlotAssetValueSchema = z
  .object({
    assetId: z.string().uuid(),
    versionId: z.string().uuid().optional(),
  })
  .strict();
export type TemplateSlotAssetValue = z.infer<typeof templateSlotAssetValueSchema>;

/** A static default: a scalar for text/number/boolean/colour, or a pinned asset for media. */
export const templateSlotDefaultValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  templateSlotAssetValueSchema,
  z.null(),
]);
export type TemplateSlotDefaultValue = z.infer<typeof templateSlotDefaultValueSchema>;

export const templateSourceSlotSchema = z
  .object({
    assetId: z.string().uuid(),
    slotKey: z.string().min(1),
    brandId: z.string().uuid(),
    kind: apiRenderVariableKindSchema,
    /** What a person calls this knob. Null means "the parse's own name is fine". */
    publicName: z.string().nullable(),
    role: slotRoleSchema.nullable(),
    roleSource: z.literal('human'),
    /**
     * An override of the designer's own composed length in the tightest comp — not a limit After
     * Effects enforces. Null means "use what the parse measured".
     */
    charBudget: z.number().int().nonnegative().nullable(),
    required: z.boolean().nullable(),
    defaultValue: templateSlotDefaultValueSchema.nullable(),
    binding: templateSlotBindingSchema.nullable(),
    updatedBy: z.string().uuid().nullable(),
    updatedAt: z.string(),
  })
  .strict();
export type TemplateSourceSlot = z.infer<typeof templateSourceSlotSchema>;

/** The editable half. Everything absent is left as it was — this is a patch, not a replacement. */
export const templateSourceSlotEditSchema = z
  .object({
    slotKey: z.string().min(1),
    publicName: z.string().max(200).nullable().optional(),
    role: slotRoleSchema.nullable().optional(),
    charBudget: z.number().int().nonnegative().max(100_000).nullable().optional(),
    required: z.boolean().nullable().optional(),
    defaultValue: templateSlotDefaultValueSchema.nullable().optional(),
    binding: templateSlotBindingSchema.nullable().optional(),
  })
  .strict();
export type TemplateSourceSlotEdit = z.infer<typeof templateSourceSlotEditSchema>;

export const templateSourceSlotEditRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    slots: z.array(templateSourceSlotEditSchema).min(1).max(500),
  })
  .strict();
export type TemplateSourceSlotEditRequest = z.infer<typeof templateSourceSlotEditRequestSchema>;

/**
 * Two slots may not claim one role.
 *
 * The fleet registry's `registrySync` refuses this with a 422, so catching it here is not
 * belt-and-braces: it is the difference between a person seeing "price is already taken by
 * Discount_1" while they are editing, and a promote failing halfway with the run already built.
 *
 * Returns the roles claimed more than once, in the order they were first seen.
 */
export function duplicateSlotRoles(
  slots: ReadonlyArray<{ slotKey: string; role?: string | null }>,
): string[] {
  const seen = new Map<string, number>();
  for (const slot of slots) {
    if (!slot.role) continue;
    seen.set(slot.role, (seen.get(slot.role) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([role]) => role);
}

/**
 * Does a default value fit the slot's kind?
 *
 * Cheap, and worth having: a `#ff0000` typed into a number slot renders as nothing at all, and
 * the render succeeds while producing a frame nobody asked for. The colour check is loose on the
 * leading `#` because the contract's own pattern is (`^#?[0-9A-Fa-f]{6}$`).
 */
export function templateSlotDefaultFitsKind(
  kind: string,
  value: TemplateSlotDefaultValue | null | undefined,
): boolean {
  if (value === null || value === undefined) return true;
  switch (kind) {
    case 'text':
    case 'enum':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'color':
      return typeof value === 'string' && /^#?[0-9A-Fa-f]{6}$/.test(value);
    case 'image':
    case 'video':
      return typeof value === 'object' && value !== null && 'assetId' in value;
    default:
      // An unknown kind is not a licence to accept anything — but it is also not this function's
      // place to refuse a slot the parser understood and this build does not.
      return true;
  }
}

/** A video slot's clip in the clip's own seconds, as `apiRenderVariableSchema.clip` carries it. */
export type TemplateSlotClip = { fromSec: number; toSec: number; playsSec: number };

const seconds = (value: number) => Math.round(value * 1e4) / 1e4;

/**
 * What a video slot asks of its clip across every comp it appears in: the clip seconds it plays
 * and the longest it is on screen. `toSec` is the number that matters — a clip shorter than it
 * runs out before the layer does. Null when no instance measured one: not a video, an older
 * parse, or a time-remapped layer (whose `clipWhy` says so).
 */
export function clipOfSlot(slot: {
  instances?: ReadonlyArray<{
    clip?: { inSec: number; outSec: number; clipInSec: number; clipOutSec: number } | null;
  }> | null;
}): TemplateSlotClip | null {
  const uses = (slot.instances ?? []).flatMap((instance) => (instance.clip ? [instance.clip] : []));
  if (uses.length === 0) return null;
  return {
    fromSec: seconds(Math.min(...uses.map((use) => use.clipInSec))),
    toSec: seconds(Math.max(...uses.map((use) => use.clipOutSec))),
    playsSec: seconds(Math.max(...uses.map((use) => use.outSec - use.inSec))),
  };
}

/**
 * A parsed slot, plus what the brand said about it, as the variable control the canvas already
 * knows how to render.
 *
 * This is the whole bridge between the Library and the render node, and it is small because the
 * two vocabularies were deliberately unified: `templateSlotSchema.kind` IS
 * `apiRenderVariableKindSchema`, so a parsed slot and a promoted template's variable are the same
 * kind of thing and one control set serves both. `RenderVariableFields` renders
 * `ApiRenderVariable[]`; this is how a template that has never been promoted gets some.
 *
 * The edit WINS over the parse wherever it has an opinion, and only there. A null in an edit means
 * "no opinion", not "empty" — which is why every field falls back rather than being overwritten
 * with a null.
 */
export function templateSlotAsRenderVariable(
  slot: {
    key: string;
    name: string;
    kind: string;
    charBudget?: number | null;
    comps?: readonly string[];
    sample?: string | null;
    instances?: Parameters<typeof clipOfSlot>[0]['instances'];
  },
  edit?: {
    publicName?: string | null;
    role?: string | null;
    charBudget?: number | null;
    required?: boolean | null;
  } | null,
): {
  key: string;
  label: string;
  kind: string;
  required: boolean;
  multiple: boolean;
  accept: string[];
  options: string[];
  description: string | null;
  reserved: boolean;
  role: string | null;
  roleSource: 'human' | null;
  charBudget: number | null;
  comps: string[];
  sample: string | null;
  placement: null;
  clip: TemplateSlotClip | null;
} {
  return {
    key: slot.key,
    label: edit?.publicName?.trim() || slot.name || slot.key,
    kind: slot.kind,
    // A parse cannot know what is required — nothing in an AEP says a knob must be filled. So
    // `required` is only ever true because a person said so.
    required: edit?.required ?? false,
    multiple: false,
    accept: [],
    options: [],
    description: null,
    reserved: false,
    role: edit?.role ?? null,
    roleSource: edit?.role ? 'human' : null,
    charBudget: edit?.charBudget ?? slot.charBudget ?? null,
    comps: [...(slot.comps ?? [])],
    sample: slot.sample ?? null,
    // Placement comes from the parse's own slot boxes and is attached by the render path's
    // adapter, which has the fit math. A Library editor has no frame to place anything against.
    placement: null,
    clip: clipOfSlot(slot),
  };
}
