// The ONE writer into `BatchNodeData.items`.
//
// Five affordances feed a batch — connected upstream nodes, a multi-file upload, a CSV
// paste, a Library drag, and a split string — and each of them was a place the modality
// lock and the 100 cap could have been enforced differently. They are enforced here
// instead, once, so "one kind per batch" cannot mean five things.
//
// Refusals are RETURNED, never thrown and never silent: a batch that quietly dropped the
// video you dragged onto it is a batch that runs the wrong work and reports success.

import {
  type BatchItem,
  type BatchItemKind,
  batchItemType,
  MAX_BATCH_ITEMS,
} from '@continuum/contracts';

export const BATCH_KIND_LABEL: Readonly<Record<BatchItemKind, string>> = {
  text: 'text',
  image: 'images',
  video: 'videos',
};

export interface BatchItemsSource {
  readonly items?: BatchItem[];
  readonly itemType?: BatchItemKind | null;
}

export interface AddItemsResult {
  readonly items: BatchItem[];
  /** The kind the batch is now locked to — unchanged unless this add set it. */
  readonly itemType: BatchItemKind | null;
  readonly added: number;
  /** One human sentence per reason something was left out. Empty when everything landed. */
  readonly refused: string[];
}

/**
 * Appends `incoming` to a batch, honouring the modality lock and the cap.
 *
 * The lock comes from `batchItemType` — the same contracts rule the graph's `canConnect`
 * and the executor's `materializeBatch` read — so the UI cannot disagree with what the
 * run will actually do.
 */
export function addBatchItems(data: BatchItemsSource, incoming: BatchItem[]): AddItemsResult {
  const existing = data.items ?? [];
  const locked = batchItemType({ items: existing, itemType: data.itemType ?? undefined });
  const refused: string[] = [];

  // The first item decides, exactly as the contracts helper documents.
  const kind: BatchItemKind | null = locked ?? incoming[0]?.kind ?? null;

  const matching: BatchItem[] = [];
  const mismatched = new Map<BatchItemKind, number>();
  for (const item of incoming) {
    if (kind && item.kind !== kind) {
      mismatched.set(item.kind, (mismatched.get(item.kind) ?? 0) + 1);
      continue;
    }
    matching.push(item);
  }

  for (const [otherKind, count] of mismatched) {
    refused.push(
      `This batch holds ${BATCH_KIND_LABEL[kind as BatchItemKind]}. ` +
        `${count} ${BATCH_KIND_LABEL[otherKind]} item${count === 1 ? '' : 's'} can't join it — ` +
        'start a second batch instead.',
    );
  }

  const room = Math.max(0, MAX_BATCH_ITEMS - existing.length);
  const accepted = matching.slice(0, room);
  const overflow = matching.length - accepted.length;
  if (overflow > 0) {
    refused.push(
      `A batch holds at most ${MAX_BATCH_ITEMS} items — ${overflow} more ` +
        `${overflow === 1 ? 'was' : 'were'} not added.`,
    );
  }

  return {
    items: accepted.length > 0 ? [...existing, ...accepted] : existing,
    itemType: kind,
    added: accepted.length,
    refused,
  };
}

/** A short, human label for an item — what the matrix headers and the item list show. */
export function batchItemLabel(item: BatchItem, index: number): string {
  if (item.label?.trim()) return item.label.trim();
  if (item.kind === 'text') {
    const value = (item.value ?? '').trim().replace(/\s+/g, ' ');
    if (value) return value.length > 40 ? `${value.slice(0, 39)}…` : value;
  }
  return `Item ${index + 1}`;
}
