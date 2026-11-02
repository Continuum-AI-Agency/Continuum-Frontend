// One table shape for every breakdown: a header row, numeric columns right-aligned in
// tabular figures, and horizontal scroll inside the block on a phone instead of a page that
// scrolls sideways.

import type { ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type Column<Row> = {
  header: string;
  numeric?: boolean;
  cell: (row: Row) => ReactNode;
};

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  emptyMessage,
}: {
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row, index: number) => string;
  caption: string;
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <p className="py-4 text-center text-xs text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <Table aria-label={caption} className="text-xs">
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead
              className={cn(
                'h-8 whitespace-nowrap text-xs font-semibold text-muted-foreground',
                column.numeric && 'text-right',
              )}
              key={column.header}
            >
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={rowKey(row, index)}>
            {columns.map((column) => (
              <TableCell
                className={cn(
                  'py-1.5 align-top',
                  column.numeric && 'whitespace-nowrap text-right font-mono tabular-nums',
                )}
                key={column.header}
              >
                {column.cell(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** A value with an inline bar, for one column the eye should compare down the table. */
export function BarCell({
  value,
  max,
  text,
  color,
}: {
  value: number | null;
  max: number;
  text: string;
  color: string;
}) {
  const width = max > 0 && value != null ? Math.min(100, (100 * value) / max) : 0;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full"
          style={{ width: `${width}%`, background: color }}
        />
      </span>
      {text}
    </span>
  );
}
