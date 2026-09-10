'use client';

import type { ApiRenderVariableKind } from '@continuum/contracts';
import { type ColumnDef, flexRender, type Table as TanTable } from '@tanstack/react-table';
import {
  Hash,
  ImageIcon,
  List,
  Lock,
  type LucideIcon,
  Palette,
  ToggleLeft,
  Type,
  Video,
} from 'lucide-react';
import type { ClipboardEventHandler, ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

// The one grid both Forge tables draw through: dense rows, a sticky typed header, a checkbox
// gutter. It is a rendering of a react-table instance and holds no state of its own — the
// caller owns columns, sorting and selection, which is what keeps it at ninety lines.
//
// Deliberately in components/forge, not components/ui: two callers is not a design system.

/** The icon a column header carries for a variable kind — the "typed column" of the reference grid. */
export const KIND_ICONS: Record<ApiRenderVariableKind | 'reserved', LucideIcon> = {
  text: Type,
  number: Hash,
  boolean: ToggleLeft,
  enum: List,
  image: ImageIcon,
  video: Video,
  color: Palette,
  reserved: Lock,
};

/** The checkbox gutter. Header toggles the page, cell toggles the row. */
export function selectColumn<T>(): ColumnDef<T> {
  return {
    id: 'select',
    size: 32,
    enableSorting: false,
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all"
        checked={
          table.getIsAllPageRowsSelected()
            ? true
            : table.getIsSomePageRowsSelected()
              ? 'indeterminate'
              : false
        }
        onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked === true)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        onCheckedChange={(checked) => row.toggleSelected(checked === true)}
      />
    ),
  };
}

export function DataGrid<T>({
  table,
  empty,
  onPaste,
  onRowClick,
  groupHeader,
  className,
}: {
  table: TanTable<T>;
  empty: ReactNode;
  onPaste?: ClipboardEventHandler<HTMLDivElement>;
  onRowClick?: (row: T) => void;
  /** One spanning line above the rows — "3 renders • 2 finished". */
  groupHeader?: ReactNode;
  className?: string;
}) {
  const rows = table.getRowModel().rows;
  const width = table.getAllLeafColumns().length;
  return (
    <div className={cn('overflow-auto rounded-lg border bg-card', className)} onPaste={onPaste}>
      <Table className="text-xs">
        <TableHeader className="sticky top-0 z-10 bg-card">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => (
                <TableHead
                  key={header.id}
                  style={header.getSize() !== 150 ? { width: header.getSize() } : undefined}
                  className="h-8 whitespace-nowrap text-2xs font-medium text-muted-foreground"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {groupHeader && rows.length > 0 ? (
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableCell colSpan={width} className="h-7 py-0 text-2xs text-muted-foreground">
                {groupHeader}
              </TableCell>
            </TableRow>
          ) : null}
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={width} className="h-24 text-center text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? 'selected' : undefined}
                className={cn('h-9', onRowClick && 'cursor-pointer')}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="py-1 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
