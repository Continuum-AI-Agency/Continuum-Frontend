'use client';

// A template table: row labels, then one figure per cell by id. A cell with no figure prints
// "—" rather than an empty string, so a gap reads as a gap. The same table as
// `DataTableBlock` (`JAINA_TABLE`): a templated answer's evidence is not a smaller table.

import type { TemplateFigure, TemplateTable } from '@continuum/contracts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { JAINA_TABLE } from '../reading';
import { FigureById } from './Figure';

export function TemplateTableView({
  table,
  figures,
}: {
  table: TemplateTable;
  figures: ReadonlyArray<TemplateFigure>;
}) {
  return (
    <Table className={JAINA_TABLE.table}>
      <TableHeader>
        <TableRow className={JAINA_TABLE.headRow}>
          <TableHead className={cn(JAINA_TABLE.th, 'text-left')} />
          {table.columns.map((column) => (
            <TableHead key={column.key} className={cn(JAINA_TABLE.th, 'text-right')}>
              {column.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {table.rows.map((row) => (
          <TableRow key={`${row.label}-${row.entity_id ?? ''}`} className={JAINA_TABLE.row}>
            <TableCell className={cn(JAINA_TABLE.td, 'whitespace-nowrap text-foreground')}>
              {row.label}
            </TableCell>
            {table.columns.map((column) => (
              <TableCell key={column.key} className={cn(JAINA_TABLE.td, 'text-right')}>
                {row.cells[column.key] ? (
                  <FigureById
                    figures={figures}
                    id={row.cells[column.key]}
                    className="font-normal"
                  />
                ) : (
                  '—'
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
