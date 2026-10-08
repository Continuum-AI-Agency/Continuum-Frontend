'use client';

// A template table: row labels, then one figure per cell by id. A cell with no figure prints
// "—" rather than an empty string, so a gap reads as a gap. The same table as
// `DataTableBlock` (`JAINA_TABLE`): a templated answer's evidence is not a smaller table.

import type { TemplateFigure, TemplateTable } from '@continuum/contracts';
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
    <div className={JAINA_TABLE.wrap}>
      <table className={JAINA_TABLE.table}>
        <thead>
          <tr className={JAINA_TABLE.headRow}>
            <th className={cn(JAINA_TABLE.th, 'text-left')} />
            {table.columns.map((column) => (
              <th key={column.key} className={cn(JAINA_TABLE.th, 'text-right')}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={`${row.label}-${row.entity_id ?? ''}`} className={JAINA_TABLE.row}>
              <td className={cn(JAINA_TABLE.td, 'whitespace-nowrap text-foreground')}>
                {row.label}
              </td>
              {table.columns.map((column) => (
                <td key={column.key} className={cn(JAINA_TABLE.td, 'text-right')}>
                  {row.cells[column.key] ? (
                    <FigureById
                      figures={figures}
                      id={row.cells[column.key]}
                      className="font-normal"
                    />
                  ) : (
                    '—'
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
