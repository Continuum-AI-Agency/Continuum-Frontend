'use client';

// A template table: row labels, then one figure per cell by id. A cell with no figure prints
// "—" rather than an empty string, so a gap reads as a gap.

import type { TemplateFigure, TemplateTable } from '@continuum/contracts';
import { FigureById } from './Figure';

export function TemplateTableView({
  table,
  figures,
}: {
  table: TemplateTable;
  figures: ReadonlyArray<TemplateFigure>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs tabular-nums">
        <thead>
          <tr className="border-b border-border/60 text-muted-foreground">
            <th className="px-2 py-1.5 text-left font-medium" />
            {table.columns.map((column) => (
              <th key={column.key} className="px-2 py-1.5 text-right font-medium">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={`${row.label}-${row.entity_id ?? ''}`} className="border-b border-border/40">
              <td className="whitespace-nowrap px-2 py-1.5 text-foreground">{row.label}</td>
              {table.columns.map((column) => (
                <td key={column.key} className="px-2 py-1.5 text-right">
                  {row.cells[column.key] ? (
                    <FigureById figures={figures} id={row.cells[column.key]} className="font-normal" />
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
