import { z } from 'zod';
import {
  type ApiRenderDeliveryTarget,
  apiRenderDeliveryTargetSchema,
  apiRenderEncodeOverrideSchema,
  apiRenderVariableKeySchema,
  apiRenderVariableMapSchema,
  compactEncodeBlock,
  ENCODE_SETTING_KEYS,
  type EncodeBlock,
  type EncodeSettingKey,
  type EncodeSettings,
  flattenEncodeSettings,
  forgeRowEvidenceMapSchema,
  unflattenEncodeSettings,
} from './api-renders';

export const API_RENDER_SETS_ROUTE = '/api/ai-studio/renders/sets';
export const FORGE_RENDER_SET_MAX_ROWS = 50;
export const FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH = 3;
/** Mirrors the `media.render_sets.description` check constraint. */
export const FORGE_RENDER_SET_MAX_DESCRIPTION = 500;
const descriptionSchema = z.string().max(FORGE_RENDER_SET_MAX_DESCRIPTION).nullable();

const encodeKeysSchema = z.array(z.enum(ENCODE_SETTING_KEYS));
export const forgeRenderSetEncodeClearSchema = z
  .object({
    default: encodeKeysSchema.optional(),
    outputs: z.record(z.string().min(1), encodeKeysSchema).optional(),
  })
  .strict();
export type ForgeRenderSetEncodeClear = z.infer<typeof forgeRenderSetEncodeClearSchema>;

/**
 * One row's output settings over its parent's: clear first, then override, per leaf and per
 * scope — the same order `variables` use. `undefined` when nothing is set anywhere.
 */
export function inheritEncodeBlock(
  parent: EncodeBlock | undefined,
  row: { encode?: EncodeBlock; clearedEncodeKeys?: ForgeRenderSetEncodeClear },
): EncodeBlock | undefined {
  const scope = (
    inherited: EncodeSettings | undefined,
    cleared: EncodeSettingKey[] | undefined,
    own: EncodeSettings | undefined,
  ) => {
    const flat = flattenEncodeSettings(inherited);
    for (const key of cleared ?? []) delete flat[key];
    return unflattenEncodeSettings(Object.assign(flat, flattenEncodeSettings(own)));
  };
  const ids = new Set([
    ...Object.keys(parent?.outputs ?? {}),
    ...Object.keys(row.encode?.outputs ?? {}),
    ...Object.keys(row.clearedEncodeKeys?.outputs ?? {}),
  ]);
  const outputs: Record<string, EncodeSettings> = {};
  for (const id of ids) {
    const merged = scope(
      parent?.outputs?.[id],
      row.clearedEncodeKeys?.outputs?.[id],
      row.encode?.outputs?.[id],
    );
    if (merged) outputs[id] = merged;
  }
  return compactEncodeBlock({
    default: scope(parent?.default, row.clearedEncodeKeys?.default, row.encode?.default),
    outputs,
  });
}

export const forgeRenderSetRowSchema = z
  .object({
    id: z.string().uuid(),
    parentId: z.string().uuid().nullable(),
    label: z.string().trim().min(1).max(200),
    overrides: apiRenderVariableMapSchema.default({}),
    /** Evidence belongs to this row's own values; edits remove the corresponding entry. */
    evidence: forgeRowEvidenceMapSchema.optional(),
    clearedKeys: z.array(apiRenderVariableKeySchema).default([]),
    outputIds: z.array(z.string().min(1)).default([]),
    /** Output settings authored on THIS row, keyed by public output id. Children inherit. */
    encode: apiRenderEncodeOverrideSchema.optional(),
    /** Inherited settings explicitly blanked back to the template. Reset removes both. */
    clearedEncodeKeys: forgeRenderSetEncodeClearSchema.optional(),
    /**
     * Where THIS row's render goes. Never inherited: a fork of a row that replaces ad X must not
     * silently replace ad X too — two renders racing for one creative slot.
     */
    delivery: apiRenderDeliveryTargetSchema.optional(),
  })
  .strict();
export type ForgeRenderSetRow = z.infer<typeof forgeRenderSetRowSchema>;

export const forgeRenderSetRowsSchema = z
  .array(forgeRenderSetRowSchema)
  .min(1)
  .max(FORGE_RENDER_SET_MAX_ROWS);

export const forgeRenderSetSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    bindingId: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    /** What this set is for, in the author's words. Null on a set that never had one. */
    description: descriptionSchema.default(null),
    templateKey: z.string().min(1),
    contractHash: z.string().min(1),
    revision: z.number().int().nonnegative(),
    rows: forgeRenderSetRowsSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type ForgeRenderSet = z.infer<typeof forgeRenderSetSchema>;

export const forgeRenderSetListResponseSchema = z
  .object({ items: z.array(forgeRenderSetSchema), nextCursor: z.null() })
  .strict();

export const createForgeRenderSetRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    bindingId: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    description: descriptionSchema.optional(),
    templateKey: z.string().min(1),
    contractHash: z.string().min(1),
    rows: forgeRenderSetRowsSchema,
  })
  .strict();
export type CreateForgeRenderSetRequest = z.infer<typeof createForgeRenderSetRequestSchema>;

export const updateForgeRenderSetRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    name: z.string().trim().min(1).max(200).optional(),
    description: descriptionSchema.optional(),
    rows: forgeRenderSetRowsSchema.optional(),
    /**
     * The contract these rows were checked against. Only with `rows`: a set moves to a republished
     * template by saving rows that fit it, never by relabelling rows written for the old one.
     */
    contractHash: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined || value.rows !== undefined || value.description !== undefined,
    { message: 'Update at least one of name, description or rows' },
  )
  .refine((value) => value.contractHash === undefined || value.rows !== undefined, {
    message: 'contractHash is only saved with rows',
    path: ['contractHash'],
  });
export type UpdateForgeRenderSetRequest = z.infer<typeof updateForgeRenderSetRequestSchema>;

/**
 * A state a set was left in, kept by the database: the end of an editing burst, the state before a
 * template change, or a revision something was rendered from. Newest 30 per set. Restoring one makes
 * a new set from its rows; nothing is ever written back over the set it came from.
 */
export const forgeRenderSetRevisionSchema = z
  .object({
    setId: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    name: z.string().min(1),
    contractHash: z.string().min(1),
    rows: forgeRenderSetRowsSchema,
    savedAt: z.string(),
  })
  .strict();
export type ForgeRenderSetRevision = z.infer<typeof forgeRenderSetRevisionSchema>;

export const forgeRenderSetRevisionListResponseSchema = z
  .object({ items: z.array(forgeRenderSetRevisionSchema) })
  .strict();

export interface ResolvedForgeRenderSetRow {
  id: string;
  rootRowId: string;
  parentRowId: string | null;
  path: string[];
  variables: z.infer<typeof apiRenderVariableMapSchema>;
  outputIds: string[];
  encode?: EncodeBlock;
  /** The row's own delivery only — see `forgeRenderSetRowSchema.delivery`. */
  delivery?: ApiRenderDeliveryTarget;
}

export function resolveForgeRenderSetRows(rows: ForgeRenderSetRow[]): ResolvedForgeRenderSetRow[] {
  const parsed = forgeRenderSetRowsSchema.parse(rows);
  const byId = new Map(parsed.map((row) => [row.id, row]));
  if (byId.size !== parsed.length) throw new Error('render_set_duplicate_row');
  if (!parsed.some((row) => row.parentId === null)) throw new Error('render_set_root_count');
  for (const row of parsed) {
    if (row.parentId !== null && !byId.has(row.parentId)) throw new Error('render_set_orphan');
  }

  const memo = new Map<string, ResolvedForgeRenderSetRow>();
  const visiting = new Set<string>();
  const visit = (row: ForgeRenderSetRow): ResolvedForgeRenderSetRow => {
    const found = memo.get(row.id);
    if (found) return found;
    if (visiting.has(row.id)) throw new Error('render_set_cycle');
    visiting.add(row.id);
    const parent = row.parentId === null ? null : visit(byId.get(row.parentId)!);
    const path = [...(parent?.path ?? []), row.id];
    if (path.length - 1 > FORGE_RENDER_SET_MAX_DESCENDANT_DEPTH) {
      throw new Error('render_set_depth_exceeded');
    }
    const variables = { ...(parent?.variables ?? {}) };
    for (const key of row.clearedKeys) delete variables[key];
    Object.assign(variables, row.overrides);
    const result = {
      id: row.id,
      rootRowId: path[0]!,
      parentRowId: row.parentId,
      path,
      variables,
      outputIds: row.outputIds.length ? [...row.outputIds] : [...(parent?.outputIds ?? [])],
      encode: inheritEncodeBlock(parent?.encode, row),
      ...(row.delivery ? { delivery: row.delivery } : {}),
    };
    visiting.delete(row.id);
    memo.set(row.id, result);
    return result;
  };
  // Array order is row order: a parent listed after its fork still resolves, and the output keeps
  // the order the rows were saved in.
  return parsed.map(visit);
}

/** One axis of a cross-product: a variable, and the values to walk across it. */
export type ForgeRenderSetAxis = { key: string; values: readonly string[] };

/**
 * Three headlines crossed with four pictures, as twelve rows.
 *
 * Forge had no cross-product at all. `crossBatches` exists, is tested and is shipped — and
 * takes `BatchItem` (`kind` plus `value`/`assetId`), which a `ForgeRenderSetRow` is not: its
 * payload is an `overrides` map, `clearedKeys` and `outputIds`. The translation layer would
 * have been larger than the product itself, so the product lives here, beside the rows it
 * makes. `crossBatches` stays where it belongs, on the StudioCanvas Batch node.
 *
 * The cap is checked BEFORE anything is built, and that ordering is the whole point: the AI
 * path proposes rows by calling a model, so a 3x4x5 request that cannot be saved must be
 * refused before it is paid for, not after. `resolveForgeRenderSetRows` would refuse the
 * result anyway — one row too late.
 */
export function crossForgeRenderSetRows(args: {
  axes: readonly ForgeRenderSetAxis[];
  /** Rows already in the set. The product has to fit ALONGSIDE them, not instead of them. */
  existingRowCount: number;
  /** The row every generated row forks from, or null for roots. */
  parentId?: string | null;
  /** Ids are the caller's to mint — this module has no randomness of its own. */
  id: (index: number) => string;
  label?: (combination: ReadonlyArray<{ key: string; value: string }>) => string;
}): ForgeRenderSetRow[] {
  const axes = args.axes.filter((axis) => axis.values.length > 0);
  if (axes.length < 2) {
    throw new Error('render_set_cross_needs_two_axes');
  }
  const total = axes.reduce((count, axis) => count * axis.values.length, 1);
  if (args.existingRowCount + total > FORGE_RENDER_SET_MAX_ROWS) {
    throw new Error('render_set_rows_exceeded');
  }

  // Odometer over the axes, last axis moving fastest, so the output reads the way a person
  // writing the grid out by hand would: all the pictures for headline one, then headline two.
  const rows: ForgeRenderSetRow[] = [];
  for (let index = 0; index < total; index += 1) {
    let remainder = index;
    const combination: Array<{ key: string; value: string }> = [];
    for (let axisIndex = axes.length - 1; axisIndex >= 0; axisIndex -= 1) {
      const axis = axes[axisIndex]!;
      const value = axis.values[remainder % axis.values.length]!;
      remainder = Math.floor(remainder / axis.values.length);
      combination.unshift({ key: axis.key, value });
    }
    rows.push({
      id: args.id(index),
      parentId: args.parentId ?? null,
      label: args.label
        ? args.label(combination)
        : combination.map((part) => part.value).join(' · ').slice(0, 200),
      overrides: Object.fromEntries(combination.map((part) => [part.key, part.value])),
      clearedKeys: [],
      outputIds: [],
    });
  }
  return rows;
}
