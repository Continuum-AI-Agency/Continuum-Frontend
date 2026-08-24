import { z } from 'zod';

// The `batch` node's payload and the two ways two batches combine.
//
// A batch materializes a COLLECTION at runtime; it is not a new port data type.
// `StudioPortDataType` stays the item modality on purpose (Canvas V3 design B):
// collection-ness is the shape of a node's output, and widening the port type would
// make every existing compatibility rule ambiguous. The modality lock rides
// `node.data.itemType` instead.

/** The ceiling on one batch, and on a cross product. Enforced in contracts AND at run
 *  time: 100 generations is already a real spend, and a 40×40 cross is 1600. */
export const MAX_BATCH_ITEMS = 100;

export const BATCH_ITEM_KINDS = ['text', 'image', 'video'] as const;
export type BatchItemKind = (typeof BATCH_ITEM_KINDS)[number];

export const batchItemSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(BATCH_ITEM_KINDS),
    /** Text items carry their value inline. */
    value: z.string().optional(),
    /** Media items carry a library asset id, a URL, or both. */
    assetId: z.string().optional(),
    url: z.string().optional(),
    label: z.string().optional(),
  })
  .refine((item) => (item.kind === 'text' ? typeof item.value === 'string' : true), {
    message: 'a text batch item needs a value',
    path: ['value'],
  })
  .refine((item) => (item.kind === 'text' ? true : Boolean(item.assetId ?? item.url)), {
    message: 'a media batch item needs an assetId or a url',
    path: ['assetId'],
  });

export type BatchItem = z.infer<typeof batchItemSchema>;

export const batchItemsSchema = z.array(batchItemSchema).max(MAX_BATCH_ITEMS);

export const BATCH_COMBINE_MODES = ['zip', 'cross'] as const;
export type BatchCombine = (typeof BATCH_COMBINE_MODES)[number];

export interface BatchPair {
  readonly left: BatchItem;
  readonly right: BatchItem;
}

export interface BatchCombineResult {
  readonly pairs: readonly BatchPair[];
  /** True when the cap cut the result short. Reported rather than silent: a quiet
   *  truncation reads downstream as "everything ran". */
  readonly truncated: boolean;
}

/** Position-wise pairing. The shorter list decides the length — pairing past it would
 *  invent an item that the user never put in the batch. */
export function zipBatches(
  left: readonly BatchItem[],
  right: readonly BatchItem[],
): BatchCombineResult {
  const length = Math.min(left.length, right.length, MAX_BATCH_ITEMS);
  const pairs: BatchPair[] = [];
  for (let index = 0; index < length; index += 1) {
    pairs.push({ left: left[index], right: right[index] });
  }
  return { pairs, truncated: Math.min(left.length, right.length) > length };
}

/** Every left against every right, row-major, capped. */
export function crossBatches(
  left: readonly BatchItem[],
  right: readonly BatchItem[],
): BatchCombineResult {
  const pairs: BatchPair[] = [];
  for (const leftItem of left) {
    for (const rightItem of right) {
      if (pairs.length >= MAX_BATCH_ITEMS) {
        return { pairs, truncated: true };
      }
      pairs.push({ left: leftItem, right: rightItem });
    }
  }
  return { pairs, truncated: false };
}

export function combineBatches(
  mode: BatchCombine,
  left: readonly BatchItem[],
  right: readonly BatchItem[],
): BatchCombineResult {
  return mode === 'cross' ? crossBatches(left, right) : zipBatches(left, right);
}

/** The item kind a batch is locked to. Explicit `data.itemType` wins; otherwise the
 *  first item decides, which is the same rule the UI shows the user. */
export function batchItemType(
  data: Record<string, unknown> | undefined,
): BatchItemKind | undefined {
  const declared = data?.itemType;
  if (typeof declared === 'string' && (BATCH_ITEM_KINDS as readonly string[]).includes(declared)) {
    return declared as BatchItemKind;
  }
  const items = data?.items;
  if (!Array.isArray(items)) return undefined;
  const first = items[0] as { kind?: unknown } | undefined;
  return typeof first?.kind === 'string' &&
    (BATCH_ITEM_KINDS as readonly string[]).includes(first.kind)
    ? (first.kind as BatchItemKind)
    : undefined;
}
