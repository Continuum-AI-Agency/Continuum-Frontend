// Every result of a fan-out, laid out the way the person asked for it.
//
// The grid is not a gallery: a cell's POSITION is its claim about which pair produced it,
// so the layout comes from `batchMatrix` — the one place that agrees, cell for cell, with
// the order `crossBatches` emits pairs in. Re-deriving the arithmetic here would hang the
// right picture under the wrong pair of thumbnails and look perfectly plausible doing it.
//
// The two non-results are named rather than blanked. A cell the 100 cap never ran and a
// cell that failed are different facts, and an empty square says neither.

import { MAX_BATCH_ITEMS } from '@continuum/contracts';
import { Download, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { NodeOutput } from '../../types/execution';
import type { MatrixAxisEntry, MatrixCell, MatrixLayout } from '../../utils/batch/matrix';
import { matrixCellLabel } from '../../utils/batch/matrix';
import { buildDataUrl } from '../../utils/dataUrl';
import { downloadAsset } from '../../utils/downloadAsset';

interface CellPreview {
  readonly kind: 'image' | 'video' | 'text';
  readonly src?: string;
  readonly text?: string;
}

const imageSrc = (item: { url?: string; base64?: string; mimeType?: string }): string | undefined =>
  item.url ?? (item.base64 ? buildDataUrl(item.mimeType ?? 'image/png', item.base64) : undefined);

function previewOf(output: NodeOutput): CellPreview | null {
  switch (output.type) {
    case 'text':
      return { kind: 'text', text: output.value };
    case 'image':
      return { kind: 'image', src: imageSrc(output) };
    // A variation run inside a batch cell: the first variation is the cell's result, the
    // same one an edge with no `sourceHandle` would consume.
    case 'images':
      return output.items[0] ? { kind: 'image', src: imageSrc(output.items[0]) } : null;
    case 'video':
      return { kind: 'video', src: output.url };
    default:
      return null;
  }
}

function AxisHeader({ entry }: { entry: MatrixAxisEntry }) {
  const url = entry.item.url;
  return (
    <div className="flex items-center gap-1.5">
      {url && entry.item.kind === 'image' ? (
        <img src={url} alt="" className="size-8 shrink-0 rounded object-cover" />
      ) : null}
      {url && entry.item.kind === 'video' ? (
        <video src={url} preload="metadata" muted className="size-8 shrink-0 rounded bg-black">
          <track kind="captions" />
        </video>
      ) : null}
      <span className="max-w-[10rem] truncate text-xs font-medium">{entry.label}</span>
    </div>
  );
}

function CellBody({ preview }: { preview: CellPreview }) {
  if (preview.kind === 'text') {
    return (
      <p className="line-clamp-6 p-2 text-left text-[11px] leading-snug whitespace-pre-wrap">
        {preview.text}
      </p>
    );
  }
  if (!preview.src) return <span className="text-[11px] text-muted-foreground">no preview</span>;
  if (preview.kind === 'video') {
    return (
      <video src={preview.src} preload="metadata" muted className="size-full object-cover">
        <track kind="captions" />
      </video>
    );
  }
  return <img src={preview.src} alt="" className="size-full object-cover" />;
}

interface MatrixResultsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  layout: MatrixLayout;
}

export function MatrixResultsDialog({
  open,
  onOpenChange,
  title,
  layout,
}: MatrixResultsDialogProps) {
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);

  const columns = layout.cols.length > 0 ? layout.cols : null;
  const columnCount = columns?.length ?? 1;
  const selectedCell: MatrixCell | undefined = selected
    ? layout.cellAt(selected.row, selected.col)
    : undefined;
  const selectedPreview =
    selectedCell?.output && !selectedCell.capped ? previewOf(selectedCell.output) : null;

  const renderCell = (row: number, col: number) => {
    const cell = layout.cellAt(row, col);
    const label = matrixCellLabel(layout, row, col);

    if (!cell || cell.capped) {
      return (
        <span className="text-[11px] text-muted-foreground">
          {cell ? `not run (${MAX_BATCH_ITEMS} cap)` : ''}
        </span>
      );
    }
    if (!cell.output) return <span className="text-[11px] text-destructive">failed</span>;

    const preview = previewOf(cell.output);
    if (!preview) return <span className="text-[11px] text-muted-foreground">no preview</span>;

    return (
      <>
        <button
          type="button"
          aria-label={`Open ${label}`}
          className="block size-full cursor-zoom-in"
          onClick={() => setSelected({ row, col })}
        >
          <CellBody preview={preview} />
        </button>
        {preview.src ? (
          <Button
            variant="secondary"
            size="icon"
            className="absolute top-1 right-1 z-10 size-6 border border-border/70 bg-background/90 opacity-0 shadow-sm transition-opacity group-hover/cell:opacity-90 hover:opacity-100"
            title={`Download ${label}`}
            aria-label={`Download ${label}`}
            onClick={() =>
              downloadAsset({
                data: preview.src,
                baseName: `batch-${row + 1}-${col + 1}`,
                fallbackExtension: 'png',
              })
            }
          >
            <Download className="size-3" />
          </Button>
        ) : null}
      </>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="md:left-[var(--app-sidebar-width,3.5rem)]"
        className="top-4 right-4 bottom-4 left-4 z-50 flex h-auto max-h-none w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-xl border border-border/60 p-0 shadow-2xl sm:max-w-none md:left-[calc(var(--app-sidebar-width,3.5rem)+1rem)]"
      >
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 px-4 py-3 text-left">
          <div className="flex flex-col gap-0.5">
            <DialogTitle className="text-base">{title ?? 'Batch results'}</DialogTitle>
            <DialogDescription className="text-xs">
              {layout.rows.length} × {columnCount} · {layout.combine}
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Close results"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-3.5" />
          </Button>
        </DialogHeader>

        <div className="relative min-h-0 flex-1">
          {/* The grid scrolls inside its own box: a wide cross product must never make the
              page itself scroll sideways. */}
          <div data-testid="batch-matrix" className="size-full overflow-auto">
            <table className="border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-30 border-r border-b border-border/60 bg-background p-2" />
                  {columns ? (
                    columns.map((entry) => (
                      <th
                        key={entry.item.id}
                        scope="col"
                        className="sticky top-0 z-20 border-b border-border/60 bg-background p-2 text-left"
                      >
                        <AxisHeader entry={entry} />
                      </th>
                    ))
                  ) : (
                    <th
                      scope="col"
                      className="sticky top-0 z-20 border-b border-border/60 bg-background p-2 text-left text-xs font-medium"
                    >
                      Result
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {layout.rows.map((entry, row) => (
                  <tr key={entry.item.id} data-testid="batch-matrix-row">
                    <th
                      scope="row"
                      className="sticky left-0 z-20 border-r border-b border-border/60 bg-background p-2 text-left"
                    >
                      <AxisHeader entry={entry} />
                    </th>
                    {Array.from({ length: columnCount }, (_unused, col) => (
                      <td
                        key={`${entry.item.id}:${columns?.[col]?.item.id ?? 'single'}`}
                        data-testid="batch-matrix-cell"
                        className="group/cell relative size-40 border-r border-b border-border/60 bg-muted/20 p-0 text-center align-middle"
                      >
                        {renderCell(row, col)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* One large view of one cell. An overlay panel rather than a nested Dialog: two
              stacked modals fight over focus and the outer one closes with the inner. */}
          {selected ? (
            <div
              data-testid="batch-matrix-single"
              className="absolute inset-0 z-40 flex flex-col bg-background/95"
            >
              <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
                <span className="truncate text-sm font-medium">
                  {matrixCellLabel(layout, selected.row, selected.col)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Back to the grid"
                  onClick={() => setSelected(null)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
                {selectedPreview ? (
                  selectedPreview.kind === 'text' ? (
                    <p className="max-w-3xl text-sm leading-relaxed whitespace-pre-wrap">
                      {selectedPreview.text}
                    </p>
                  ) : selectedPreview.kind === 'video' ? (
                    <video
                      src={selectedPreview.src}
                      controls
                      className="max-h-full max-w-full rounded"
                    >
                      <track kind="captions" />
                    </video>
                  ) : (
                    <img
                      src={selectedPreview.src}
                      alt=""
                      className="max-h-full max-w-full rounded object-contain"
                    />
                  )
                ) : (
                  <span className="text-sm text-muted-foreground">Nothing to show</span>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
