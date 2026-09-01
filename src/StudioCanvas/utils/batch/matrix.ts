// Where a fan-out result lands in the results grid.
//
// The mapping is not cosmetic: it has to agree, cell for cell, with the order
// `crossBatches` produces its pairs in (contracts, row-major over the LEFT batch). A
// matrix that disagrees hangs the right picture under the wrong pair of thumbnails and
// looks perfectly plausible while doing it.

import type { BatchCombine, BatchItem } from '@continuum/contracts';
import { MAX_BATCH_ITEMS } from '@continuum/contracts';

import type { NodeOutput } from '../../types/execution';
import { batchItemLabel } from './addItems';
import type { BatchAxisEntry, BatchRunRecord } from './generationFanout';

export interface MatrixAxisEntry {
  readonly index: number;
  readonly label: string;
  readonly item: BatchItem;
}

export interface MatrixCell {
  readonly pairIndex: number;
  /** The generated output, or null when that item failed or has not run yet. */
  readonly output: NodeOutput | null;
  /** True when the 100-item cap meant this cell was never run. */
  readonly capped: boolean;
}

export interface MatrixLayout {
  readonly combine: BatchCombine;
  readonly rows: MatrixAxisEntry[];
  /** Empty for a single batch — the grid is then one column of results. */
  readonly cols: MatrixAxisEntry[];
  cellAt(row: number, col: number): MatrixCell | undefined;
}

const axis = (items: readonly BatchItem[]): MatrixAxisEntry[] =>
  items.map((item, index) => ({ index, label: batchItemLabel(item, index), item }));

export interface BatchMatrixParams {
  readonly combine: BatchCombine;
  readonly left: readonly BatchItem[];
  readonly right?: readonly BatchItem[];
  /** One slot per pair, in pair order. `null` where that item failed. */
  readonly outputs: readonly (NodeOutput | null)[];
}

/**
 * The grid for a finished (or running) batch fan-out.
 *
 * - `cross` fills row-major over the left batch, matching `crossBatches`.
 * - `zip` pairs position-wise, so ONLY the diagonal exists. It is rendered as a single
 *   column rather than a mostly-empty square, because a grid of blanks reads as failure.
 * - a single batch is one column, one row per item.
 */
export function batchMatrix(params: BatchMatrixParams): MatrixLayout {
  const { combine, left, outputs } = params;
  const right = params.right ?? [];
  const paired = right.length > 0;

  const rows = axis(left);
  // `zip` stops at the shorter list — pairing past it would invent an item nobody added.
  const zipLength = Math.min(left.length, right.length);
  const cols = paired && combine === 'cross' ? axis(right) : [];

  const cellFor = (pairIndex: number): MatrixCell => ({
    pairIndex,
    output: outputs[pairIndex] ?? null,
    capped: pairIndex >= MAX_BATCH_ITEMS,
  });

  return {
    combine,
    rows: paired && combine === 'zip' ? rows.slice(0, zipLength) : rows,
    cols,
    cellAt(row: number, col: number): MatrixCell | undefined {
      if (row < 0 || row >= left.length) return undefined;

      if (paired && combine === 'cross') {
        if (col < 0 || col >= right.length) return undefined;
        return cellFor(row * right.length + col);
      }

      // zip and the single-batch case are both one column wide.
      if (col !== 0) return undefined;
      if (paired && row >= zipLength) return undefined;
      return cellFor(row);
    },
  };
}

/** The label a paired cell carries — the same `left × right` shape `materializeBatch` writes. */
export function matrixCellLabel(layout: MatrixLayout, row: number, col: number): string {
  const rowEntry = layout.rows[row];
  if (!rowEntry) return '';
  if (layout.cols.length === 0) return rowEntry.label;
  const colEntry = layout.cols[col];
  return colEntry ? `${rowEntry.label} × ${colEntry.label}` : rowEntry.label;
}

/**
 * The grid for a run that already finished, rebuilt from what the consuming node
 * persisted.
 *
 * The record deliberately stores axis headers flat (`{index, label, url}`) rather than
 * whole `BatchItem`s, so this rehydrates the minimum the layout needs. Reading the graph
 * instead would break the moment the batch node upstream was edited after the run — the
 * results belong to the inputs they were MADE from, not to whatever is wired now.
 */
export function matrixFromRunRecord(record: BatchRunRecord): MatrixLayout {
  const toItem = (entry: BatchAxisEntry): BatchItem => ({
    id: `axis-${entry.index}`,
    kind: record.itemType,
    url: entry.url,
    value: record.itemType === 'text' ? entry.label : undefined,
    label: entry.label,
  });

  const outputs: (NodeOutput | null)[] = [];
  for (const item of record.items) {
    outputs[item.pairIndex] =
      item.status === 'completed'
        ? item.text !== undefined
          ? { type: 'text', value: item.text }
          : {
              type: 'image',
              mimeType: item.mimeType ?? 'image/png',
              url: item.url,
              assetId: item.assetId,
            }
        : null;
  }

  return batchMatrix({
    combine: record.combine,
    left: record.left.map(toItem),
    right: record.right.length > 0 ? record.right.map(toItem) : undefined,
    outputs,
  });
}
