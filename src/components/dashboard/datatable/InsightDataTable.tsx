'use client';

import { ArrowDown, ArrowUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Fragment, type ReactNode, useMemo, useState } from 'react';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type InsightColumn<T> = {
  id: string;
  header: ReactNode;
  align?: 'left' | 'right';
  headerClassName?: string;
  cellClassName?: string;
  // Providing a comparable makes the column sortable.
  sortValue?: (row: T) => number | string;
  cell: (row: T) => ReactNode;
};

type SortState = { columnId: string; direction: 'asc' | 'desc' };

export type InsightDataTableProps<T> = {
  rows: T[];
  columns: InsightColumn<T>[];
  getRowId: (row: T) => string;
  title?: string;
  metricLabel?: string;
  // Optional right-aligned control in the title bar (e.g. a "view all" link).
  headerAction?: ReactNode;
  defaultSort?: SortState;
  // Right-click menu items for a row (a ContextMenuItem list).
  contextMenu?: (row: T) => ReactNode;
  // Click-to-expand detail (the per-row insight surface).
  expandedContent?: (row: T) => ReactNode;
  // Always-present trailing actions cell (e.g. a tap-friendly dropdown).
  rowActions?: (row: T) => ReactNode;
  isLoading?: boolean;
  emptyState?: ReactNode;
  className?: string;
  // Cap the table height and scroll the body vertically (header stays pinned).
  // Omit to let the table grow with its rows.
  maxHeight?: number | string;
};

const ROW_CLASS =
  'group border-b border-border/50 transition-colors hover:bg-muted/40 last:border-b-0';

function nextSort(prev: SortState | null, columnId: string): SortState {
  if (prev?.columnId === columnId) {
    return { columnId, direction: prev.direction === 'desc' ? 'asc' : 'desc' };
  }
  return { columnId, direction: 'desc' };
}

function compare(a: number | string, b: number | string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function InsightDataTable<T>({
  rows,
  columns,
  getRowId,
  title,
  metricLabel,
  headerAction,
  defaultSort,
  contextMenu,
  expandedContent,
  rowActions,
  isLoading = false,
  emptyState,
  className,
  maxHeight,
}: InsightDataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(defaultSort ?? null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((col) => col.id === sort.columnId);
    if (!column?.sortValue) return rows;
    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort(
      (a, b) => compare(column.sortValue!(a), column.sortValue!(b)) * direction,
    );
  }, [rows, columns, sort]);

  const totalColumns = columns.length + (rowActions ? 1 : 0) + (expandedContent ? 1 : 0);

  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden rounded-lg border border-border/70 bg-card',
        className,
      )}
    >
      <SectionHeader
        title={title}
        meta={
          metricLabel ? (
            <p className="font-mono text-2xs uppercase tracking-wide text-muted-foreground">
              {metricLabel}
            </p>
          ) : null
        }
        action={headerAction}
      />

      <Table
        containerClassName={cn(maxHeight != null && 'overflow-y-auto')}
        containerStyle={maxHeight != null ? { maxHeight } : undefined}
      >
        <TableHeader className="sticky top-0 z-10 bg-card [&_tr]:border-border/70">
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => {
              const sortable = Boolean(column.sortValue);
              const active = sort?.columnId === column.id;
              const SortIcon = !active
                ? ChevronsUpDown
                : sort?.direction === 'asc'
                  ? ArrowUp
                  : ArrowDown;
              return (
                <TableHead
                  key={column.id}
                  aria-sort={
                    active ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                  className={cn(
                    'h-8 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground',
                    column.align === 'right' && 'text-right',
                    column.headerClassName,
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => setSort((prev) => nextSort(prev, column.id))}
                      className={cn(
                        'inline-flex items-center gap-1 transition-colors hover:text-foreground',
                        column.align === 'right' && 'flex-row-reverse',
                        active && 'text-foreground',
                      )}
                    >
                      {column.header}
                      <SortIcon className="size-3" aria-hidden="true" />
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              );
            })}
            {rowActions ? <TableHead className="h-8 w-10 px-2" aria-label="Actions" /> : null}
            {expandedContent ? <TableHead className="h-8 w-9 px-2" aria-label="Expand" /> : null}
          </TableRow>
        </TableHeader>

        <TableBody>
          {isLoading ? (
            <LoadingRows columns={totalColumns} />
          ) : sortedRows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={totalColumns}
                className="px-3 py-6 text-center text-xs text-muted-foreground"
              >
                {emptyState ?? 'Nothing here yet.'}
              </TableCell>
            </TableRow>
          ) : (
            sortedRows.map((row) => {
              const id = getRowId(row);
              const expandable = Boolean(expandedContent);
              const isExpanded = expandedId === id;

              const cells = (
                <>
                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      className={cn(
                        'px-3 py-2.5 text-sm',
                        column.align === 'right' && 'text-right font-mono tabular-nums',
                        column.cellClassName,
                      )}
                    >
                      {column.cell(row)}
                    </TableCell>
                  ))}
                  {rowActions ? (
                    <TableCell
                      className="w-10 px-2 py-2.5 text-right"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {rowActions(row)}
                    </TableCell>
                  ) : null}
                  {expandable ? (
                    <TableCell className="w-9 px-2 py-2.5 text-right text-muted-foreground">
                      <ChevronDown
                        className={cn(
                          'size-4 transition-transform duration-200',
                          isExpanded && 'rotate-180',
                        )}
                        aria-hidden="true"
                      />
                    </TableCell>
                  ) : null}
                </>
              );

              const dataRow = (
                <tr
                  data-slot="table-row"
                  data-state={isExpanded ? 'selected' : undefined}
                  className={cn(ROW_CLASS, expandable && 'cursor-pointer')}
                  onClick={
                    expandable
                      ? () => setExpandedId((prev) => (prev === id ? null : id))
                      : undefined
                  }
                >
                  {cells}
                </tr>
              );

              return (
                <Fragment key={id}>
                  {contextMenu ? (
                    <ContextMenu>
                      <ContextMenuTrigger asChild>{dataRow}</ContextMenuTrigger>
                      <ContextMenuContent className="w-52">{contextMenu(row)}</ContextMenuContent>
                    </ContextMenu>
                  ) : (
                    dataRow
                  )}
                  {expandable && isExpanded ? (
                    <tr data-slot="table-row" className="bg-muted/20">
                      <td data-slot="table-cell" colSpan={totalColumns} className="px-4 pb-4 pt-2">
                        {expandedContent!(row)}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function LoadingRows({ columns }: { columns: number }) {
  return (
    <>
      {Array.from({ length: 4 }).map((_, rowIndex) => (
        <TableRow key={rowIndex} className="hover:bg-transparent">
          {Array.from({ length: columns }).map((__, cellIndex) => (
            <TableCell key={cellIndex} className="px-3 py-2.5">
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
