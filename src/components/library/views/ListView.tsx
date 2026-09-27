'use client';

import type { CustomField, LibrarySort, MediaAsset } from '@continuum/contracts';
import { ArrowDown, ArrowUp, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCustomFieldValue } from '@/lib/library/customFieldValue';
import { normalizeReviewStatus, REVIEW_STATUS_META } from '@/lib/library/reviewStatus';
import { formatBytes } from '../detail/assetFileMeta';
import { AssetThumb } from './AssetThumb';
import { formatDurationMs } from './cardOptions';
import {
  BUILT_IN_LIST_COLUMNS,
  builtInSortValue,
  type ListSort,
  listSortFromServer,
  nextListSort,
  type SortValue,
  serverSortFor,
  sortRows,
} from './listSort';
import type { FieldValuesByAsset } from './useAssetFieldValues';

const DATE_FORMAT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

function builtInCell(asset: MediaAsset, key: string): string {
  switch (key) {
    case 'name':
      return asset.title ?? asset.fileName;
    case 'kind':
      return asset.kind;
    case 'size':
      return asset.sizeBytes ? formatBytes(asset.sizeBytes) : '—';
    case 'duration':
      return formatDurationMs(asset.durationMs) ?? '—';
    case 'dimensions':
      return asset.width && asset.height ? `${asset.width} × ${asset.height}` : '—';
    case 'review':
      return REVIEW_STATUS_META[normalizeReviewStatus(asset.reviewStatus)].label;
    case 'created':
      return new Date(asset.createdAt).toLocaleDateString(undefined, DATE_FORMAT);
    case 'updated':
      return new Date(asset.updatedAt).toLocaleDateString(undefined, DATE_FORMAT);
    default:
      return '';
  }
}

export function ListView({
  assets,
  customFields,
  fieldValues,
  serverSort,
  onServerSort,
  onOpenDetail,
  selectedAssetIds,
  onToggleSelected,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
  emptyHint,
}: {
  assets: MediaAsset[];
  /** The custom fields the user chose to show, in column order. */
  customFields: CustomField[];
  fieldValues: FieldValuesByAsset;
  serverSort: LibrarySort;
  onServerSort: (sort: LibrarySort) => void;
  onOpenDetail: (asset: MediaAsset) => void;
  selectedAssetIds: ReadonlySet<string>;
  onToggleSelected: (asset: MediaAsset) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  emptyHint?: string;
}) {
  const [clientSort, setClientSort] = useState<ListSort | null>(null);
  const activeSort = clientSort ?? listSortFromServer(serverSort);

  const fieldById = new Map(customFields.map((field) => [field.id, field]));
  const customCell = (asset: MediaAsset, fieldId: string): string => {
    const field = fieldById.get(fieldId);
    const value = fieldValues.get(asset.id)?.get(fieldId);
    return field && value !== undefined ? formatCustomFieldValue(field, value) : '';
  };
  const sortValue = (asset: MediaAsset, key: string): SortValue =>
    fieldById.has(key) ? customCell(asset, key).toLocaleLowerCase() : builtInSortValue(asset, key);

  // ponytail: a client-side sort orders only the loaded page(s); a server sort per
  // column (and per custom field) if users need whole-library ordering here.
  const rows = clientSort
    ? sortRows(assets, (asset) => sortValue(asset, clientSort.key), clientSort.direction)
    : assets;

  const onHeaderClick = (key: string) => {
    const next = nextListSort(activeSort, key);
    const server = serverSortFor(next);
    if (server) {
      setClientSort(null);
      onServerSort(server);
    } else {
      setClientSort(next);
    }
  };

  const columns = [
    ...BUILT_IN_LIST_COLUMNS,
    ...customFields.map((field) => ({ key: field.id, label: field.name })),
  ];

  if (assets.length === 0) {
    return (
      <div
        data-testid="library-list-view"
        className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground"
      >
        {emptyHint ?? 'No media yet.'}
      </div>
    );
  }

  return (
    <div data-testid="library-list-view" className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border border-border/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <span className="sr-only">Select</span>
              </TableHead>
              <TableHead className="w-14">
                <span className="sr-only">Thumbnail</span>
              </TableHead>
              {columns.map((column) => {
                const direction = activeSort?.key === column.key ? activeSort.direction : null;
                const sortState = direction
                  ? direction === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none';
                return (
                  <TableHead
                    key={column.key}
                    aria-sort={sortState}
                  >
                    <button
                      type="button"
                      data-testid={`library-list-sort-${column.key}`}
                      // aria-sort is only valid on the header cell; the bench reads this mirror.
                      data-sort={sortState}
                      onClick={() => onHeaderClick(column.key)}
                      className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                    >
                      {column.label}
                      {direction === 'asc' ? (
                        <ArrowUp className="size-3" aria-hidden />
                      ) : direction === 'desc' ? (
                        <ArrowDown className="size-3" aria-hidden />
                      ) : null}
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((asset) => {
              const selected = selectedAssetIds.has(asset.id);
              return (
                <TableRow
                  key={asset.id}
                  data-testid="library-list-row"
                  data-asset-id={asset.id}
                  data-state={selected ? 'selected' : undefined}
                  className="cursor-pointer"
                  onClick={() => onOpenDetail(asset)}
                >
                  {/* biome-ignore lint/a11y/useKeyWithClickEvents: the click only stops the row from opening; the checkbox itself is the keyboard control */}
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => onToggleSelected(asset)}
                      aria-label={`${selected ? 'Deselect' : 'Select'} ${asset.title ?? asset.fileName}`}
                    />
                  </TableCell>
                  <TableCell>
                    <AssetThumb asset={asset} />
                  </TableCell>
                  {BUILT_IN_LIST_COLUMNS.map((column) =>
                    column.key === 'name' ? (
                      <TableCell key={column.key} className="max-w-72 font-medium">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenDetail(asset);
                          }}
                          className="block max-w-full truncate text-left hover:underline"
                        >
                          {builtInCell(asset, column.key)}
                        </button>
                      </TableCell>
                    ) : (
                      <TableCell key={column.key} className="tabular-nums text-muted-foreground">
                        {builtInCell(asset, column.key)}
                      </TableCell>
                    ),
                  )}
                  {customFields.map((field) => (
                    <TableCell key={field.id} className="max-w-48 truncate text-muted-foreground">
                      {customCell(asset, field.id) || '—'}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {onLoadMore && hasMore ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-center"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {loadingMore ? <Loader2 className="size-4 animate-spin" /> : null}
          Load more
        </Button>
      ) : null}
    </div>
  );
}
